/**
 * BAFA-Automatik – Amina Lemzouri Ingenieurbüro
 * =============================================
 * Läuft in deinem Google-Konto (info@energieberatungmuenchen.com) alle 15 Minuten und erledigt
 * die Dateiarbeit, die über Claude nicht geht. Es SENDET NIE etwas an Kunden – es legt nur
 * Gmail-ENTWÜRFE an und speichert Dateien in Drive.
 *
 * Was es tut:
 *  1. Neues Beiblatt in einem Kundenordner
 *     → liest die Formularfelder, füllt die BAFA-Vollmacht aus, speichert sie als
 *       "<Nachname>_beg_formular_beg_vm.pdf" im Kundenordner und legt den Mail-Entwurf
 *       "benötigte Unterlagen" MIT Vollmacht im Anhang an (Steuer-ID wird angefragt, falls sie fehlt).
 *  2. Kunde schickt die unterschriebene Vollmacht per Mail
 *     → speichert den Anhang als "Vollmacht_<Nachname>_unterschrieben.pdf" im Kundenordner.
 *  3. Neuer Zuwendungsbescheid im Kundenordner
 *     → wartet, bis die Qonto-Bezahlt-Mail ("Ihre Rechnung … wurde bezahlt") für den Kunden da ist,
 *       dann Entwurf "Ihr Zuwendungsbescheid ist da" MIT Bescheid im Anhang.
 *  4. Kunde schickt nach dem Einbau Rechnung/Zahlungsbeleg/Beiblatt
 *     → legt "Unterlagen Verwendungsnachweis" im Kundenordner an und speichert alle Anhänge dort.
 *  5. Neuer Festsetzungsbescheid (Kundenordner oder Unterordner)
 *     → Entwurf "Festsetzungsbescheid - <Nachname>" MIT Bescheid im Anhang.
 *  6. Kundenliste (Google Sheet "1.BAFA-Vorgänge Übersicht" im Ordner Kunden): neue Kunden werden als Zeile
 *     eingetragen (inkl. Spalte "E-Mail"), Vollmacht/Zuwendung/Bezahlung/Bearbeitungsstand werden fortgeschrieben.
 *     Farben werden aus der Liste übernommen (Stand-Farben, rote Namen = offen, schwarz = bezahlt);
 *     Zahlungseingänge aus Qonto setzen das Datum in "Bezahlung".
 *  7. Adressprüfung über Google Maps (Straße, Hausnummer, PLZ, Ort) für Wohnort und Investitionsstandort;
 *     Fehler werden in Vollmacht/Liste korrigiert und als Kommentar ans Beiblatt geheftet
 *     (dafür links bei "Dienste" einmal "Drive API" hinzufügen).
 *  8. Lüftungskonzept (V69): Der Entwurf "benötigte Unterlagen" enthält einen Hinweis auf das Lüftungskonzept
 *     nach DIN 1946-6 mit deinem Angebot (Text und Preis oben unter LUEFTUNG_HINWEIS). Schreibt ein Kunde zurück und
 *     erwähnt dabei das Lüftungskonzept, bekommst du eine Hinweis-Mail.
 *  Probleme (Beiblatt nicht lesbar, Anrede unklar …) schickt es dir einmal täglich als Mail an dich selbst.
 *
 * Qonto-Rechnungsentwürfe macht weiterhin der tägliche Claude-Durchlauf (06:55 Uhr).
 *
 * EINRICHTUNG (ca. 10 Minuten)
 *  1. https://script.google.com → "Neues Projekt" → Name "BAFA-Automatik".
 *  2. Den Inhalt von Code.gs komplett durch diese Datei ersetzen, speichern.
 *  3. Oben im Menü Funktion "einrichten" auswählen → "Ausführen" → Berechtigungen erlauben
 *     (Drive, Gmail, externe Anfrage für die PDF-Bibliothek).
 *     "einrichten" merkt sich alle HEUTE vorhandenen Dateien als "schon erledigt", damit für alte
 *     Vorgänge keine Entwürfe entstehen, und startet den 15-Minuten-Takt.
 *  4. Optional testen: Funktion "testeBeiblatt" (liest ein Beiblatt) oder "testeAnrede" ausführen.
 *  Anrede: eingebaute Namenslisten + weltweites Vornamen-Wörterbuch (einmal "vornamenWeltweitLaden" ausführen).
 *  Abschalten: Funktion "ausschalten" ausführen.
 */

// ===================== KONFIGURATION =====================
const CFG = {
  KUNDEN_ORDNER_ID: '1ZCYCvTuIj3_CJ6ZQYtx65j3eatY-1S9B',
  VOLLMACHT_VORLAGE_ID: '1Juc84k0g6mZBZr7_VUIIUzLA8YflTavd', // 2_Neu/beg_formular_beg_vm.pdf
  UEBERSPRINGEN: [/^0_Archiv/i, /^1_Muster/i, /^2_Neu/i, /storniert/i],
  VN_ORDNER_NAME: 'Unterlagen Verwendungsnachweis',
  LABEL_ABGELEGT: 'BAFA-abgelegt',
  BEWERTUNGS_LINK: 'https://share.google/2tQYD8udDG7GjLpMM',
  PDF_LIB_URL: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  BEVOLLMAECHTIGT: {
    'Anrede_2': 'Frau', 'Vorname_2': 'Amina', 'Nachname_2': 'Lemzouri',
    'FirmennameInstitutionsname_2': 'Amina Lemzouri Ingenieurbüro',
    'Straße und Hausnummer_2': 'Winterthurer Str.8', 'Postleitzahl_2': '81476', 'Ort_2': 'München',
    'Telefon optional_2': '01715149446', 'EMailAdresse optional_2': 'info@energieberatungmuenchen.com'
  }
};

const SIGNATUR = [
  'Mit freundlichen Grüßen', '',
  'Amina Lemzouri', 'M. Sc. Energiemanagement', '',
  'Amina Lemzouri – Ingenieurbüro', 'Winterthurer Straße 8', '81476 München', '',
  'Mobil: +49 171 51 4944 6 oder 0175 52 0000 8', 'E-Mail: info@energieberatungmuenchen.com',
  'Web: www.energieberatungmuenchen.com und www.energieexpertemuenchen.de'
].join('\n');

// Satz am Ende der Mail zum Festsetzungsbescheid (V69: als Konstante, weil er "Lüftungskonzepte" enthält und beim
// Erkennen von Lüftungs-Anfragen aus zitierten Mails herausgefiltert wird)
const FESTSETZUNG_WEITERE_BERATUNG = 'Sofern Sie künftig eine Energieberatung für andere Projekte (Heizungstausch, Lüftungskonzepte, individuellen Sanierungsfahrplan, Wärmebrückenberechnung oder andere energetische Maßnahmen) benötigen, dürfen Sie sich gerne an uns wenden.';

// V69: Hinweis auf das Lüftungskonzept (DIN 1946-6) im Entwurf "benötigte Unterlagen" – dient dir auch als Nachweis,
// dass der Kunde VOR dem Fenstertausch darauf hingewiesen wurde. Text und Preis kannst du hier ändern.
// Der gleiche Hinweis steht (kürzer) in der Fußzeile der Qonto-Rechnung – die legt der Claude-Durchlauf an.
const LUEFTUNG_PREIS = '299 €';
const LUEFTUNG_HINWEIS = [
  'Hinweis zum Lüftungskonzept nach DIN 1946-6: Mit neuen Fenstern und Türen sparen Sie Energie und gewinnen spürbar an Wohnkomfort. Weil moderne Fenster sehr dicht schließen, findet jedoch kaum noch ein natürlicher Luftaustausch statt. Wird nicht ausreichend gelüftet, kann sich Feuchtigkeit in den Räumen sammeln und im ungünstigen Fall Schimmel entstehen. Nach DIN 1946-6 kann deshalb ein Lüftungskonzept erforderlich sein. Es zeigt, ob der natürliche Luftaustausch über die Gebäudehülle für den Feuchteschutz ausreicht oder ob lüftungstechnische Maßnahmen erforderlich sind, z. B. Fensterfalzlüfter oder Lüftungsgeräte.', '',
  'Das Lüftungskonzept ist nicht Bestandteil meines aktuellen Auftrags. Gerne erstelle ich es für Sie zum Sonderpreis von ' + LUEFTUNG_PREIS + ' inkl. MwSt. So haben Sie Sicherheit für ein gesundes Raumklima und schützen Ihre Investition langfristig. Wenn Sie das Lüftungskonzept wünschen, geben Sie mir einfach in Ihrer Antwort auf diese E-Mail kurz Bescheid.'
].join('\n');
// Kurzfassung in der Fußzeile der Qonto-Rechnung (nur zum Herausfiltern, falls ein Kunde sie zitiert)
const LUEFTUNG_HINWEIS_RECHNUNG = 'Hinweis Lüftungskonzept: Durch den Austausch von Fenstern und Türen wird Ihr Gebäude dichter. Nach DIN 1946-6 kann daher ein Lüftungskonzept erforderlich sein, um Feuchteschäden und Schimmel vorzubeugen. Dieses ist nicht Bestandteil des vorliegenden Auftrags. Gerne erstelle ich Ihnen das Lüftungskonzept zum Sonderpreis von ' + LUEFTUNG_PREIS + ' inkl. MwSt. – sprechen Sie mich einfach an.';

// Legt einen Gmail-Entwurf an – zusätzlich als HTML, damit Webseiten, E-Mail-Adressen und
// Telefonnummern beim Empfänger sicher anklickbar sind.
// Deine eigenen Adressen – nie als Kunden-E-Mail verwenden
const EIGENE_ADRESSE = /@(?:energieberatungmuenchen\.com|energieexpertemuenchen\.de)\s*>?$/i;
function eigeneAdresse_(e) { return EIGENE_ADRESSE.test(String(e || '').trim()); }

function entwurf_(an, betreff, text, optionen) {
  if (eigeneAdresse_(an)) throw new Error('Empfänger wäre deine eigene Adresse (' + an + ') – Kunden-E-Mail fehlt, Entwurf "' + betreff + '" nicht angelegt');
  const o = Object.assign({}, optionen || {});
  o.htmlBody = htmlMitLinks_(text);
  return GmailApp.createDraft(an, betreff, text, o);
}

function htmlMitLinks_(text) {
  let h = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
  h = h.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+?)([.,;:)]*)(?=\s|<|$)/gm,
    (m, vor, url, rest) => vor + '<a href="' + (/^https?:/.test(url) ? url : 'https://' + url) + '">' + url + '</a>' + rest);
  h = h.replace(/(\+49 171 51 4944 6)/g, '<a href="tel:+491715149446">$1</a>')
       .replace(/(0175 52 0000 8)/g, '<a href="tel:+491755200008">$1</a>');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45">' + h.replace(/\n/g, '<br>') + '</div>';
}

// ===================== EINRICHTEN / AUS =====================
function einrichten() {
  const st = ladeStatus_();
  ordnerListe_().forEach(o => {
    const s = st[o.getId()] || (st[o.getId()] = { gesehen: [] });
    alleDateien_(o).forEach(f => { if (s.gesehen.indexOf(f.getId()) < 0) s.gesehen.push(f.getId()); });
  });
  st._start = new Date().toISOString();
  speichereStatus_(st);
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lauf').timeBased().everyMinutes(LAUF_TAKT_MINUTEN).create();
  holeLabel_();
  Logger.log('Eingerichtet. Ordner: ' + Object.keys(st).length);
}

// Takt der Automatik in Minuten (erlaubt sind nur 1, 5, 10, 15 oder 30)
const LAUF_TAKT_MINUTEN = 5;

// Stellt nur den Takt um (alter Zeitauslöser für "lauf" wird ersetzt). Alles andere bleibt unverändert.
function taktUmstellen() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'lauf').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lauf').timeBased().everyMinutes(LAUF_TAKT_MINUTEN).create();
  Logger.log('Automatik läuft jetzt alle ' + LAUF_TAKT_MINUTEN + ' Minuten.');
}

function ausschalten() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Automatik ausgeschaltet.');
}

// ===================== HAUPTLAUF =====================
async function lauf() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { Logger.log('Ein anderer Lauf ist gerade aktiv (automatisch alle paar Minuten) – dieser Lauf wurde übersprungen. Bitte in 1–2 Minuten nochmal.'); return; }
  const probleme = [];
  try {
    const st = ladeStatus_();
    if (!st._start) { Logger.log('Bitte zuerst "einrichten" ausführen.'); return; }
    // eigene Adresse darf nie als Kunden-E-Mail gespeichert sein (z. B. wenn sie im Beiblatt stand)
    Object.keys(st).forEach(id => { const x = st[id]; if (x && x.kunde && eigeneAdresse_(x.kunde.email)) delete x.kunde.email; });

    // Spalte "Förderung" (600 € unter 4.000 €) einrichten bzw. reparieren – gleich zu Beginn, damit die Liste stimmt
    try { foerderFormelnEinstellen_(st, probleme); speichereStatus_(st); } catch (e) { probleme.push('Förderungs-Formel einrichten fehlgeschlagen – ' + e.message); }
    // Steuer-ID aus dem Beiblatt in die Liste, wenn sie dort fehlt (z. B. von Hand angelegte Zeilen wie Memmler)
    try { investVermerkPruefen_(st, probleme); speichereStatus_(st); } catch (e) { probleme.push('Investitionsstandort prüfen fehlgeschlagen – ' + e.message); }
    try { steuerIdFarbeAngleichen_(st); } catch (e) { console.log('Steuer-ID Farbe: ' + e.message); }
    try { steuerIdAusBeiblattInListe_(st, probleme); speichereStatus_(st); } catch (e) { probleme.push('Steuer-ID aus Beiblatt übernehmen fehlgeschlagen – ' + e.message); }
    // Zuwendungsbescheid im Ordner, aber noch keine Mail / kein Entwurf → Entwurf (mit Bescheid bzw. Bitte um Zahlung) nachholen
    try { zuwendungsMailsNachholen_(st, probleme); speichereStatus_(st); } catch (e) { probleme.push('Zuwendungsbescheid-Mails nachholen fehlgeschlagen – ' + e.message); }
    // A0) Digitales Beiblatt per Mail, aber noch kein Kundenordner → Ordner anlegen (mit Stern) + Beiblatt hochladen
    try { beiblattMailsPruefen_(st, probleme); } catch (e) { probleme.push('Beiblatt-Mails prüfen fehlgeschlagen – ' + e.message); }
    try { speichereStatus_(st); } catch (e) {}
    // Spalte "Vorgangsnummer" anlegen/befüllen (V66) – damit die richtige Listenzeile immer über die Nummer gefunden wird
    try { vorgangsnummernPflegen_(st, probleme); speichereStatus_(st); } catch (e) { probleme.push('Vorgangsnummern pflegen fehlgeschlagen – ' + e.message); }
    try { vollmachtFotosAlsPdf_(st, probleme); } catch (e) { probleme.push('Vollmacht-Fotos als PDF fehlgeschlagen – ' + e.message); }
    try { ordnerNummernNachholen_(st, probleme); speichereStatus_(st); } catch (e) { probleme.push('Ordner mit Vorgangsnummer benennen fehlgeschlagen – ' + e.message); }

    // E) Eingehende Kundenmails mit Anhängen ablegen (V65: gleich am Anfang – früher ganz am Ende, dort wurde der
    //    Schritt bei Zeitknappheit übersprungen, z. B. Köhls unterschriebene Vollmacht)
    try { eingangVerarbeiten_(st, probleme); } catch (e) { probleme.push('Eingehende Mails ablegen fehlgeschlagen – ' + e.message); }
    try { speichereStatus_(st); } catch (e) {}

    // A) Neue Dateien in Kundenordnern
    const neueOrdner = [];
    let ordnerAbbruch = false;
    for (const ordner of ordnerListe_()) {
      if (ordnerAbbruch) break;
      const id = ordner.getId();
      try { // V65: ein Fehler in einem Ordner hält die übrigen Ordner nicht mehr auf
      if (!st[id] || st[id].neuAusMail) { neueOrdner.push(ordner); try { ordner.setStarred(true); } catch (e) {} } // neuer Kundenordner → Stern
      const s = st[id] || (st[id] = { gesehen: [] });
      delete s.neuAusMail;
      // Beiblatt war beim letzten Mal nicht lesbar und der Leser wurde seitdem verbessert → noch einmal versuchen
      if (s.bbFehler && s.bbFehlerLeser !== LESER_VERSION) { s.gesehen = s.gesehen.filter(x => x !== s.bbFehler); s.bbFehlerLeser = LESER_VERSION; }
      const dateien = alleDateien_(ordner);
      // Junge Ordner (≤ 14 Tage) ohne Vollmacht, deren Beiblatt früher nicht lesbar war: nach Leser-Verbesserung einmal neu lesen
      if (!(s.kunde && s.kunde.email) && s.bbVersuchLeser !== LESER_VERSION && s.gesehen.length &&
          Date.now() - ordner.getDateCreated().getTime() < 14 * 864e5 &&
          !dateien.some(f => /vollmacht|beg_vm/i.test(f.getName()))) {
        s.bbVersuchLeser = LESER_VERSION;
        const bbs = dateien.filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName())).map(f => f.getId());
        s.gesehen = s.gesehen.filter(x => bbs.indexOf(x) < 0);
      }
      _dateiCache[id] = dateien; // für die Tagesaufgaben wiederverwenden (spart Zeit)
      // Junger Ordner (≤ 14 Tage) mit unterschriebener Vollmacht + Beiblatt, aber Beiblatt noch nie ausgewertet
      // (z. B. List – NEU: Beiblatt kam vor der Neuauftrags-Regel) → Beiblatt einmal neu auswerten
      if (!s.bb && !s.neuAuftragGeprueft && Date.now() - ordner.getDateCreated().getTime() < 14 * 864e5 &&
          !dateien.some(f => /_beg_formular_beg_vm/i.test(f.getName())) &&
          dateien.some(f => /vollmacht/i.test(f.getName()))) {
        s.neuAuftragGeprueft = true;
        const bbs = dateien.filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName())).map(f => f.getId());
        if (bbs.length) s.gesehen = s.gesehen.filter(x => bbs.indexOf(x) < 0);
      }
      const neu = dateien.filter(f => s.gesehen.indexOf(f.getId()) < 0);
      for (const f of neu) {
        // Dateien in Unterordnern (z. B. Kundenpost im Ordner "Unterlagen Verwendungsnachweis") lösen keine Stufe aus –
        // außer ein Festsetzungsbescheid (der darf auch im Unterordner liegen)
        if (_unterordnerDatei[f.getId()] && !/festsetzungsbescheid/i.test(f.getName())) { s.gesehen.push(f.getId()); continue; }
        // Schutz vor Endlosschleife: klappt die Verarbeitung einer Datei zweimal nicht (Zeitlimit oder Fehler), wird sie übersprungen
        const schwer = /beiblatt|^begpt_|zuwendungsbescheid|festsetzungsbescheid/i.test(f.getName());
        if (schwer) {
          // wird die Zeit knapp, die Datei lieber im nächsten Lauf verarbeiten als mitten drin abgebrochen zu werden
          if (zeitUeber_()) { ordnerAbbruch = true; break; }
          s.versuch = s.versuch || {};
          const v = (s.versuch[f.getId()] || 0) + 1;
          if (v > 2) {
            delete s.versuch[f.getId()];
            s.gesehen.push(f.getId());
            probleme.push(ordner.getName() + ': ' + f.getName() + ' – Verarbeitung hat zweimal nicht geklappt (Zeitlimit oder Fehler, siehe frühere Hinweise), Datei übersprungen. Bitte diesen Schritt von Hand erledigen.');
            continue;
          }
          s.versuch[f.getId()] = v;
          speichereStatus_(st);
        }
        let fehler = null;
        try {
          await verarbeiteNeueDatei_(ordner, f, s, probleme);
        } catch (e) {
          fehler = e;
          probleme.push(ordner.getName() + ': ' + f.getName() + ' – Fehler: ' + e.message + (schwer ? ' (wird im nächsten Lauf noch einmal versucht)' : ''));
        }
        if (fehler && schwer) continue; // V65: nicht als erledigt merken → nächster Lauf versucht es noch einmal (höchstens 2×)
        if (s.versuch) { delete s.versuch[f.getId()]; if (!Object.keys(s.versuch).length) delete s.versuch; }
        s.gesehen.push(f.getId());
        console.log('Datei verarbeitet: ' + ordner.getName() + ' / ' + f.getName() + ' (' + Math.round((Date.now() - LAUF_START) / 1000) + ' s)');
      }
      // B) Zuwendungsbescheid wartet auf Zahlung
      if (s.wartetZahlung && istBezahlt_(s.wartetZahlung.name, s.wartetZahlung.d8)) {
        let zb = null;
        try { zb = DriveApp.getFileById(s.wartetZahlung.dateiId); if (zb.isTrashed()) zb = null; } catch (e) { zb = null; }
        if (!zb) zb = alleDateien_(ordner).filter(x => /zuwendungsbescheid/i.test(x.getName())).sort((a, b) => b.getDateCreated() - a.getDateCreated())[0] || null;
        listeSetze_(ordner, s, { 'Bezahlung': heute_() }, probleme);
        if (zb) zuwendungsEntwurf_(ordner, zb, s, probleme);
        else probleme.push(ordner.getName() + ': Rechnung bezahlt, aber der Zuwendungsbescheid liegt nicht mehr im Ordner – Entwurf "Ihr Zuwendungsbescheid ist da" bitte selbst schreiben bzw. den Bescheid wieder in den Ordner legen.');
        delete s.wartetZahlung;
      }
      // C) Neuen Kunden in die Kundenliste (Google Sheet) eintragen
      listeSync_(ordner, s, probleme);
      } catch (e) {
        probleme.push(ordner.getName() + ': Fehler beim Prüfen des Kundenordners – ' + e.message + ' (nächster Lauf versucht es wieder)');
      }
    }
    try { speichereStatus_(st); } catch (e) {}

    // A2) Hinweis-Mail an dich bei neuen Kundenordnern
    neueKundenMelden_(neueOrdner, st);

    // D) Zahlungseingänge aus Qonto in die Kundenliste (Datum in "Bezahlung", Name schwarz)
    try { zahlungenAbgleichen_(st, probleme); } catch (e) { probleme.push('Zahlungsabgleich fehlgeschlagen – ' + e.message); }
    // D1) Bemerkung: "Rechnung verschickt TT.MM.JJ" / "Zuwendungsbescheid noch nicht verschickt" setzen bzw. wieder rausnehmen (V68)
    try { if (!zeitUeber_()) bemerkungRechnungZbPflegen_(st, probleme); } catch (e) { probleme.push('Bemerkung Rechnung/Zuwendungsbescheid pflegen fehlgeschlagen – ' + e.message); }


    // D2) Farben der ganzen Liste prüfen + E-Mail-Spalte
    try { listeFarbenPruefen_(st, probleme); } catch (e) { probleme.push('Farben der Liste prüfen fehlgeschlagen – ' + e.message); }

    // Jeder Schritt einzeln abgesichert; Stand wird zwischendurch gespeichert (keine doppelten Entwürfe nach Abbruch)
    console.log('Kundenordner + Liste fertig (' + Math.round((Date.now() - LAUF_START) / 1000) + ' s)');
    const schritt = (name, fn) => {
      try { return fn(); } catch (e) { probleme.push(name + ' fehlgeschlagen – ' + e.message); return false; }
      finally {
        try { speichereStatus_(st); } catch (e) {}
        console.log(name + ' fertig (' + Math.round((Date.now() - LAUF_START) / 1000) + ' s)');
      }
    };

    // D3) Zahlungserinnerungen (1x täglich ab 7 Uhr, nur bei Zuwendungsbescheid im Ordner + Rechnung überfällig)
    schritt('Zahlungserinnerungen', () => zahlungserinnerungen_(st, probleme));

    // D4) Nachfrage beim BAFA (1x täglich ab 8 Uhr, Antrag > 30 Tage ohne Zuwendungsbescheid)
    schritt('BAFA-Nachfragen', () => bafaNachfragen_(st, probleme));

    // D5) Antworten der Kunden mit fehlenden Angaben (Steuer-ID, Geburtsdatum, Baujahr, WE, IBAN) in die Liste
    schritt('Kundenantworten', () => kundenAntwortenAuswerten_(st, probleme));

    // D5-L) V69: Kunde erwähnt in seiner Mail das Lüftungskonzept → Hinweis-Mail an dich
    if (!zeitUeber_()) schritt('Lüftungskonzept-Anfragen', () => lueftungsAnfragenMelden_(st));

    // D5a) Festsetzungsbescheid an den Kunden verschickt → Zeile grün + "VORGANG ERLEDIGT"
    if (!zeitUeber_()) schritt('Vorgang erledigt markieren', () => erledigtMarkieren_(st, probleme));

    // D5a) Einmalig: "Wohnung Nr. …" / "von insgesamt …" nachträglich richtig deuten (Lorenzen)
    if (!zeitUeber_()) schritt('WE nachbessern', () => weNachbessern_(st, probleme));

    // D5b) Angaben aus der Kundenliste (Steuer-ID, Wohneinheiten, Baujahr, Geburtsdatum) ins Beiblatt übernehmen
    if (!zeitUeber_()) schritt('Liste → Beiblatt', () => beiblaetterAbgleichen_(st, probleme));

    // D5c) Verschickte Vollmacht-Erinnerungen sofort rot in der Bemerkung vermerken; täglich ab 8 Uhr: Erinnerungs-Entwürfe
    if (!zeitUeber_()) schritt('Erinnerung vermerken', () => vmErinnerungVermerken_(st, probleme));
    if (!zeitUeber_()) schritt('Vollmacht-Erinnerungen', () => vollmachtErinnerungen_(st, probleme));

    // D6) Täglich ab 9 Uhr: Bewilligungszeitraum, Nachfassen nach Umsetzung, Storno, Abschluss/Archiv
    if (tagesAufgabeFaellig_('pflege_tag', 9)) {
      const fertig = schritt('Bewilligungszeitraum', () => bewilligungPruefen_(st, probleme))
        && schritt('Nachfassen', () => umsetzungNachfassen_(st, probleme))
        && schritt('Storno', () => stornosUebernehmen_(st, probleme))
        && schritt('Archiv', () => erledigteArchivieren_(st, probleme));
      if (fertig) { try { tagesAufgabeErledigt_('pflege_tag'); } catch (e) { probleme.push('Tagesaufgaben: Merker konnte nicht gespeichert werden – ' + e.message); } } // sonst im nächsten Lauf weitermachen
    }

    // E2) Mails, die seit Laufbeginn neu eingegangen sind, gleich noch mitnehmen (wenn Zeit ist)
    if (!zeitUeber_()) schritt('Eingehende Mails', () => eingangVerarbeiten_(st, probleme));

    // F) Antragsbestätigungs-Entwürfe ohne Antrag: begpt_….pdf aus dem Kundenordner anhängen
    if (!zeitUeber_()) schritt('Antrag anhängen', () => antragsAnhaengeErgaenzen_(st, probleme));

    speichereStatus_(st);
    console.log('Lauf komplett (' + Math.round((Date.now() - LAUF_START) / 1000) + ' s)');
  } finally {
    try { if (probleme.length) meldeProbleme_(probleme); } catch (e) { console.log('Hinweise melden: ' + e.message); }
    lock.releaseLock();
  }
}

async function verarbeiteNeueDatei_(ordner, datei, s, probleme) {
  const name = datei.getName();
  if (/beiblatt/i.test(name) && !/rechnung/i.test(name)) {
    await vollmachtSchritt_(ordner, datei, s, probleme);
  } else if (/^begpt_/i.test(name)) {
    listeSetze_(ordner, s, { 'Bearbeitungsstand': ['Antrag eingegangen'] }, probleme);
    antragsBestaetigung_(ordner, datei, s, probleme);
    try { ordnerMitVorgangsnummer_(ordner, datei, s, probleme); } catch (e) { probleme.push(ordner.getName() + ': Ordner konnte nicht mit der Vorgangsnummer benannt werden – ' + e.message); }
  } else if (/zuwendungsbescheid/i.test(name)) {
    const kunde = kundeAusOrdner_(ordner, s);
    listeSetze_(ordner, s, { 'Zuwendung erhalten': heute_(), 'Bearbeitungsstand': ['Zuwendungsbescheid erhalten'] }, probleme);
    // Sofort einen Entwurf: bezahlt → Bescheid im Anhang; noch offen → "Zuwendungsbescheid ist da – bitte Rechnung begleichen"
    const bez = zbBezahlt_(kunde, ordner);
    if (bez && bez !== 'spaeter') {
      if (bez === 'Qonto') listeSetze_(ordner, s, { 'Bezahlung': heute_() }, probleme);
      zuwendungsEntwurf_(ordner, datei, s, probleme);
    } else if (!bez) {
      s.wartetZahlung = { dateiId: datei.getId(), name: kunde.name };
      zuwendungZahlungsbitte_(ordner, s, kunde, probleme);
    }
  } else if (/festsetzungsbescheid/i.test(name)) {
    listeSetze_(ordner, s, { 'Bearbeitungsstand': ['Festsetzungsbescheid erhalten.'] }, probleme);
    festsetzungsEntwurf_(ordner, datei, s, probleme);
  }
}

// ===================== STUFE 1: VOLLMACHT =====================
async function vollmachtSchritt_(ordner, beiblatt, s, probleme) {
  const nn0 = nachnameAusOrdner_(ordner.getName());
  if (dateiExistiert_(ordner, /_beg_formular_beg_vm\.pdf$/i)) { // schon vorbereitet
    // V65: nicht still – fehlt der Entwurf "benötigte Unterlagen" (z. B. Lauf beim letzten Mal unterbrochen), Bescheid geben
    if (!s.kunde && !mailExistiert_('benötigte Unterlagen ' + nn0))
      probleme.push(ordner.getName() + ': Im Ordner liegt schon eine vorbereitete Vollmacht (…_beg_formular_beg_vm.pdf), aber es gibt keine Mail und keinen Entwurf "benötigte Unterlagen ' + nn0 + '". Bitte prüfen, ob der Kunde die Vollmacht schon bekommen hat.');
    return;
  }
  // Neuer Auftrag, die unterschriebene Vollmacht liegt schon im Ordner (z. B. aus einem stornierten Auftrag übernommen):
  // keine neue Vollmacht und keine Mail – aber Kunde aus dem neuen Beiblatt übernehmen und neu in die Liste eintragen.
  const vmDa = !s.bb && alleDateien_(ordner).filter(f => /vollmacht/i.test(f.getName()) && !/_beg_formular_beg_vm/i.test(f.getName()))
    .sort((a, b) => a.getDateCreated() - b.getDateCreated())[0];
  if (!vmDa && mailExistiert_('benötigte Unterlagen ' + nn0)) return;

  const PDFLib = pdfLib_();
  // Eigener Leser: Die Beiblätter (mit Vorschau/FillSign bearbeitet) sind für pdf-lib oft "kaputt"
  const felder = leseFormularfelder_(beiblatt.getBlob().getBytes(), pako_());
  const w = n => felder[n] || '';

  const vollName = w('Vorname Nachname').trim();
  const email = w('EMail').trim();
  if (!vollName || !email) {
    s.bbFehler = beiblatt.getId(); s.bbFehlerLeser = LESER_VERSION; // mit verbessertem Leser später nochmal versuchen
    probleme.push(ordner.getName() + ': Beiblatt nicht maschinenlesbar (Name/E-Mail fehlen) – Vollmacht bitte manuell.');
    return;
  }
  delete s.bbFehler; delete s.bbFehlerLeser;
  // Vor- und Nachname trennen. Manche schreiben "Nachname Vorname" – dann hilft der Ordnername.
  const teile = vollName.split(/\s+/);
  const nnO = ohneAkzente_(nn0.toLowerCase());
  let nachname, vorname;
  const pos = teile.findIndex(t => ohneAkzente_(t.replace(/,$/, '').toLowerCase()) === nnO);
  if (pos >= 0 && teile.length > 1) { nachname = nn0; vorname = teile.filter((t, i) => i !== pos).join(' ').replace(/,$/, ''); } // Schreibweise wie im Ordnernamen
  else { nachname = teile.pop().replace(/,$/, ''); vorname = teile.join(' ').replace(/,$/, ''); }
  const anr = anredeErmitteln_(vorname);
  const anrede = anr.anrede;
  const tel = (w('Telefon  Mobil').split(/\n/).find(x => x.trim()) || '').trim();
  const adr = adressenAusBeiblatt_(felder, ordner.getName(), beiblatt.getId(), probleme);
  const strasse = adr.wohn.s, plz = adr.wohn.p, ort = adr.wohn.o;
  const inv = adr.inv;
  const steuerId = w('SteuerID 11stellig').replace(/\s/g, '');
  const steuerOk = steuerIdGueltig_(steuerId);
  s.kunde = { vorname, nachname, anrede, email, steuerId: steuerOk ? steuerId : '' };
  s.bb = felder; s.bbV = 2; s.bbDatum = beiblatt.getDateCreated().toISOString(); s.adr = adr;
  if (vmDa) {
    s.neuAuftrag = true;
    s.vollmachtDa = Utilities.formatDate(vmDa.getDateCreated(), 'Europe/Berlin', 'dd.MM.yy');
    const fehltNeu = fehlendeAngaben_(felder);
    probleme.push(ordner.getName() + ': Neuer Auftrag – die unterschriebene Vollmacht liegt schon im Ordner ("' + vmDa.getName() + '"), daher keine neue Vollmacht und keine Mail. ' +
      'Der Kunde wird aus dem neuen Beiblatt neu in die Kundenliste eingetragen (Stand "Vollmacht eingegangen").' +
      (fehltNeu.length ? ' Für den Antrag fehlt laut Beiblatt noch: ' + fehltNeu.map(x => x.kurz).join(', ') + '.' : ''));
    return;
  }

  // Vollmacht füllen
  const vorlage = DriveApp.getFileById(CFG.VOLLMACHT_VORLAGE_ID).getBlob().getBytes();
  const vm = await PDFLib.PDFDocument.load(new Uint8Array(vorlage));
  const vf = vm.getForm();
  const setze = (n, v) => { try { vf.getTextField(n).setText(v || ''); } catch (e) {} };
  setze('Straße und Hausnummer1', inv.s); setze('Postleitzahl1', inv.p); setze('Ort1', inv.o);
  setze('Anrede', anrede || ''); setze('Vorname', vorname); setze('Nachname', nachname);
  setze('Straße und Hausnummer', strasse); setze('Postleitzahl', plz); setze('Ort', ort);
  setze('Telefon optional', tel); setze('EMailAdresse optional', email);
  Object.keys(CFG.BEVOLLMAECHTIGT).forEach(k => setze(k, CFG.BEVOLLMAECHTIGT[k]));
  const helv = await vm.embedFont(PDFLib.StandardFonts.Helvetica);
  vf.getFields().forEach(f => { try { if (f.setFontSize) f.setFontSize(11); } catch (e) {} });
  vf.updateFieldAppearances(helv);
  try { vf.acroForm.dict.delete(PDFLib.PDFName.of('NeedAppearances')); } catch (e) {} // eigene Darstellung nutzen
  const bytes = await vm.save({ updateFieldAppearances: false });
  const blob = Utilities.newBlob(Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)),
    'application/pdf', nachname + '_beg_formular_beg_vm.pdf');
  const gespeichert = ordner.createFile(blob);
  s.gesehen.push(gespeichert.getId());

  // Entwurf
  const zeilen = [
    begruessung_(anrede, nachname), '',
    'vielen Dank für Ihr Vertrauen in meine Energieberatung.', '',
    'Damit ich den Zuschuss für Ihre geplante energetische Maßnahme beim BAFA für Sie beantragen kann, benötige ich noch einige formale Unterlagen und Informationen von Ihnen.', '',
    '1. Vollmacht zur Antragstellung: Im Anhang finden Sie das offizielle BAFA-Vollmachtsformular, welches ich bereits weitestgehend für Sie vorbereitet habe. Bitte prüfen Sie alle Daten auf Korrektheit.', '',
    '2. Für die spätere Auszahlung des Zuschusses benötigen wir zudem Ihre IBAN.'
  ];
  const fehlt = fehlendeAngaben_(felder);
  if (fehlt.length) {
    zeilen.push('', '3. Für die Antragstellung beim BAFA benötigen wir außerdem noch ' + (fehlt.length === 1 ? 'folgende Angabe, die im Beiblatt noch fehlt:' : 'folgende Angaben, die im Beiblatt noch fehlen:'));
    fehlt.forEach(x => zeilen.push('   – ' + x.text));
    zeilen.push('', 'Bitte senden Sie mir ' + (fehlt.length === 1 ? 'diese Angabe' : 'diese Angaben') + ' einfach als Antwort auf diese E-Mail, damit wir den Antrag stellen können.');
  }
  zeilen.push('',
    'Wichtig: Das BAFA akzeptiert derzeit nur handschriftliche Unterschriften (keine Computer-Signaturen). Bitte drucken Sie das Dokument aus, unterschreiben Sie es und senden Sie es mir eingescannt als PDF an meine E-Mail-Adresse info@energieberatungmuenchen.com zurück.', '',
    'Wie geht es weiter? Sobald mir die unterschriebene Vollmacht und Ihre Daten vorliegen, werde ich die Technische Projektbeschreibung (TPB) sowie den offiziellen Förderantrag für Sie finalisieren. Sie erhalten im Anschluss alle Bestätigungen sowie die TPB-ID für Ihre Akten.', '',
    LUEFTUNG_HINWEIS, '',
    SIGNATUR);
  entwurf_(email, 'Ihr Förderantrag Eibner & Regnath / benötigte Unterlagen ' + nachname,
    pruefHinweis_(anr.sicher ? anrede : '') + zeilen.join('\n'), { attachments: [blob] });
  if (fehlt.length) fehlendeAngabenMelden_(ordner, vorname + ' ' + nachname, fehlt);
  if (!anrede) probleme.push(ordner.getName() + ': Anrede für "' + vorname + '" unklar (Unisex-Name) – im Entwurf und in der Vollmacht bitte ergänzen.');
  else if (!anr.sicher) probleme.push(ordner.getName() + ': Anrede für "' + vorname + '" geschätzt als "' + anrede + '" – bitte kurz prüfen. Tipp: im Code unter NAMEN_EXTRA eintragen.');
}

// Angaben, die nicht für die Vollmacht, aber für die Antragstellung gebraucht werden
function fehlendeAngaben_(f) {
  const w = n => String(f[n] || '').trim();
  const leer = v => !v || /^[-–\/.\s]*$/.test(v);
  const out = [];
  if (leer(w('Geburtsdatum')) || !/\d/.test(w('Geburtsdatum')))
    out.push({ key: 'geb', kurz: 'Geburtsdatum', text: 'Ihr Geburtsdatum' });
  const sid = w('SteuerID 11stellig').replace(/\D/g, '');
  if (sid.length === 11 && !steuerIdGueltig_(sid))
    out.push({ key: 'steuer', kurz: 'Steuer-ID (ungültig: ' + sid + ')', text: 'Ihre steuerliche Identifikationsnummer (Steuer-ID) – die im Beiblatt angegebene Nummer ' + sid + ' ist leider nicht gültig (vermutlich ein Zahlendreher). Bitte prüfen Sie sie z. B. anhand Ihres Einkommensteuerbescheids' });
  else if (sid.length !== 11)
    out.push({ key: 'steuer', kurz: 'Steuer-ID', text: 'Ihre steuerliche Identifikationsnummer (Steuer-ID, 11-stellig) – diese finden Sie z. B. auf Ihrem Einkommensteuerbescheid' });
  // Wohneinheiten müssen eine klare Zahl sein ("von ca 52" oder "Wohnung 21" reichen dem BAFA nicht)
  const hinweis = v => v ? ' – im Beiblatt steht „' + v + '“, benötigt wird eine genaue Zahl' : '';
  const wd = weDeuten_(f); // "Wohnung Nr.79" / "von insgesamt 240" → 1 / 240 / Nr. 79
  if (!wd.we)
    out.push({ key: 'we', kurz: 'Anzahl Wohneinheiten' + (w('Betroffene WE') ? ' (unklar)' : ''), text: 'die Anzahl der Wohneinheiten, in denen die Maßnahme umgesetzt wird' + hinweis(w('Betroffene WE')) });
  if (!wd.weGes)
    out.push({ key: 'weGes', kurz: 'Wohneinheiten gesamt' + (w('Wohneinheiten gesamt') ? ' (unklar)' : ''), text: 'die genaue Gesamtzahl der Wohneinheiten im Gebäude' + hinweis(w('Wohneinheiten gesamt')) });
  if (!/\d{4}/.test(w('Baujahr / Fertigstellungsdatum')))
    out.push({ key: 'bj', kurz: 'Baujahr', text: 'das Baujahr des Gebäudes (bzw. das Jahr der Fertigstellung)' });
  // Mehrere Wohnungen im Haus → das BAFA braucht die Wohnungsnummer bzw. Lage der Wohnung
  const gesRoh = w('Wohneinheiten gesamt'), ges = wd.weGes;
  const adresse = Object.keys(f).filter(k => /stra(ß|ss)e/i.test(k)).map(k => w(k)).join(' ');
  const hatNr = !!wd.wnr || /\b(?:whg|wohnung|wohnungs?nr|we|top|app(?:artment)?)\.?\s*(?:nr\.?\s*)?\d+/i.test(adresse) || /\d+\.?\s*(?:og|obergeschoss|stock)\b|\b(?:eg|erdgeschoss|dg|dachgeschoss)\b/i.test(adresse);
  const mehrere = ges ? +ges > 1 : (!!gesRoh && /\d/.test(gesRoh) && !/^\s*1\b/.test(gesRoh));
  if (!hatNr && (mehrere || !gesRoh))
    out.push({ key: 'wnr', kurz: 'Wohnungsnummer',
      text: mehrere ? 'die Nummer bzw. Lage Ihrer Wohnung (z. B. „Wohnung Nr. 5“ oder „2. OG links“), da sich im Gebäude mehrere Wohneinheiten befinden'
                    : 'falls sich im Gebäude mehrere Wohnungen befinden: die Nummer bzw. Lage Ihrer Wohnung (z. B. „Wohnung Nr. 5“ oder „2. OG links“)' });
  return out;
}

// Info-Mail an dich: welche Angaben bei diesem Kunden fehlen
function fehlendeAngabenMelden_(ordner, name, fehlt) {
  try {
    mailAnMich_(
      'Fehlende Angaben im Beiblatt – ' + name,
      'Im Beiblatt von ' + name + ' fehlen für die Antragstellung:\n\n' +
      fehlt.map(x => '• ' + x.kurz).join('\n') + '\n\n' +
      'Die Vollmacht wurde trotzdem vorbereitet. Im Entwurf "benötigte Unterlagen" wird der Kunde um diese Angaben gebeten, ' +
      'und in der Kundenliste steht es unter "Bemerkung".\n\nKundenordner: ' + ordner.getName() + '\n' + ordner.getUrl());
  } catch (e) { Logger.log('Info-Mail fehlgeschlagen: ' + e.message); }
}

// ===================== STUFE 2: ANTRAGSBESTÄTIGUNG =====================
// Sobald der eingereichte Antrag (begpt_….pdf) im Kundenordner liegt: Entwurf an den Kunden MIT dem Antrag im Anhang.
// Die Honorarrechnung aus Qonto hängst du nach dem Finalisieren selbst an (Hinweiszeile oben im Entwurf).
function antragsBestaetigung_(ordner, begpt, s, probleme) {
  const k = kundeAusOrdner_(ordner, s);
  if (!k.email) { probleme.push(ordner.getName() + ': Antrag eingereicht, aber keine Kunden-E-Mail gefunden – Antragsbestätigung bitte selbst schreiben.'); return; }
  if (mailMitNameExistiert_('Antragstellung', k.nachname) || mailMitNameExistiert_('Antragseinreichung', k.nachname)) return;
  // auch Mails ohne Namen im Betreff (z. B. "Ihr Förderantrag - Antragseinreichung / Rechnung") an diesen Kunden zählen
  if (GmailApp.search('in:sent to:' + k.email + ' (subject:Antragstellung OR subject:Antragseinreichung OR filename:begpt)', 0, 1).length
    || GmailApp.search('in:drafts to:' + k.email + ' (subject:Antragstellung OR subject:Antragseinreichung)', 0, 1).length) return;
  const zeilen = [
    begruessung_(k.anrede, k.nachname), '',
    'ich habe den Förderantrag bei der BAFA für Sie eingereicht (siehe Anhang). Mit dieser Bestätigung ist der vorzeitige Maßnahmenbeginn zulässig und Sie können mit der Umsetzung starten.', '',
    'Bitte beachten Sie für die Sicherung Ihres Förderanspruchs folgende Zahlungsmodalitäten:', '',
    'Zahlungsverbot vor Bescheid: Reguläre Abschlagsrechnungen dürfen erst nach Erhalt des Zuwendungsbescheids beglichen werden. Sowohl das Rechnungsdatum als auch der Zahlungsfluss müssen innerhalb des Bewilligungszeitraums liegen.', '',
    'Anzahlungen: Anzahlungen sind vorab bereits zulässig, sofern diese am Ende in die Gesamtrechnungssumme einfließen und als solche klar deklariert sind.', '',
    'Den schriftlichen Zuwendungsbescheid erwarte ich in ca. drei Wochen. Ich werde Ihnen diesen sofort nach Erhalt weiterleiten.'
  ];
  if (!steuerIdBekannt_(k)) zeilen.push('', 'Für die spätere Auszahlung des Zuschusses benötige ich noch Ihre steuerliche Identifikationsnummer (Steuer-ID, 11-stellig). Diese finden Sie z. B. auf Ihrem Einkommensteuerbescheid oder Ihrer Lohnsteuerbescheinigung. Bitte senden Sie mir diese einfach als Antwort auf diese E-Mail.');
  zeilen.push('', 'Anbei erhalten Sie vereinbarungsgemäß meine Honorarrechnung für die gesamte Abwicklung.', '', SIGNATUR);
  entwurf_(k.email, 'Bestätigung der BAFA-Antragstellung – Wichtige Hinweise zum Projektstart ' + k.nachname,
    '### BITTE NOCH ANHÄNGEN: Honorarrechnung aus Qonto (nach dem Finalisieren) – diese Zeile danach löschen ###\n\n'
    + pruefHinweis_(k.anrede) + zeilen.join('\n'), { attachments: [begpt.getBlob()] });
}

function steuerIdBekannt_(k) {
  if (k.steuerId && steuerIdGueltig_(k.steuerId)) return true;
  try {
    const L = liste_();
    const row = L && L.sp['Bemerkung'] ? listeZeile_(L, k.nachname, k.vorname) : -1;
    if (row > 0) {
      const m = L.sh.getRange(row, L.sp['Bemerkung']).getDisplayValue().match(/steuer\s*-?\s*id\s*:?\s*((?:\d[\s\/]*){11})/i);
      if (m && steuerIdGueltig_(m[1])) return true;
    }
  } catch (e) {}
  return k.email ? !!steuerIdAusMails_(k.email) : false;
}

// Hängt an Entwürfe "Bestätigung der BAFA-Antragstellung …", denen der Antrag fehlt, die begpt_….pdf aus dem Kundenordner an.
// Läuft bei jedem Lauf; von Hand: Funktion "antragAnhaengen".
function antragsAnhaengeErgaenzen_(st, probleme) {
  st._antragHinweis = st._antragHinweis || [];
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  let ordner = null, ergaenzt = 0;
  GmailApp.getDrafts().forEach(d => {
    const m = d.getMessage();
    const betreff = m.getSubject();
    if (!/Bestätigung der BAFA-Antragstellung/i.test(betreff)) return;
    const anh = m.getAttachments();
    if (anh.some(a => /^begpt_/i.test(a.getName()))) return;
    const nn = (betreff.match(/Projektstart\s+(?:für\s+)?(.+?)\s*$/i) || [])[1];
    if (!nn) return;
    ordner = ordner || ordnerListe_();
    const funde = [];
    ordner.filter(o => norm(nachnameAusOrdner_(o.getName())) === norm(nn)).forEach(o => {
      const b = alleDateien_(o).filter(f => /^begpt_/i.test(f.getName())).sort((x, y) => y.getDateCreated() - x.getDateCreated())[0];
      if (b) funde.push(b);
    });
    if (funde.length !== 1) {
      if (st._antragHinweis.indexOf(d.getId()) < 0) {
        st._antragHinweis.push(d.getId());
        probleme.push('Entwurf "' + betreff + '": ' + (funde.length ? 'mehrere Kundenordner mit Antrag' : 'kein begpt_….pdf im Kundenordner gefunden') + ' – Antrag bitte selbst anhängen.');
      }
      return;
    }
    d.update(m.getTo(), betreff, m.getPlainBody(), {
      htmlBody: m.getBody(), cc: m.getCc(), bcc: m.getBcc(),
      attachments: anh.map(a => a.copyBlob().setName(a.getName())).concat([funde[0].getBlob()])
    });
    ergaenzt++;
  });
  if (ergaenzt) Logger.log('Antrag an ' + ergaenzt + ' Entwurf/Entwürfe angehängt.');
  return true;
}

// Von Hand ausführbar: Antrag sofort an alle passenden Entwürfe anhängen
function antragAnhaengen() {
  const st = ladeStatus_(), probleme = [];
  antragsAnhaengeErgaenzen_(st, probleme);
  speichereStatus_(st);
  if (probleme.length) Logger.log(probleme.join('\n'));
}

// ===================== STUFE 3: ZUWENDUNGSBESCHEID =====================
function zuwendungsEntwurf_(ordner, datei, s, probleme) {
  const k = kundeAusOrdner_(ordner, s);
  if (!k.email) { probleme.push(ordner.getName() + ': Zuwendungsbescheid da + bezahlt, aber keine Kunden-E-Mail gefunden.'); return; }
  if (mailMitNameExistiert_('Zuwendungsbescheid', k.nachname)) return;
  const steuer = k.steuerId || steuerIdAusMails_(k.email);
  const zeilen = [
    begruessung_(k.anrede, k.nachname), '',
    'vielen Dank für die Begleichung der Rechnung.',
    'ich freue mich, Ihnen mitteilen zu können, dass der Förderantrag vom BAFA genehmigt wurde. Den Zuwendungsbescheid finden Sie im Anhang.', '',
    'Für die spätere Auszahlung der Fördermittel ist die Einreichung des Verwendungsnachweises erforderlich. Bitte senden Sie mir hierzu nach vollständigem Abschluss der Maßnahme folgende Dokumente per E-Mail:', '',
    'Schlussrechnung der Firma Eibner & Regnath nebst ausgefülltem Rechnungsbeiblatt', '',
    'Zahlungsbeleg (Kontoauszug oder qualifizierte Überweisungsbestätigung zum Nachweis des Geldflusses)', '',
    'IBAN des Antragstellers (Kontoinhaber muss mit dem Antragsteller identisch sein)',
    steuer ? 'Ihre Steuer-ID für die Auszahlung des Zuschusses. Diese liegt uns bereits vor.'
           : 'Ihre Steuer-ID (11-stellig) für die Auszahlung des Zuschusses. Diese liegt uns leider noch nicht vor.', '',
    'Nach Erhalt der Unterlagen werde ich die technische Projektbestätigung umgehend für Sie erstellen und einreichen.', '',
    SIGNATUR
  ];
  entwurf_(k.email, 'Ihr Zuwendungsbescheid ist da ' + [k.anrede, k.nachname].filter(Boolean).join(' '),
    pruefHinweis_(k.anrede) + zeilen.join('\n'), { attachments: [datei.getBlob()] });
}

// ===================== STUFE 3a: ZUWENDUNGSBESCHEID-MAIL NACHHOLEN =====================
// Bei jedem Lauf: Liegt im Kundenordner ein Zuwendungsbescheid (≤ 60 Tage alt), ist die Rechnung laut Liste oder
// Qonto-Mail bezahlt und gibt es weder eine gesendete Mail "…Zuwendungsbescheid…" mit Anhang an den Kunden noch einen
// Entwurf, wird der Entwurf "Ihr Zuwendungsbescheid ist da" (mit Bescheid im Anhang) angelegt. So geht keiner verloren,
// auch wenn die Zahlung früher übersehen wurde (z. B. Wengert, Hansen, Herter).
// Einmal täglich zusätzlich: Kunden mit Stand "Zuwendungsbescheid erhalten" + bezahlt, aber ohne Bescheid-PDF im Ordner → Hinweis.
function zuwendungsMailsNachholen_(st, probleme) {
  const L = liste_();
  const memo = st._zbMail2 = st._zbMail2 || {}; // (neu ab V58 – Prüfung läuft neu, alte Einträge werden nicht übernommen)
  let angelegt = 0;
  const bezahltLaut = zbBezahlt_;
  // schnell: nur Ordner, in denen in den letzten 60 Tagen ein Zuwendungsbescheid abgelegt wurde (Drive-Suche statt alle Ordner)
  const kunden = {};
  ordnerListe_().forEach(o => { kunden[o.getId()] = o; });
  const seit = Utilities.formatDate(new Date(Date.now() - 60 * 864e5), 'UTC', "yyyy-MM-dd'T'HH:mm:ss");
  const treffer = [];
  const it = DriveApp.searchFiles('title contains "Zuwendungsbescheid" and mimeType = "application/pdf" and modifiedDate > "' + seit + '" and trashed = false');
  while (it.hasNext()) {
    const f = it.next();
    if (Date.now() - f.getDateCreated().getTime() > 60 * 864e5) continue;
    const ps = f.getParents();
    while (ps.hasNext()) { const p = ps.next(); if (kunden[p.getId()]) treffer.push({ o: kunden[p.getId()], zb: f }); }
  }
  treffer.sort((a, b) => b.zb.getDateCreated() - a.zb.getDateCreated());
  const erledigtOrdner = {};
  for (const { o, zb } of treffer) {
    if (zeitUeber_() || angelegt >= 5) break;
    const id = o.getId();
    if (erledigtOrdner[id]) continue; // pro Ordner nur der neueste Bescheid
    erledigtOrdner[id] = true;
    // Liste: Bescheid liegt vor, aber Stand noch davor (z. B. Herter "Antrag eingegangen") → Stand + Datum nachtragen
    try {
      const st0 = st[id] || (st[id] = { gesehen: [] });
      const row = L ? listenZeileFuerOrdner_(L, o, kundeAusOrdner_(o, st0)) : -1;
      if (row > 0 && L.sp['Bearbeitungsstand']) {
        const zs = L.sh.getRange(row, L.sp['Bearbeitungsstand']);
        const vorher = zs.getDisplayValue().trim();
        if (/^(offen|vollmacht|antrag)/i.test(normStand_(vorher)) || !vorher) {
          zs.setValue('Zuwendungsbescheid erhalten');
          standFarbe_(L, row);
          if (L.sp['Zuwendung erhalten']) {
            const zz = L.sh.getRange(row, L.sp['Zuwendung erhalten']);
            if (!istDatum_(zz.getDisplayValue())) zz.setValue(Utilities.formatDate(zb.getDateCreated(), 'Europe/Berlin', 'dd.MM.yy'));
          }
          listeAktualisiert_(L);
          probleme.push(o.getName() + ': Zuwendungsbescheid liegt im Ordner – Stand in der Liste auf "Zuwendungsbescheid erhalten" gesetzt (vorher: "' + vorher + '").');
        }
      }
    } catch (e) { console.log('ZB-Stand: ' + e.message); }
    if (memo[id] === 'ok' || memo[id] === 'entwurf') continue; // erledigt bzw. Entwurf schon einmal angelegt (nie doppelt)
    const s = st[id] || (st[id] = { gesehen: [] });
    const k = kundeAusOrdner_(o, s);
    if (!k.email) { if (memo[id] !== 'ohneMail') { memo[id] = 'ohneMail'; probleme.push(o.getName() + ': Zuwendungsbescheid im Ordner, aber keine Kunden-E-Mail gefunden – bitte in der Liste (Spalte E-Mail) eintragen.'); } continue; }
    // schon verschickt? (jede gesendete Mail mit "Zuwendungsbescheid" im Betreff und Anhang an den Kunden)
    // (auch an eine andere Adresse: Name des Kunden in der Mail, z. B. "Sehr geehrter Herr Gottwald")
    if (zbGesendet_(k)) { memo[id] = 'ok'; continue; }
    // Entwurf mit Bescheid schon da?
    if (GmailApp.search('in:drafts subject:Zuwendungsbescheid -subject:"offene Rechnung" "' + k.nachname + '"', 0, 1).length) continue;
    const bezahlt = bezahltLaut(k, o);
    if (bezahlt === 'spaeter') { memo[id] = 'ok'; continue; } // Vorgang ist schon weiter – nichts nachholen
    if (!bezahlt) {
      // Rechnung noch offen: einmalig die Bitte um Zahlung ("Ihr Zuwendungsbescheid ist da – offene Rechnung"), falls noch nicht geschehen
      if (memo[id] !== 'bitte') {
        if (!s.wartetZahlung) s.wartetZahlung = { dateiId: zb.getId(), name: k.name || k.nachname };
        if (zuwendungZahlungsbitte_(o, s, k, probleme)) angelegt++;
        memo[id] = 'bitte';
      }
      continue;
    }
    zuwendungsEntwurfErzwingen_(o, zb, s, k, probleme);
    delete s.wartetZahlung;
    memo[id] = 'entwurf';
    angelegt++;
    probleme.push(o.getName() + ': Entwurf "Ihr Zuwendungsbescheid ist da" mit Bescheid im Anhang vorbereitet (Rechnung bezahlt' + (bezahlt === 'Qonto' ? ' laut Qonto' : ' am ' + bezahlt) + ') – bitte prüfen und senden.');
  }
  // einmal täglich: "Zuwendungsbescheid erhalten" + bezahlt, aber kein Bescheid-PDF im Ordner
  if (!L || !tagesAufgabeFaellig_('zb_fehlt_tag', 8) || zeitUeber_()) return;
  try {
    const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
    const ordner = ordnerListe_();
    const fehlt = [];
    listeDaten_(L).forEach(r => {
      const nn = String(r[L.sp['Nachname'] - 1] || '').trim();
      if (!nn || !L.sp['Bearbeitungsstand'] || !/zuwendungsbescheid erhalten/i.test(String(r[L.sp['Bearbeitungsstand'] - 1]))) return;
      if (!L.sp['Bezahlung'] || !istDatum_(String(r[L.sp['Bezahlung'] - 1]).trim())) return;
      const plz = L.sp['PLZ'] ? String(r[L.sp['PLZ'] - 1]).trim() : '';
      const o = ordner.find(x => norm(nachnameAusOrdner_(x.getName())) === norm(nn) && (!plz || x.getName().indexOf(plz) >= 0));
      if (!o) return;
      if (dateienCache_(o).some(f => /zuwendungsbescheid/i.test(f.getName()))) return;
      const mail = L.sp['E-Mail'] ? String(r[L.sp['E-Mail'] - 1]).trim() : '';
      if (mail && GmailApp.search('in:sent to:' + mail + ' subject:Zuwendungsbescheid has:attachment', 0, 1).length) return;
      fehlt.push(nn);
    });
    if (fehlt.length) probleme.push('Laut Liste "Zuwendungsbescheid erhalten" und Rechnung bezahlt, aber kein Zuwendungsbescheid (PDF) im Kundenordner: ' + fehlt.join(', ') +
      ' – bitte den Bescheid aus dem BAFA-Portal in den Ordner legen (Name mit "Zuwendungsbescheid"), dann wird der Entwurf automatisch erstellt.');
    tagesAufgabeErledigt_('zb_fehlt_tag');
  } catch (e) { console.log('ZB fehlt: ' + e.message); }
}
// Bezahlt? Datum aus der Liste (Spalte Bezahlung) bzw. 'Qonto' (Bezahlt-Mail); 'spaeter' = Vorgang schon weiter (VN …); '' = offen
function zbBezahlt_(k, ordner) {
  try {
    const L = liste_();
    if (L && L.sp['Bezahlung']) {
      const row = ordner ? listenZeileFuerOrdner_(L, ordner, k) : listeZeile_(L, k.nachname, k.vorname);
      if (row > 0) {
        const v = L.sh.getRange(row, L.sp['Bezahlung']).getDisplayValue().trim();
        if (istDatum_(v)) return v;
        const stand = L.sp['Bearbeitungsstand'] ? L.sh.getRange(row, L.sp['Bearbeitungsstand']).getDisplayValue() : '';
        const bem = L.sp['Bemerkung'] ? L.sh.getRange(row, L.sp['Bemerkung']).getDisplayValue() : '';
        if (VN_STAND.test(stand) || /vorgang erledigt/i.test(bem)) return 'spaeter';
      }
    }
  } catch (e) {}
  // V65: Qonto-Bezahlt-Mail über die Rechnungsnummer der zuletzt verschickten Rechnung (eindeutig – auch wenn der Ehepartner
  // bezahlt hat; früher zählte jede Bezahlt-Mail mit dem Nachnamen, z. B. eine alte Rechnung oder ein anderer Kunde gleichen Namens)
  if (!istBezahlt_(k.name || k.nachname)) return ''; // schnell: keine Bezahlt-Mail mit dem Namen → offen
  try {
    const re = k.email ? rechnungPdf_(k.email) : null;
    if (re) return GmailApp.search('from:invoice@qonto.com subject:"wurde bezahlt" "' + re.nr + '"', 0, 1).length ? 'Qonto' : '';
  } catch (e) {}
  return 'Qonto';
}
// Wurde der Zuwendungsbescheid selbst schon verschickt? (Mail mit "Zuwendungsbescheid" im Betreff + Anhang,
// aber nicht die Zahlungsbitte "… offene Rechnung")
function zbGesendet_(k) {
  const q = 'in:sent subject:Zuwendungsbescheid -subject:"offene Rechnung" has:attachment ';
  // Name nur im BETREFF suchen (im Text kann der Name auch in der Mail an einen anderen Kunden stehen,
  // z. B. stand "Frau Wengert" versehentlich in einer Mail an Frau Wendl)
  return (k.email && GmailApp.search(q + 'to:' + k.email, 0, 1).length > 0) || GmailApp.search(q + 'subject:"' + k.nachname + '"', 0, 1).length > 0;
}
// Zuwendungsbescheid ist da, Rechnung aber noch offen → Entwurf mit der Bitte um Zahlung (Bescheid kommt nach Zahlungseingang)
function zuwendungZahlungsbitte_(ordner, s, k, probleme) {
  if (!k.email) { probleme.push(ordner.getName() + ': Zuwendungsbescheid da, Rechnung offen – keine Kunden-E-Mail gefunden, Zahlungsbitte bitte selbst schreiben.'); return false; }
  // schon um Zahlung gebeten oder Entwurf vorhanden?
  if (GmailApp.search('in:sent to:' + k.email + ' (subject:Zuwendungsbescheid OR "offene Rechnung" OR "Rechnung noch offen") newer_than:30d', 0, 1).length ||
      GmailApp.search('in:sent subject:Zuwendungsbescheid "' + k.nachname + '" newer_than:30d', 0, 1).length ||
      GmailApp.search('in:drafts "' + k.nachname + '" (subject:Zuwendungsbescheid OR subject:"Rechnung noch offen")', 0, 1).length) return false;
  const re = rechnungPdf_(k.email);
  const vom = re ? ' vom ' + re.d8.slice(6, 8) + '.' + re.d8.slice(4, 6) + '.' + re.d8.slice(0, 4) : '';
  const zeilen = [
    begruessung_(k.anrede, k.nachname), '',
    'ich freue mich, Ihnen mitteilen zu dürfen, dass Ihr Förderantrag vom BAFA genehmigt wurde und uns Ihr Zuwendungsbescheid vorliegt.', '',
    'Damit wir Ihnen diesen zukommen lassen können, bitten wir Sie noch, die offene Rechnung' + (re ? ' Nr. ' + re.nr + vom : '') +
      ' zu begleichen, die wir Ihnen per E-Mail zugesandt haben.' + (re ? ' Zur Sicherheit finden Sie die Rechnung nochmals im Anhang.' : ''), ''
  ];
  if (re) zeilen.push('Bankverbindung:', 'Amina Lemzouri', 'IBAN: DE68 1001 0123 2733 2366 08', 'BIC: QNTODEB2XXX', 'Verwendungszweck: ' + re.nr, '');
  zeilen.push('Sobald der Zahlungseingang durch die Buchhaltung bestätigt ist, sende ich Ihnen den Zuwendungsbescheid umgehend zu.', '',
    'Sollte sich Ihre Zahlung mit dieser E-Mail überschnitten haben, betrachten Sie diese Nachricht bitte als gegenstandslos.', '', SIGNATUR);
  entwurf_(k.email, 'Ihr Zuwendungsbescheid ist da – offene Rechnung', pruefHinweis_(k.anrede) + zeilen.join('\n'), re ? { attachments: [re.blob] } : {});
  if (re && s.wartetZahlung) s.wartetZahlung.d8 = re.d8;
  s.erinnertAm = new Date().toISOString(); // die tägliche Zahlungserinnerung wartet dann 21 Tage
  probleme.push(ordner.getName() + ': Zuwendungsbescheid da, Rechnung noch offen – Entwurf "Ihr Zuwendungsbescheid ist da – offene Rechnung" vorbereitet. Nach Zahlungseingang folgt automatisch der Entwurf mit dem Bescheid.');
  return true;
}

// wie zuwendungsEntwurf_, aber ohne die Betreff-Prüfung (die wurde oben genauer gemacht: gesendet mit Anhang / Entwurf)
function zuwendungsEntwurfErzwingen_(ordner, datei, s, k, probleme) {
  const steuer = k.steuerId || steuerIdAusMails_(k.email);
  const zeilen = [
    begruessung_(k.anrede, k.nachname), '',
    'vielen Dank für die Begleichung der Rechnung.',
    'ich freue mich, Ihnen mitteilen zu können, dass der Förderantrag vom BAFA genehmigt wurde. Den Zuwendungsbescheid finden Sie im Anhang.', '',
    'Für die spätere Auszahlung der Fördermittel ist die Einreichung des Verwendungsnachweises erforderlich. Bitte senden Sie mir hierzu nach vollständigem Abschluss der Maßnahme folgende Dokumente per E-Mail:', '',
    'Schlussrechnung der Firma Eibner & Regnath nebst ausgefülltem Rechnungsbeiblatt', '',
    'Zahlungsbeleg (Kontoauszug oder qualifizierte Überweisungsbestätigung zum Nachweis des Geldflusses)', '',
    'IBAN des Antragstellers (Kontoinhaber muss mit dem Antragsteller identisch sein)',
    steuer ? 'Ihre Steuer-ID für die Auszahlung des Zuschusses. Diese liegt uns bereits vor.'
           : 'Ihre Steuer-ID (11-stellig) für die Auszahlung des Zuschusses. Diese liegt uns leider noch nicht vor.', '',
    'Nach Erhalt der Unterlagen werde ich die technische Projektbestätigung umgehend für Sie erstellen und einreichen.', '',
    SIGNATUR
  ];
  entwurf_(k.email, 'Ihr Zuwendungsbescheid ist da ' + [k.anrede, k.nachname].filter(Boolean).join(' '),
    pruefHinweis_(k.anrede) + zeilen.join('\n'), { attachments: [datei.getBlob()] });
}

// ===================== STUFE 3b: ZAHLUNGSERINNERUNG =====================
// Einmal täglich (ab 7 Uhr): Für jeden Kunden mit Zuwendungsbescheid im Ordner, dessen Rechnung noch offen
// und seit mehr als 10 Tagen fällig ist, wird eine freundliche Zahlungserinnerung als ENTWURF angelegt –
// mit der Rechnungs-PDF aus deiner gesendeten Antragsbestätigung im Anhang. Höchstens alle 21 Tage pro Kunde.
const ERINNERUNG_FRIST_TAGE = 10, ERINNERUNG_ABSTAND_TAGE = 21;

function zahlungserinnerungen_(st, probleme) {
  const jetzt = new Date();
  if (!tagesAufgabeFaellig_('erinnerung_tag', 7)) return;
  const L = liste_();
  const fmt = d => Utilities.formatDate(d, 'Europe/Berlin', 'dd.MM.yyyy');
  for (const o of ordnerListe_()) {
    if (zeitUeber_()) return; // im nächsten Lauf weitermachen
    const s = st[o.getId()];
    if (!s) continue;
    try {
      if (s.erinnertAm && (jetzt - new Date(s.erinnertAm)) < ERINNERUNG_ABSTAND_TAGE * 864e5) continue;
      const zb = dateienCache_(o).find(f => /zuwendungsbescheid/i.test(f.getName()));
      if (!zb) continue;
      const k = kundeAusOrdner_(o, s);
      if (!k.email) continue;
      // laut Liste schon bezahlt?
      if (L && L.sp['Bezahlung']) {
        const row = listenZeileFuerOrdner_(L, o, k);
        if (row > 0 && istDatum_(L.sh.getRange(row, L.sp['Bezahlung']).getDisplayValue())) continue;
      }
      // Zuwendungsbescheid schon verschickt (= bezahlt)?
      if (GmailApp.search('in:sent to:' + k.email + ' subject:Zuwendungsbescheid -subject:"offene Rechnung" has:attachment', 0, 1).length) continue;
      const re = rechnungPdf_(k.email);
      if (!re) {
        if (!s.erinnerungOhnePdf) { probleme.push(o.getName() + ': Zuwendungsbescheid da, Rechnung offen – aber keine Rechnungs-PDF (EB-…) in den gesendeten Mails gefunden. Zahlungserinnerung bitte selbst schreiben.'); s.erinnerungOhnePdf = true; }
        continue;
      }
      // laut Qonto-Mail bezahlt?
      if (GmailApp.search('from:invoice@qonto.com subject:"wurde bezahlt" "' + re.nr + '"', 0, 1).length) continue; // Rechnungsnummer (egal wer bezahlt hat)
      const faellig = new Date(re.datum.getTime() + ERINNERUNG_FRIST_TAGE * 864e5);
      if (Utilities.formatDate(jetzt, 'Europe/Berlin', 'yyyyMMdd') <= Utilities.formatDate(faellig, 'Europe/Berlin', 'yyyyMMdd')) continue;
      // in den letzten 21 Tagen schon selbst erinnert oder Entwurf vorhanden?
      const schon = GmailApp.search('in:sent to:' + k.email + ' newer_than:' + ERINNERUNG_ABSTAND_TAGE + 'd ("Rechnung noch offen" OR "offene Rechnung" OR "Zahlungseingang" OR "Begleichung der Rechnung")', 0, 1).length
        || GmailApp.search('in:drafts subject:"Rechnung noch offen" "' + k.nachname + '"', 0, 1).length;
      if (schon) continue;

      const zeilen = [
        begruessung_(k.anrede, k.nachname), '',
        'ich habe gute Nachrichten für Sie: Ihr Förderantrag wurde vom BAFA genehmigt, der Zuwendungsbescheid liegt uns bereits vor.', '',
        'Leider konnten wir zu unserer Rechnung Nr. ' + re.nr + ' trotz abgelaufener Zahlungsfrist bisher keinen Zahlungseingang feststellen. ' +
        'Damit wir Ihnen den Zuwendungsbescheid zukommen lassen können, bitten wir Sie, die offene Rechnung zu begleichen. Die Rechnung finden Sie zur Sicherheit nochmals im Anhang.', '',
        'Bankverbindung:', 'Amina Lemzouri', 'IBAN: DE68 1001 0123 2733 2366 08', 'BIC: QNTODEB2XXX', 'Verwendungszweck: ' + re.nr, '',
        'Sobald der Zahlungseingang bestätigt ist, sende ich Ihnen den Zuwendungsbescheid umgehend zu.', '',
        'Sollte sich Ihre Zahlung mit dieser E-Mail überschnitten haben, betrachten Sie diese Nachricht bitte als gegenstandslos.', '',
        SIGNATUR
      ];
      entwurf_(k.email, 'Ihr Förderantrag wurde genehmigt / Rechnung noch offen – ' + k.nachname,
        pruefHinweis_(k.anrede) + zeilen.join('\n'), { attachments: [re.blob] });
      s.erinnertAm = jetzt.toISOString();
      // nach Zahlung kommt dann automatisch der Entwurf "Ihr Zuwendungsbescheid ist da" mit Anhang
      if (!s.wartetZahlung) s.wartetZahlung = { dateiId: zb.getId(), name: (k.vorname ? k.vorname + ' ' : '') + k.nachname, d8: re.d8 };
      else s.wartetZahlung.d8 = re.d8;
      probleme.push('Zahlungserinnerung als Entwurf vorbereitet: ' + k.nachname + ' (Rechnung ' + re.nr + ', fällig seit ' + fmt(faellig) + ').');
    } catch (e) {
      probleme.push(o.getName() + ': Zahlungserinnerung fehlgeschlagen – ' + e.message);
    }
  }
  tagesAufgabeErledigt_('erinnerung_tag');
}

// ===================== STUFE 2b: NACHFRAGE BEIM BAFA =====================
// Einmal täglich (ab 7 Uhr): Ist der Antrag (begpt_…pdf im Ordner) seit mehr als 30 Tagen eingereicht und
// noch kein Zuwendungsbescheid da, wird eine freundliche Anfrage an das BAFA als ENTWURF angelegt.
// Vorgangsnummer = Zahl am Anfang des Ordnernamens (z. B. "95046696 Grabichler …"). Höchstens alle 14 Tage pro Vorgang.
const BAFA_ADRESSE = 'beg@bafa.bund.de', BAFA_NACH_TAGEN = 30, BAFA_ABSTAND_TAGE = 14;

function bafaNachfragen_(st, probleme) {
  const jetzt = new Date();
  if (!tagesAufgabeFaellig_('bafa_tag', 8)) return;
  const L = liste_();
  const fmt = d => Utilities.formatDate(d, 'Europe/Berlin', 'dd.MM.yyyy');
  const fertig = /zuwendungsbescheid|verwendungsnachweis|festsetzung|^vn |erledigt|storniert/i;
  let anzahl = 0;
  for (const o of ordnerListe_()) {
    if (zeitUeber_()) return;
    const s = st[o.getId()];
    if (!s) continue;
    if (anzahl >= 10) break; // Sicherung: höchstens 10 BAFA-Entwürfe pro Tag
    try {
      if (s.bafaAm && (jetzt - new Date(s.bafaAm)) < BAFA_ABSTAND_TAGE * 864e5) continue;
      const dateien = dateienCache_(o);
      if (dateien.some(f => /zuwendungsbescheid|festsetzungsbescheid/i.test(f.getName()))) continue;
      const antrag = dateien.filter(f => /^begpt_/i.test(f.getName())).sort((a, b) => a.getDateCreated() - b.getDateCreated())[0];
      if (!antrag) continue; // noch nicht eingereicht
      const eingereicht = antrag.getDateCreated();
      if ((jetzt - eingereicht) < BAFA_NACH_TAGEN * 864e5) continue;
      const nr = (o.getName().match(/^(\d{7,9})/) || [])[1];
      if (!nr) {
        if (!s.bafaOhneNr) { probleme.push(o.getName() + ': Antrag seit ' + fmt(eingereicht) + ' ohne Zuwendungsbescheid – aber keine Vorgangsnummer am Anfang des Ordnernamens. BAFA-Anfrage bitte selbst stellen oder Nummer vorne im Ordnernamen ergänzen.'); s.bafaOhneNr = true; }
        continue;
      }
      const k = kundeAusOrdner_(o, s);
      // Stand laut Liste schon weiter?
      let ortZeile = '';
      if (L) {
        const row = listenZeileFuerOrdner_(L, o, k);
        if (row > 0) {
          const z = L.sh.getRange(row, 1, 1, L.sh.getLastColumn()).getDisplayValues()[0];
          if (L.sp['Bearbeitungsstand'] && fertig.test(String(z[L.sp['Bearbeitungsstand'] - 1]).trim())) continue;
          if (!k.vorname && L.sp['Vorname']) k.vorname = String(z[L.sp['Vorname'] - 1]).trim();
          if (L.sp['PLZ'] && L.sp['Ort']) ortZeile = (String(z[L.sp['PLZ'] - 1]).trim() + ' ' + String(z[L.sp['Ort'] - 1]).trim()).trim();
        }
      }
      // kürzlich schon nachgefragt oder Antwort vom BAFA bekommen?
      const kurz = GmailApp.search('in:sent to:bafa.bund.de "' + nr + '" newer_than:' + BAFA_ABSTAND_TAGE + 'd', 0, 1).length
        || GmailApp.search('from:bafa.bund.de "' + nr + '" newer_than:7d', 0, 1).length
        || GmailApp.search('in:drafts to:bafa.bund.de "' + nr + '"', 0, 1).length;
      if (kurz) continue;

      const zeilen = [
        'Sehr geehrte Damen und Herren,', '',
        'für den im Betreff genannten Vorgang haben wir den Förderantrag am ' + fmt(eingereicht) + ' eingereicht. ' +
        'Bisher liegt uns noch kein Zuwendungsbescheid vor, und wir haben auch keine Rückfrage von Ihnen erhalten.', '',
        'Dürfen wir Sie freundlich fragen, wie der aktuelle Stand der Bearbeitung ist? Sollten noch Unterlagen oder Angaben fehlen, unterstützen wir Sie selbstverständlich gerne – geben Sie uns einfach kurz Bescheid, dann reichen wir alles umgehend nach.', '',
        'Die Maßnahme soll zeitnah umgesetzt werden.' + ' Wir wären Ihnen daher sehr dankbar, wenn Sie den Antrag zeitnah prüfen und genehmigen könnten.', '',
        'Vielen Dank für Ihre Unterstützung.', '',
        SIGNATUR
      ];
      entwurf_(BAFA_ADRESSE, 'Rückfrage zum Vorgang ' + nr + ' – Bitte um zeitnahe Genehmigung', zeilen.join('\n'));
      s.bafaAm = jetzt.toISOString();
      anzahl++;
      probleme.push('BAFA-Anfrage als Entwurf vorbereitet: Vorgang ' + nr + ' (' + k.nachname + ', eingereicht am ' + fmt(eingereicht) + ').');
    } catch (e) {
      probleme.push(o.getName() + ': BAFA-Anfrage fehlgeschlagen – ' + e.message);
    }
  }
  tagesAufgabeErledigt_('bafa_tag');
}

// Sucht in deinen gesendeten Mails an den Kunden die Qonto-Rechnungs-PDF (z. B. "2609-EB-20260928-01-Joven.pdf")
function rechnungPdf_(email) {
  let best = null;
  const erstVersand = {}; // Rechnungsnummer → frühestes Versanddatum (für "Rechnung verschickt TT.MM.JJ")
  GmailApp.search('in:sent to:' + email + ' has:attachment', 0, 20).forEach(t => t.getMessages().forEach(m => {
    if (!/energieberatungmuenchen/i.test(m.getFrom())) return;
    m.getAttachments().forEach(a => {
      const x = a.getName().match(/EB-?(\d{8})-?(\d{2})/i);
      if (!x) return;
      const datum = new Date(+x[1].slice(0, 4), +x[1].slice(4, 6) - 1, +x[1].slice(6, 8));
      // Fälligkeit ab dem späteren Datum: Rechnungsnummer oder Versand der Mail (nie zu früh erinnern)
      const ab = new Date(Math.max(datum.getTime(), m.getDate().getTime()));
      const key = x[1] + x[2];
      if (!erstVersand[key] || m.getDate() < erstVersand[key]) erstVersand[key] = m.getDate();
      if (!best || x[1] + x[2] > best.d8 + best.n2) best = { n2: x[2],  blob: a.copyBlob().setName(a.getName()), datum: ab, d8: x[1], nr: 'EB - ' + x[1] + ' - ' + x[2] };
    });
  }));
  if (best) best.gesendet = erstVersand[best.d8 + best.n2];
  return best;
}

// ===================== STUFE 5: FESTSETZUNGSBESCHEID =====================
function festsetzungsEntwurf_(ordner, datei, s, probleme) {
  const k = kundeAusOrdner_(ordner, s);
  if (!k.email) { probleme.push(ordner.getName() + ': Festsetzungsbescheid da, aber keine Kunden-E-Mail gefunden.'); return; }
  if (mailMitNameExistiert_('Festsetzungsbescheid', k.nachname)) return;
  const zeilen = [
    begruessung_(k.anrede, k.nachname), '',
    'wir freuen uns, Ihnen mitteilen zu dürfen, dass wir den Festsetzungsbescheid erhalten haben und Ihnen die komplette bewilligte Summe in den nächsten Tagen ausgezahlt wird.', '',
    'Anbei erhalten Sie den Festsetzungsbescheid der Bafa.', '',
    'Damit ist für uns Ihr Vorgang hoffentlich auch zu Ihrer vollsten Zufriedenheit abgeschlossen.',
    FESTSETZUNG_WEITERE_BERATUNG, '',
    'Wir unterstützen Sie gerne.', '',
    'Falls Sie mit meiner Arbeit zufrieden waren und Ihre Auszahlung erhalten haben, wäre ich Ihnen für eine positive Bewertung über den untenstehenden Link sehr dankbar.', '',
    '-> Amina Lemzouri - Ingenieurbüro ' + CFG.BEWERTUNGS_LINK, '',
    SIGNATUR
  ];
  entwurf_(k.email, 'Festsetzungsbescheid - ' + k.nachname,
    '### BITTE PRÜFEN: Wurde die volle Summe festgesetzt? Sonst Satz 1 anpassen. (Diese Zeile löschen) ###\n\n'
    + pruefHinweis_(k.anrede) + zeilen.join('\n'), { attachments: [datei.getBlob()] });
}

// ===================== EINGANG: ANHÄNGE ABLEGEN =====================
function eingangVerarbeiten_(st, probleme) {
  const label = holeLabel_();
  const ab = Utilities.formatDate(new Date(st._start), 'Europe/Berlin', 'yyyy/MM/dd');
  const threads = GmailApp.search('in:inbox has:attachment after:' + ab + ' -from:me -from:qonto.com -from:eibner-regnath.de', 0, 50);
  const ordner = ordnerListe_();
  st._msgs = st._msgs || [];
  // Einmalig: Mails, deren Fotos als "eingebettete Bilder" kamen (iPhone-Mail), wurden früher übersehen –
  // diese aus der Liste der erledigten Mails nehmen, damit sie jetzt verarbeitet werden.
  if ((st._eingangV || 0) < 2) {
    const grenze = Date.now() - 4 * 24 * 3600 * 1000;
    st._msgs = st._msgs.filter(id => {
      try {
        const m = GmailApp.getMessageById(id);
        if (!m || m.getDate().getTime() < grenze) return true;
        const normal = m.getAttachments({ includeInlineImages: false }).filter(a => /pdf|image/i.test(a.getContentType()) && a.getSize() > 30000);
        return normal.length > 0 || mailAnhaenge_(m).length === 0;
      } catch (e) { return true; }
    });
    st._eingangV = 2;
  }
  // Einmalig: Mails der letzten 4 Tage, die keinem Kunden zugeordnet werden konnten (kein Label "abgelegt"),
  // mit der verbesserten Zuordnung (andere Absender-Adresse, Name im Absender …) noch einmal prüfen – z. B. Memmler
  // (v5: nochmals – Zuordnung über den Mailverlauf, z. B. Köhl antwortet von anderer Adresse auf deine Mail)
  if ((st._eingangV || 0) < 5) {
    const grenze = Date.now() - 4 * 864e5, lname = label.getName();
    st._msgs = st._msgs.filter(id => {
      try {
        const m = GmailApp.getMessageById(id);
        if (!m || m.getDate().getTime() < grenze) return true;
        return m.getThread().getLabels().some(l => l.getName() === lname);
      } catch (e) { return true; }
    });
  }
  // Einmalig: Texte der Kundenmails der letzten 4 Tage, die schon abgelegt wurden, auf Steuer-ID/IBAN prüfen
  if ((st._eingangV || 0) < 3) {
    const grenze = Date.now() - 4 * 864e5;
    st._msgs.forEach(id => {
      try {
        const m = GmailApp.getMessageById(id);
        if (!m || m.getDate().getTime() < grenze) return;
        const absender = (m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1].toLowerCase().trim();
        const o = ordnerFuerEmail_(absender, ordner, st, m);
        if (o) angabenAusEingangsMail_(o, st[o.getId()] || {}, m, st);
      } catch (e) {}
    });
    st._eingangV = 3;
  }
  if ((st._eingangV || 0) < 5) st._eingangV = 5;
  // Einmalig (V62): Mails der letzten 2 Tage ohne Label "abgelegt" noch einmal prüfen (z. B. Köhls unterschriebene Vollmacht vom 05.10.)
  if ((st._eingangV || 0) < 6) {
    const grenze = Date.now() - 2 * 864e5, lname = label.getName();
    st._msgs = st._msgs.filter(id => {
      try {
        const m = GmailApp.getMessageById(id);
        if (!m || m.getDate().getTime() < grenze) return true;
        return m.getThread().getLabels().some(l => l.getName() === lname);
      } catch (e) { return true; }
    });
    st._eingangV = 6;
  }
  // Einmalig (V64): Die Prüfung oben schaut auf das Label des ganzen Verlaufs – kam eine neue Mail in einen schon
  // "abgelegten" Verlauf (Köhl: unterschriebene Vollmacht am 05.10.), wurde sie übersehen. Jetzt: Mails der letzten
  // 2 Tage mit Anhang, nach deren Eingang im passenden Kundenordner keine Datei angelegt wurde, noch einmal verarbeiten.
  if ((st._eingangV || 0) < 7) {
    const grenze = Date.now() - 4 * 864e5;
    st._msgs = st._msgs.filter(id => {
      try {
        const m = GmailApp.getMessageById(id);
        if (!m || m.getDate().getTime() < grenze || !mailAnhaenge_(m).length) return true;
        const absender = ((m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1] || '').toLowerCase().trim();
        const o = ordnerFuerEmail_(absender, ordner, st, m);
        if (!o) return true; // keinem Kunden zugeordnet – wurde schon gemeldet
        const danach = alleDateien_(o).some(f => f.getDateCreated().getTime() >= m.getDate().getTime());
        return danach; // nichts abgelegt → aus der Liste nehmen = neu verarbeiten
      } catch (e) { return true; }
    });
    st._eingangV = 7;
  }
  const erledigt = id => { // Mail als verarbeitet merken (erst NACH dem Ablegen – V65)
    if (st._msgs.indexOf(id) < 0) st._msgs.push(id);
    if (st._msgs.length > 1000) st._msgs = st._msgs.slice(-1000);
    if (st._msgVersuch) delete st._msgVersuch[id];
    if (st._msgAb) delete st._msgAb[id];
  };
  st._msgVersuch = st._msgVersuch || {};
  st._msgAb = st._msgAb || {}; // Beginn des letzten Versuchs (nur gesetzt, solange ein Versuch läuft bzw. hart abgebrochen wurde)
  let zeitAbbruch = false;
  threads.forEach(t => {
    t.getMessages().forEach(m => {
      if (zeitAbbruch) return;
      if (m.getDate() < new Date(st._start)) return;
      if (st._msgs.indexOf(m.getId()) >= 0) return;
      if (_mailFehlerImLauf[m.getId()]) return; // in diesem Lauf schon einmal gescheitert → erst im nächsten Lauf wieder
      if (zeitUeber_()) { zeitAbbruch = true; return; } // Rest im nächsten Lauf (nichts wird als erledigt gemerkt)
      const absender = ((m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1] || '').toLowerCase().trim();
      let o = null;
      const vorher = st._msgVersuch[m.getId()] || 0;
      try {
      o = ordnerFuerEmail_(absender, ordner, st, m);
      if (!o) { // keinem Kunden zuordenbar – bei typischen Unterlagen lieber Bescheid geben als still übergehen
        const text = (m.getSubject() + ' ' + m.getPlainBody().slice(0, 800));
        const anhX = mailAnhaenge_(m);
        erledigt(m.getId());
        // Beiblatt-Mails (z. B. von Herrn Braginskiy) übernimmt die Beiblatt-Prüfung: Ordner anlegen, Stern, hochladen
        if (anhX.length && anhX.every(istBeiblattAnhang_)) return;
        if (!eigeneAdresse_(absender) && /vollmacht|beiblatt|steuer|iban|zuwendung|bafa|förder|verwendungsnachweis|schlussrechnung|zahlungsbeleg/i.test(text)
            && anhX.length)
          probleme.push('Mail mit Anhang von ' + m.getFrom() + ' ("' + m.getSubject() + '") konnte keinem Kunden zugeordnet werden – bitte selbst ablegen (oder die Absender-Adresse in der Liste in der Spalte E-Mail eintragen).');
        return;
      }
      const s = st[o.getId()] || (st[o.getId()] = { gesehen: [], neuAusMail: true }); // neuAusMail: Ordner-Prüfung meldet ihn trotzdem als neu
      const anh = mailAnhaenge_(m);
      if (!anh.length) { erledigt(m.getId()); return; }
      // Schutz vor Endlosschleife (Zeitlimit oder wiederholter Fehler): nach zwei gescheiterten Versuchen nur noch melden
      const versuch = (st._msgVersuch[m.getId()] || 0) + 1;
      if (versuch > 2) {
        erledigt(m.getId());
        probleme.push(o.getName() + ': Mail "' + m.getSubject() + '" von ' + absender + ' konnte zweimal nicht verarbeitet werden (Zeitlimit oder Fehler) – Anhänge bitte von Hand ablegen.');
        return;
      }
      // Wiederholung nach hartem Abbruch (Zeitlimit): wurde während des abgebrochenen Versuchs schon etwas abgelegt, nicht doppelt ablegen
      const abVersuch = st._msgAb[m.getId()];
      if (versuch > 1 && abVersuch && alleDateien_(o).some(f => f.getDateCreated().getTime() >= abVersuch - 5000 && /^(Vollmacht_|Unterlagen_|Digitales_Beiblatt_)/.test(f.getName()))) {
        erledigt(m.getId());
        t.addLabel(label);
        probleme.push(o.getName() + ': Mail "' + m.getSubject() + '" von ' + absender + ' – beim letzten Lauf unterbrochen, Anhänge liegen aber schon im Kundenordner. Bitte kurz prüfen, ob alles vollständig abgelegt ist.');
        return;
      }
      st._msgVersuch[m.getId()] = versuch;
      st._msgAb[m.getId()] = Date.now();
      speichereStatus_(st);
      const dateien = alleDateien_(o).map(f => f.getName());
      const hatSigniert = dateien.some(n => /vollmacht/i.test(n) && !/_beg_formular_beg_vm/i.test(n));
      const hatAntrag = dateien.some(n => /^begpt_/i.test(n));
      const hatZuwendung = dateien.some(n => /zuwendungsbescheid/i.test(n));
      const nn = kundeAusOrdner_(o, s).nachname || nachnameAusOrdner_(o.getName());
      // Digitales Beiblatt (z. B. Kopie der Mail von Herrn Braginskiy an den Kunden) – nie als Vollmacht ablegen
      if (!hatZuwendung && anh.every(istBeiblattAnhang_)) {
        if (!dateien.some(n => /beiblatt/i.test(n))) {
          // V65: NICHT als "gesehen" merken – sonst wurde für dieses Beiblatt nie die Vollmacht vorbereitet.
          // Die Ordner-Prüfung gleich danach behandelt es wie ein hochgeladenes Beiblatt (Vollmacht + Entwurf, falls noch nicht geschehen).
          anh.forEach((a, i) => {
            o.createFile(a.copyBlob().setName('Digitales_Beiblatt_' + nn.replace(/\s+/g, '_') + (i ? '_' + (i + 1) : '') + '.pdf'));
          });
          probleme.push(o.getName() + ': Digitales Beiblatt aus der Mail "' + m.getSubject() + '" im Kundenordner abgelegt – es wird jetzt wie ein hochgeladenes Beiblatt ausgewertet.');
        }
        t.addLabel(label);
        erledigt(m.getId());
        speichereStatus_(st);
        return;
      }
      // Hinweise, dass es wirklich die Vollmacht ist: Wort im Dateinamen/Betreff/Text oder Antwort auf deine Mail "benötigte Unterlagen" / Erinnerung
      const vmWort = /vollmacht|_vm\b|_vm[ ._]|formular|unterschrieb|unterschrift/i.test(anh.map(a => a.getName()).join(' ') + ' ' + m.getSubject() + ' ' + ohneZitat_(m.getPlainBody()));
      const vmAntwort = /benötigte unterlagen|vollmacht/i.test(m.getSubject());
      // (V67) auch NACH dem Antrag: kommt die unterschriebene Vollmacht erst jetzt (z. B. Köhl: Antrag gestellt, handschriftliche
      // Vollmacht kam danach), wird sie als Vollmacht abgelegt – dann aber nur mit "Vollmacht"/"Unterschrift" in Mail oder Anhang
      if (!hatSigniert && (vmWort || (vmAntwort && !hatAntrag))) {
        const a = anh[0];
        if (!vmWort) probleme.push(o.getName() + ': Antwort auf "' + m.getSubject() + '" mit Anhang ("' + a.getName() + '") als unterschriebene Vollmacht abgelegt – im Text stand nicht ausdrücklich "Vollmacht", bitte kurz prüfen.');
        if (hatAntrag) probleme.push(o.getName() + ': Unterschriebene Vollmacht kam nach der Antragstellung und wurde abgelegt – bitte prüfen, ob sie im BAFA-Portal nachgereicht werden muss.');
        if (/_beg_formular_beg_vm/i.test(a.getName()))
          probleme.push(o.getName() + ': Die zurückgeschickte Vollmacht heißt noch wie das Formular ("' + a.getName() + '") – sie wurde als unterschriebene Vollmacht abgelegt, bitte kurz prüfen, ob sie wirklich handschriftlich unterschrieben ist.');
        const name = 'Vollmacht_' + nn + '_unterschrieben';
        let blob = a.copyBlob();
        if (!/pdf/i.test(a.getContentType())) { // Foto/Bild → als PDF ablegen (BAFA-Portal braucht PDF)
          try { blob = bildZuPdf_(blob); }
          catch (e) { probleme.push(o.getName() + ': Vollmacht-Bild konnte nicht in PDF umgewandelt werden (' + e.message + ') – Original abgelegt.'); }
        }
        const endung = blob.getContentType() === MimeType.PDF ? '.pdf' : ((a.getName().match(/\.[a-z0-9]+$/i) || [''])[0]);
        const f = o.createFile(blob.setName(name + endung));
        s.gesehen.push(f.getId());
        listeSetze_(o, s, { 'Vollmacht erteilt': [heute_()], 'Bearbeitungsstand': ['Vollmacht eingegangen'] }, probleme);
        angabenAusEingangsMail_(o, s, m, st, probleme);
        if (anh.length > 1) {
          // weitere Anhänge ebenfalls in den Kundenordner (Fotos als PDF), damit nichts verloren geht
          const weitere = [];
          anh.slice(1).forEach((x, i) => {
            try {
              let b = x.copyBlob();
              if (!/pdf/i.test(x.getContentType())) { try { b = bildZuPdf_(b); } catch (e) {} }
              const end = b.getContentType() === MimeType.PDF ? '.pdf' : ((x.getName().match(/\.[a-z0-9]+$/i) || [''])[0]);
              const g = o.createFile(b.setName('Unterlagen_' + nn + '_' + (i + 2) + '_' + x.getName().replace(/\.[a-z0-9]+$/i, '') + end));
              s.gesehen.push(g.getId());
              weitere.push(g.getName());
            } catch (e) { weitere.push(x.getName() + ' (nicht gespeichert: ' + e.message + ')'); }
          });
          probleme.push(o.getName() + ': Mail mit ' + anh.length + ' Anhängen – der erste ("' + a.getName() + '") wurde als Vollmacht_' + nn +
            '_unterschrieben.pdf gespeichert, die übrigen als ' + weitere.join(', ') + '. Bitte kurz prüfen, ob die Vollmacht wirklich das erste Foto ist (sonst Dateinamen tauschen).');
        }
      } else if (hatZuwendung) {
        const vn = vnOrdner_(o);
        anh.forEach(a => vn.createFile(a.copyBlob()));
        listeSetze_(o, s, { 'Bearbeitungsstand': ['Verwendungsnachweis eingegangen'] }, probleme);
        const sid = steuerIdAusText_(m.getPlainBody());
        if (sid) listeSetze_(o, s, { 'Bemerkung': { anhaengen: 'SteuerID: ' + sid } }, probleme);
      } else if (hatSigniert && vmWort) {
        // Es liegt schon eine "Vollmacht" im Ordner, der Antrag ist aber noch nicht gestellt und der Kunde schickt erneut
        // eine (unterschriebene) Vollmacht – z. B. Köhl: zuerst nur das Formular, dann das unterschriebene → als neue Fassung ablegen
        const tag = Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM.yy');
        const gespeichert = [];
        anh.forEach((a, i) => {
          let b = a.copyBlob();
          if (!/pdf/i.test(a.getContentType())) { try { b = bildZuPdf_(b); } catch (e) {} }
          const end = b.getContentType() === MimeType.PDF ? '.pdf' : ((a.getName().match(/\.[a-z0-9]+$/i) || [''])[0]);
          const g = o.createFile(b.setName('Vollmacht_' + nn + '_unterschrieben_' + tag.replace(/\./g, '-') + (i ? '_' + (i + 1) : '') + end));
          s.gesehen.push(g.getId());
          gespeichert.push(g.getName());
        });
        listeSetze_(o, s, { 'Vollmacht erteilt': [heute_()], 'Bearbeitungsstand': ['Vollmacht eingegangen'] }, probleme);
        angabenAusEingangsMail_(o, s, m, st, probleme);
        const alt = dateien.filter(n0 => /vollmacht/i.test(n0) && !/_beg_formular_beg_vm/i.test(n0));
        probleme.push(o.getName() + ': Neue Vollmacht von ' + absender + ' abgelegt als ' + gespeichert.join(', ') + ' (Vollmacht erteilt = heute). ' +
          'Im Ordner liegt noch die frühere Fassung (' + alt.join(', ') + ') – bitte fürs BAFA-Portal die neue nehmen und die alte ggf. umbenennen.' +
          (hatAntrag ? ' Achtung: Der Antrag ist schon gestellt – die neue Vollmacht ggf. im BAFA-Portal nachreichen.' : ''));
      } else {
        // nichts verlieren: Anhänge im Kundenordner ablegen und Bescheid geben
        const tag = Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'yyyy-MM-dd');
        const gespeichert = [];
        anh.forEach((a, i) => {
          try {
            let b = a.copyBlob(), name = a.getName();
            if (!/pdf/i.test(a.getContentType())) { try { b = bildZuPdf_(b); name = name.replace(/\.[a-z0-9]+$/i, '') + '.pdf'; } catch (e) { b = a.copyBlob(); } } // Fotos als PDF (V67)
            const g = o.createFile(b.setName('Unterlagen_' + nn + '_' + tag + '_' + (i + 1) + '_' + name));
            s.gesehen.push(g.getId());
            gespeichert.push(g.getName());
          } catch (e) { gespeichert.push(a.getName() + ' (nicht gespeichert: ' + e.message + ')'); }
        });
        probleme.push(o.getName() + ': Mail mit Anhang von ' + absender + ' ("' + m.getSubject() + '") – keiner Stufe eindeutig zuordenbar; Anhänge im Kundenordner abgelegt als ' + gespeichert.join(', ') + '. Bitte kurz ansehen.');
        angabenAusEingangsMail_(o, s, m, st, probleme);
      }
      t.addLabel(label);
      erledigt(m.getId());
      speichereStatus_(st);
      console.log('Mail verarbeitet: ' + m.getSubject() + ' (' + Math.round((Date.now() - LAUF_START) / 1000) + ' s)');
      } catch (e) {
        // V65: Fehler nicht mehr verschlucken – melden und im nächsten Lauf noch einmal versuchen (höchstens 2×)
        _mailFehlerImLauf[m.getId()] = true;
        delete st._msgAb[m.getId()]; // Fehler (kein harter Abbruch) → beim nächsten Versuch normal neu ablegen
        st._msgVersuch[m.getId()] = Math.max(st._msgVersuch[m.getId()] || 0, vorher + 1);
        const letzter = st._msgVersuch[m.getId()] >= 2;
        if (letzter) erledigt(m.getId());
        probleme.push((o ? o.getName() + ': ' : '') + 'Mail "' + m.getSubject() + '" von ' + absender + ' – Fehler beim Ablegen: ' + e.message +
          (letzter ? ' – zweiter Versuch gescheitert, Anhänge bitte von Hand ablegen.' : ' (wird im nächsten Lauf noch einmal versucht)'));
        try { speichereStatus_(st); } catch (e2) {}
      }
    });
  });
}
const _mailFehlerImLauf = {};

// Steuer-ID, IBAN usw. aus dem Text einer Kundenmail (z. B. der Mail mit der Vollmacht) in die Liste übernehmen
function angabenAusEingangsMail_(o, s, m, st, probleme) {
  try {
    st._antworten = st._antworten || [];
    if (st._antworten.indexOf(m.getId()) >= 0) return;
    const L = liste_();
    if (!L || !L.sp['Bemerkung']) return;
    const k = kundeAusOrdner_(o, s);
    const nn = k.nachname || nachnameAusOrdner_(o.getName());
    const row = listenZeileFuerOrdner_(L, o, k);
    if (row < 0) return;
    // Fehlen im Beiblatt Angaben (Baujahr, Wohneinheiten, Geburtsdatum …), die in der Bemerkung noch nicht als
    // "Für Antrag fehlt" stehen (z. B. von Hand angelegte Zeile wie Köhl), wird das ergänzt – dann werden sie
    // aus dieser und späteren Kundenmails übernommen und automatisch ins Beiblatt geschrieben.
    try {
      let bb = s.bb;
      if (!bb) {
        const datei = alleDateien_(o).filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()) && f.getMimeType() === MimeType.PDF)
          .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
        if (datei) bb = leseFormularfelder_(datei.getBlob().getBytes(), pako_());
      }
      if (bb) {
        const z = L.sh.getRange(row, L.sp['Bemerkung']);
        const bem = z.getDisplayValue();
        const schon = (bem.match(/Für Antrag fehlt:\s*([^\/]+)/i) || [])[1] || '';
        const neuFehlt = fehlendeAngaben_(bb).filter(x => x.key !== 'steuer' && x.key !== 'wnr')
          .filter(x => {
            // schon als Wert in der Bemerkung? (z. B. "Baujahr: 1992")
            const lab = { geb: /geburtsdatum\s*:?\s*\d/i, bj: /baujahr\s*:?\s*\d{4}/i, we: /(anzahl\s+wohneinheiten|betroffene?\s+(?:wohneinheiten|we))\s*:?\s*\d/i, weGes: /(wohneinheiten|\bwe)\s*gesamt\s*:?\s*\d/i }[x.key];
            return !(lab && lab.test(bem)) && schon.toLowerCase().indexOf(x.kurz.replace(/\s*\(.*\)$/, '').toLowerCase()) < 0;
          });
        if (neuFehlt.length && !/vorgang erledigt/i.test(bem)) {
          const zusatz = neuFehlt.map(x => x.kurz.replace(/\s*\(.*\)$/, '')).join(', ');
          const neu = schon ? bem.replace(/Für Antrag fehlt:\s*([^\/]+)/i, (m0, a) => 'Für Antrag fehlt: ' + a.trim() + ', ' + zusatz + ' ')
                            : bem + (bem.trim() ? ' / ' : '') + 'Für Antrag fehlt: ' + zusatz;
          bemerkungSicherSchreiben_(z, bem, neu, rtv => {
            const t = rtv.getText(), mm = t.match(/Für Antrag fehlt:\s*([^\/]+)/i);
            if (mm) return richErsetzen_(rtv, mm.index, mm.index + mm[0].length, 'Für Antrag fehlt: ' + mm[1].trim() + ', ' + zusatz + ' ');
            return richErsetzen_(rtv, t.length, t.length, (t.trim() ? ' / ' : '') + 'Für Antrag fehlt: ' + zusatz);
          });
        }
      }
    } catch (e) { console.log('Fehlende Angaben ergänzen: ' + e.message); }
    try { antwortEintragen_(L, { row, nachname: nn, vorname: k.vorname || '' }, m, '', false); }
    catch (e) { if (probleme) probleme.push(o.getName() + ': Angaben aus der Mail "' + m.getSubject() + '" konnten nicht in die Liste übernommen werden – ' + e.message + '. Bitte selbst eintragen.'); }
    st._antworten.push(m.getId()); // erst nach dem Eintragen merken (V65)
  } catch (e) { console.log('Angaben aus Eingangsmail: ' + e.message); if (probleme) probleme.push(o.getName() + ': Angaben aus der Mail "' + m.getSubject() + '" auslesen fehlgeschlagen – ' + e.message); }
}

// Ist der Anhang ein digitales Beiblatt (BEG EM) – und keine Vollmacht/Rechnung?
function istBeiblattAnhang_(a) {
  const n = a.getName();
  if (/vollmacht|_vm\b|_vm\.|rechnung|zahlungs|nachweis/i.test(n)) return false;
  if (/beiblatt/i.test(n)) return true;
  if (!/pdf/i.test(a.getContentType())) return false;
  try {
    const f = leseFormularfelder_(a.getBytes(), pako_());
    return !!(f && ('Vorname Nachname' in f) && (('Wohneinheiten gesamt' in f) || ('SteuerID 11stellig' in f) || ('PLZ_2' in f)));
  } catch (e) { return false; }
}

// PDF- und Bild-Anhänge einer Mail. Fotos vom iPhone kommen oft als "eingebettete Bilder" (inline) –
// die zählen mit, kleine eingebettete Bilder (Logos in Signaturen) nicht.
function mailAnhaenge_(m) {
  const normal = m.getAttachments({ includeInlineImages: false });
  const alle = m.getAttachments({ includeInlineImages: true });
  const istNormal = a => normal.some(n => n.getName() === a.getName() && n.getSize() === a.getSize());
  return alle.filter(a => /pdf|image/i.test(a.getContentType()) && a.getSize() > (istNormal(a) ? 30000 : 150000));
}

// ===================== BEIBLATT PER MAIL → KUNDENORDNER ANLEGEN =====================
// Kommt ein digitales Beiblatt (BEG EM) per Mail und gibt es für den Kunden noch KEINEN Ordner,
// wird der Ordner "<Nachname> <PLZ> <Ort>" im Ordner Kunden angelegt, mit Stern markiert und das Beiblatt
// als "Digitales_Beiblatt_<Nachname>.pdf" hochgeladen. Danach läuft alles wie gewohnt (Vollmacht, Liste …).
// Vorsichtig: Ordner zählt als vorhanden bei gleichem Nachnamen (auch Doppelnamen/Teile, Umlaute egal) und passender
// PLZ – auch im Archiv. Steht der Kunde schon in der Liste oder ist etwas unklar, wird nichts angelegt, sondern gemeldet.
// Geprüft werden alle Beiblatt-Mails der letzten 10 Tage (kein festes Startdatum mehr – vorher fiel z. B.
// Lorenzen vom 02.10. durch). Bestehende Kunden werden über die Ordner-Prüfung sicher übersprungen.
const BB_MAIL_TAGE = 10;
function beiblattMailsPruefen_(st, probleme) {
  st._bbMails = st._bbMails || [];
  // Einmalig: Mails, die wegen des alten Startdatums (03.10.) übersprungen wurden, neu prüfen
  if ((st._bbMailsV || 0) < 2) { st._bbMails = []; st._bbMailsV = 2; }
  const abDatum = new Date(Date.now() - BB_MAIL_TAGE * 864e5);
  const ab = Utilities.formatDate(abDatum, 'Europe/Berlin', 'yyyy/MM/dd');
  const threads = GmailApp.search('in:inbox after:' + ab + ' -from:me has:attachment (subject:beiblatt OR filename:beiblatt)', 0, 20);
  if (!threads.length) return;
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const root = DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID);
  let alle = null;
  const ordnerAlle = () => {
    if (alle) return alle;
    alle = [];
    const it = root.getFolders();
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed()) continue;
      if (/^0_?\s*archiv/i.test(f.getName())) { const a = f.getFolders(); while (a.hasNext()) { const x = a.next(); if (!x.isTrashed()) alle.push({ name: x.getName(), archiv: true }); } }
      else if (!/^[12]_/.test(f.getName())) alle.push({ name: f.getName(), archiv: false });
    }
    return alle;
  };
  const gleicherName = (a, b) => a && b && (a === b || (a.length >= 5 && b.length >= 5 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)));
  for (const t of threads) {
    for (const m of t.getMessages()) {
      if (zeitUeber_()) return;
      if (st._bbMails.indexOf(m.getId()) >= 0) continue;
      const von = ((m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1] || '').trim().toLowerCase();
      if (m.getDate() < abDatum || eigeneAdresse_(von)) { st._bbMails.push(m.getId()); continue; }
      const betreff = m.getSubject();
      const anh = m.getAttachments({ includeInlineImages: false }).filter(a => /pdf/i.test(a.getContentType()) && a.getSize() > 30000);
      for (const a of anh) {
        if (/rechnung|zahlungs|nachweis/i.test(a.getName() + ' ' + betreff)) continue; // Beiblatt zur Rechnung o. ä. – kein neuer Kunde
        if (/vollmacht|_vm\b|_vm\./i.test(a.getName())) continue; // Vollmacht, kein Beiblatt
        let f = null;
        try { f = leseFormularfelder_(a.getBytes(), pako_()); } catch (e) {}
        const w = n => String((f && f[n]) || '').trim();
        const istBegEm = f && ('Vorname Nachname' in f) && (('Wohneinheiten gesamt' in f) || ('SteuerID 11stellig' in f) || ('PLZ_2' in f));
        if (!istBegEm || !w('Vorname Nachname')) {
          if (/beiblatt/i.test(a.getName() + ' ' + betreff))
            probleme.push('Beiblatt per Mail ("' + betreff + '" von ' + von + ', ' + a.getName() + ') ließ sich nicht maschinell lesen – bitte selbst prüfen, ob es schon einen Kundenordner gibt.');
          continue;
        }
        // Name: Nachname bevorzugt aus dem Betreff ("Beiblatt_BEG_EM_ Pavlicek"), sonst aus dem Feld "Vorname Nachname"
        const teile = w('Vorname Nachname').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
        const bt = (betreff.match(/beiblatt[\s_-]*beg[\s_-]*em[\s_-]*(.+)$/i) || [])[1] || '';
        const btNorm = bt.split(/[\s!.,]+/).map(norm).filter(x => x.length >= 3);
        let nachname = '';
        const posB = teile.findIndex(x => btNorm.indexOf(norm(x)) >= 0);
        if (posB >= 0) nachname = teile[posB];
        else if (teile.length > 1 && anredeErmitteln_(teile[0]).sicher) nachname = teile.slice(1).join(' ');
        else if (teile.length > 1 && anredeErmitteln_(teile[teile.length - 1]).sicher) nachname = teile.slice(0, -1).join(' ');
        else nachname = teile[teile.length - 1];
        const plzW = (w('PLZ_2').match(/\d{5}/) || [])[0] || '', plzI = (w('PLZ').match(/\d{5}/) || [])[0] || '';
        const plz = plzW || plzI, ort = (plzW ? w('Ort_2') : w('Ort')).replace(/\s+/g, ' ').trim();
        if (!nachname || !plz || !ort) {
          probleme.push('Beiblatt per Mail ("' + betreff + '"): Name/PLZ/Ort unvollständig (' + w('Vorname Nachname') + ', ' + plz + ' ' + ort + ') – Ordner bitte selbst anlegen.');
          continue;
        }
        const nn = norm(nachname);
        // 1) gibt es schon einen Ordner?
        const treffer = ordnerAlle().filter(o => {
          if (!gleicherName(norm(nachnameAusOrdner_(o.name)), nn)) return false;
          const op = (o.name.match(/\b(\d{5})\b/) || [])[1];
          return !op || op === plzW || op === plzI;
        });
        if (treffer.some(o => !o.archiv)) continue; // Ordner vorhanden → nichts tun (wie bisher)
        if (treffer.length) {
          probleme.push('Beiblatt per Mail für ' + w('Vorname Nachname') + ' (' + plz + ' ' + ort + '): Es gibt nur einen Ordner im Archiv (' + treffer.map(o => o.name).join(', ') + ') – neuer Auftrag? Ordner bitte selbst anlegen.');
          continue;
        }
        // 2) steht der Kunde schon (aktiv) in der Liste? Dann lieber nicht automatisch anlegen
        try {
          const L = liste_();
          if (L) {
            const z = listeDaten_(L).find(r => norm(r[L.sp['Nachname'] - 1]) === nn && (!L.sp['PLZ'] || [plzW, plzI].indexOf(String(r[L.sp['PLZ'] - 1]).trim()) >= 0) &&
              !(L.sp['Bemerkung'] && /vorgang erledigt|storniert/i.test(String(r[L.sp['Bemerkung'] - 1]))));
            if (z) {
              probleme.push('Beiblatt per Mail für ' + w('Vorname Nachname') + ' (' + plz + ' ' + ort + '): Kunde steht schon in der Liste, aber es wurde kein passender Ordner gefunden – bitte prüfen (kein Ordner angelegt).');
              continue;
            }
          }
        } catch (e) {}
        // 3) Ordner anlegen, Stern setzen, Beiblatt hochladen
        const name = nachname + ' ' + plz + ' ' + ort;
        const o = root.createFolder(name);
        _ordnerListeCache = null; // neuer Ordner → Liste neu holen
        try { o.setStarred(true); } catch (e) {}
        o.createFile(a.copyBlob().setName('Digitales_Beiblatt_' + nachname.replace(/\s+/g, '_') + '.pdf'));
        ordnerAlle().push({ name, archiv: false });
        probleme.push('Neuer Kundenordner angelegt: "' + name + '" – Beiblatt aus der Mail "' + betreff + '" (' + von + ') hochgeladen, Ordner mit Stern markiert. Die Vollmacht wird jetzt wie gewohnt vorbereitet.');
      }
      st._bbMails.push(m.getId());
    }
  }
  if (st._bbMails.length > 1000) st._bbMails = st._bbMails.slice(-1000);
}

// ===================== BILD → PDF =====================
// JPEG (Handyfoto) wird verlustfrei in eine A4-PDF eingebettet, Drehung laut Kamera (EXIF) wird berücksichtigt.
// Andere Bildformate (PNG …) wandelt Google um.
function bildZuPdf_(blob) {
  const typ = blob.getContentType();
  if (/jpe?g/i.test(typ)) return Utilities.newBlob(jpegZuPdf_(blob.getBytes()), MimeType.PDF, 'bild.pdf');
  return blob.getAs(MimeType.PDF);
}

function jpegZuPdf_(roh) {
  const J = new Uint8Array(Int8Array.from(roh).buffer);
  let w = 0, h = 0, komp = 3, dreh = 1, p = 2;
  const u16 = (i, le) => le ? J[i] | (J[i + 1] << 8) : (J[i] << 8) | J[i + 1];
  while (p < J.length - 4) {
    if (J[p] !== 0xFF) { p++; continue; }
    const m = J[p + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
    const len = u16(p + 2);
    if (m === 0xE1 && String.fromCharCode(J[p + 4], J[p + 5], J[p + 6], J[p + 7]) === 'Exif') { // Drehung aus EXIF
      const t = p + 10, le = J[t] === 0x49, ifd = t + ((le ? (J[t + 4] | J[t + 5] << 8 | J[t + 6] << 16 | J[t + 7] << 24) : (J[t + 4] << 24 | J[t + 5] << 16 | J[t + 6] << 8 | J[t + 7])) >>> 0);
      const n = u16(ifd, le);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + 12 * k; if (u16(e, le) === 0x0112) dreh = u16(e + 8, le); }
    }
    if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].indexOf(m) >= 0) {
      h = u16(p + 5); w = u16(p + 7); komp = J[p + 9]; break;
    }
    p += 2 + len;
  }
  if (!w || !h) throw new Error('JPEG-Größe nicht lesbar');
  const quer = dreh >= 5; // 90°-Drehungen: Breite/Höhe tauschen
  const bw = quer ? h : w, bh = quer ? w : h;
  const PW = 595.28, PH = 841.89, R = 20;
  const sk = Math.min((PW - 2 * R) / bw, (PH - 2 * R) / bh);
  const DW = bw * sk, DH = bh * sk, x0 = (PW - DW) / 2, y0 = (PH - DH) / 2;
  const f = x => x.toFixed(3);
  let cm;
  if (dreh === 3 || dreh === 4) cm = [-DW, 0, 0, -DH, x0 + DW, y0 + DH];
  else if (dreh === 6 || dreh === 7) cm = [0, -DH, DW, 0, x0, y0 + DH];
  else if (dreh === 8 || dreh === 5) cm = [0, DH, -DW, 0, x0 + DW, y0];
  else cm = [DW, 0, 0, DH, x0, y0];
  const inhalt = 'q ' + cm.map(f).join(' ') + ' cm /Im0 Do Q';
  const farbe = komp === 1 ? '/DeviceGray' : komp === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
  const teile = [], offs = [];
  let laenge = 0;
  const text = t => { const b = []; for (let i = 0; i < t.length; i++) b.push(t.charCodeAt(i) & 255); teile.push(b); laenge += b.length; };
  const obj = (n, t) => { offs[n] = laenge; text(n + ' 0 obj\n' + t + '\nendobj\n'); };
  text('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
  obj(4, '<< /Length ' + inhalt.length + ' >>\nstream\n' + inhalt + '\nendstream');
  offs[5] = laenge;
  text('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace ' + farbe + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + J.length + ' >>\nstream\n');
  teile.push(J); laenge += J.length;
  text('\nendstream\nendobj\n');
  const xref = laenge;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) x += ('0000000000' + offs[n]).slice(-10) + ' 00000 n \n';
  text(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  const ges = new Uint8Array(laenge);
  let o = 0;
  teile.forEach(t => { ges.set(t, o); o += t.length; });
  return Array.from(new Int8Array(ges.buffer));
}

// ===================== ADRESSPRÜFUNG =====================
// Prüft Straße, Hausnummer, PLZ und Ort über Google Maps (eingebauter Geocoder von Apps Script,
// kennt jede Straße und Gasse in Deutschland). Ergebnis:
//   { status: 'ok' | 'schreibweise' | 'korrigiert' | 'unklar', adresse: {s, p, o}, hinweis: '...' }
function normOrt_(x) {
  return ohneAkzente_((x || '').toLowerCase())
    .replace(/\ba\.\s*d\.\s*/g, 'an der ').replace(/\bi\.\s*d\.\s*/g, 'in der ')
    .replace(/\bb\.\s*/g, 'bei ').replace(/\bi\.\s*/g, 'im ').replace(/[^a-z0-9]/g, '');
}
function normStrasse_(x) {
  return ohneAkzente_((x || '').toLowerCase()).replace(/strasse|str\./g, 'str').replace(/[^a-z0-9]/g, '');
}
function levenshtein_(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function trenneHausnummer_(strasse) {
  const m = (strasse || '').trim().match(/^(.*?)[\s.]*(\d+\s*[a-zA-Z]?(?:\s*[-\/]\s*\d+\s*[a-zA-Z]?)?(?:\s+\d+\/\d+)?)\s*$/);
  return m ? { name: m[1].trim(), nr: m[2].trim() } : { name: (strasse || '').trim(), nr: '' };
}
function adressePruefen_(strasse, plz, ort) {
  const original = { s: (strasse || '').trim(), p: (plz || '').trim(), o: (ort || '').trim() };
  if (!original.s || !original.p) return { status: 'unklar', adresse: original, hinweis: 'Adresse unvollständig' };
  let r;
  try {
    const antwort = Maps.newGeocoder().setRegion('de').setLanguage('de')
      .geocode(original.s + ', ' + original.p + ' ' + original.o + ', Deutschland');
    r = antwort && antwort.status === 'OK' ? antwort.results[0] : null;
  } catch (e) { return { status: 'unklar', adresse: original, hinweis: 'Adressprüfung nicht möglich (' + e.message + ')' }; }
  if (!r) return { status: 'unklar', adresse: original, hinweis: 'Adresse bei Google Maps nicht gefunden' };
  const teil = typ => { const c = (r.address_components || []).find(x => x.types.indexOf(typ) >= 0); return c ? c.long_name : ''; };
  const g = { strasse: teil('route'), nr: teil('street_number'), plz: teil('postal_code'),
              ort: teil('locality') || teil('postal_town') || teil('administrative_area_level_3') };
  if (!g.strasse) return { status: 'unklar', adresse: original, hinweis: 'Straße nicht eindeutig gefunden' };
  const o = trenneHausnummer_(original.s);
  const strasseGleich = normStrasse_(o.name) === normStrasse_(g.strasse);
  const abstand = levenshtein_(normStrasse_(o.name), normStrasse_(g.strasse));
  const plzGleich = original.p === g.plz;
  const ortsnamen = ['locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2', 'neighborhood', 'postal_town',
    'administrative_area_level_3', 'administrative_area_level_4'].map(teil).filter(Boolean);
  const passt = (a, b) => { a = normOrt_(a); b = normOrt_(b); return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0; };
  const ortGleich = !original.o || !ortsnamen.length || ortsnamen.some(x => passt(original.o, x));
  // Ganz andere Straße gefunden → nicht automatisch ändern
  if (!strasseGleich && abstand > Math.max(3, Math.round(normStrasse_(g.strasse).length * 0.3)))
    return { status: 'unklar', adresse: original, hinweis: 'Google Maps findet "' + g.strasse + ' ' + (g.nr || '') + ', ' + g.plz + ' ' + g.ort + '" – bitte Adresse prüfen' };
  const neu = { s: g.strasse + ' ' + (o.nr || g.nr), p: g.plz || original.p, o: original.o && ortGleich ? original.o : (g.ort || original.o) };
  const fehler = [];
  if (!strasseGleich) fehler.push('Straße "' + o.name + '" → "' + g.strasse + '"');
  if (!plzGleich && g.plz) fehler.push('PLZ ' + original.p + ' → ' + g.plz);
  if (!ortGleich) fehler.push('Ort "' + original.o + '" → "' + g.ort + '"');
  if (o.nr && g.nr && o.nr.replace(/\s/g, '').toLowerCase().indexOf(g.nr.toLowerCase()) !== 0)
    fehler.push('Hausnummer ' + o.nr + ' nicht gefunden (Google: ' + g.nr + ') – bitte prüfen');
  if (r.partial_match && !fehler.length) fehler.push('nur ungefähre Übereinstimmung – bitte prüfen');
  if (fehler.length) return { status: 'korrigiert', adresse: neu, hinweis: fehler.join('; ') };
  if (neu.s !== original.s) return { status: 'schreibweise', adresse: neu, hinweis: 'Schreibweise "' + original.s + '" → "' + neu.s + '"' };
  return { status: 'ok', adresse: original, hinweis: '' };
}

// Kommentar direkt an das Beiblatt in Drive heften (braucht den Dienst "Drive API", siehe Anleitung)
function kommentarAnDatei_(dateiId, text) {
  try {
    if (typeof Drive === 'undefined') return false;
    if (Drive.Comments.create) Drive.Comments.create({ content: text }, dateiId, { fields: 'id' });
    else Drive.Comments.insert({ content: text }, dateiId);
    return true;
  } catch (e) { return false; }
}

// Wohnort + Investitionsstandort aus dem Beiblatt prüfen und vergleichen
function adressenAusBeiblatt_(f, ordnerName, beiblattId, probleme) {
  const w = n => (f[n] || '').trim();
  const wohn = adressePruefen_(w('Straße Hausnr Wohnort'), w('PLZ_2'), w('Ort_2'));
  const invRoh = { s: w('Straße Hausnr Investitionsort  wie oben  Wohnort'), p: w('PLZ'), o: w('Ort') };
  const wieOben = /Auswahl1/.test(f['Gruppe5'] || '');
  let inv = wohn, abweichend = false;
  if (invRoh.s || invRoh.p) {
    inv = adressePruefen_(invRoh.s, invRoh.p || w('PLZ_2'), invRoh.o || w('Ort_2'));
    abweichend = normStrasse_(inv.adresse.s) !== normStrasse_(wohn.adresse.s) || inv.adresse.p !== wohn.adresse.p;
  } else if (!wieOben) {
    probleme.push(ordnerName + ': Im Beiblatt ist "wie oben" nicht angekreuzt und kein Investitionsstandort eingetragen – bitte prüfen.');
  }
  if (abweichend) {
    probleme.push(ordnerName + ': ANDERER INVESTITIONSSTANDORT: ' + inv.adresse.s + ', ' + inv.adresse.p + ' ' + inv.adresse.o
      + (wieOben ? ' (obwohl "wie oben" angekreuzt ist – bitte klären)' : '') + ' – in der Vollmacht unter 1. eingetragen.');
  }
  const notizen = [], ernst = [];
  [['Wohnort', wohn], ['Investitionsstandort', abweichend ? inv : null]].forEach(([was, x]) => {
    if (!x || x.status === 'ok') return;
    notizen.push(was + ': ' + x.hinweis);
    if (x.status === 'korrigiert' || x.status === 'unklar') ernst.push(was + ': ' + x.hinweis);
  });
  if (notizen.length) {
    const text = 'Adressprüfung (BAFA-Automatik): ' + notizen.join(' | ')
      + (ernst.length ? ' – In Vollmacht und Kundenliste wurde die geprüfte Adresse verwendet.' : ' – amtliche Schreibweise in Vollmacht und Kundenliste übernommen.');
    const kommentiert = beiblattId ? kommentarAnDatei_(beiblattId, text) : false;
    if (ernst.length) probleme.push(ordnerName + ': ' + text + (kommentiert ? ' (Kommentar am Beiblatt hinterlegt)' : ' (Für Kommentare am Beiblatt bitte Dienst "Drive API" hinzufügen.)'));
  }
  return { wohn: wohn.adresse, inv: inv.adresse, abweichend, hinweis: ernst.join(' | ') };
}

// ===================== KUNDENLISTE (Google Sheet) =====================
// Erwartet im Ordner "Kunden" ein Google Sheet, dessen Name mit "1.BAFA-Vorgänge" beginnt
// (die umgewandelte Excel-Liste). Die Jahres-Reiter "Aufträge 2026", "Anträge 2027" … "Anträge 2030"
// werden zusammen wie EINE Liste behandelt: Suchen, Farben, Zahlungen, Steuer-ID, Erledigt usw. laufen
// über alle Jahres-Reiter bis zum aktuellen Jahr. Neue Kunden landen im Reiter des aktuellen Jahres.
// Ein Jahres-Reiter wird nur mitgenommen, wenn er dieselbe Spaltenstruktur hat wie der erste
// (dafür einmalig die Funktion "jahresReiterEinrichten" ausführen).
const JAHRES_REITER = /^(?:auftr|antr)(?:ä|ae|a)ge\s*(20\d\d)\b/i;
const JAHRES_REITER_BIS = 2030;
let _liste = null;
function listeDatei_() {
  const it = DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID).getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed() && /^1\.?\s*BAFA-Vorg/i.test(f.getName())) return SpreadsheetApp.open(f); }
  return null;
}
function kopfInfo_(sh) {
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return null;
  const werte = sh.getRange(1, 1, Math.min(6, lr), lc).getDisplayValues();
  const kopf = werte.findIndex(r => r.some(c => c.trim() === 'Nachname'));
  if (kopf < 0) return null;
  const sp = {};
  werte[kopf].forEach((c, i) => { if (c.trim() && !sp[c.trim()]) sp[c.trim()] = i + 1; });
  return { sh, kopf: kopf + 1, sp, titel: werte };
}
function jahresReiter_(ss) {
  return ss.getSheets().map(sh => { const m = sh.getName().trim().match(JAHRES_REITER); return m ? { sh, jahr: +m[1] } : null; })
    .filter(Boolean).sort((a, b) => a.jahr - b.jahr);
}
// gleiche Spalten an gleicher Stelle wie der Haupt-Reiter?
function strukturGleich_(haupt, t) {
  return !!t && Object.keys(haupt.sp).every(k => t.sp[k] === haupt.sp[k]);
}
// ===================== FÖRDERUNG: PAUSCHAL 600 € UNTER 4.000 € =====================
// Spalte "Förderung": Liegen Förderrahmen UND Auftragssumme unter 4.000 €, steht dort immer 600 €,
// sonst wie bisher 15 % des Förderrahmens. Leere Zeilen bleiben leer.
function spaltenBuchstabe_(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
// Trennzeichen: Die Liste ist auf Deutsch eingestellt – dort erwartet Google Tabellen ";" statt ",".
// Welches gilt, wird an einer echten Zelle ausprobiert (st._formelTrenner), nie geraten.
function foerderFormel_(row, sp, sep) {
  sep = sep || _formelTrenner || ';';
  const i = spaltenBuchstabe_(sp['Förderrahmen']) + row, j = spaltenBuchstabe_(sp['Auftragssumme']) + row;
  return '=IF(' + i + '=""' + sep + '""' + sep + 'IF(AND(' + i + '<4000' + sep + j + '<4000)' + sep + '600' + sep + i + '*15%))';
}
let _formelTrenner = null;
// Zum Anstoßen von Hand: Spalte "Förderung" sofort reparieren/einstellen
function foerderungReparieren() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { Logger.log('Gerade läuft die Automatik – bitte in 2 Minuten nochmal ausführen.'); return; }
  const probleme = [];
  try { const st = ladeStatus_(); delete st._foerderV; foerderFormelnEinstellen_(st, probleme); speichereStatus_(st); }
  finally { lock.releaseLock(); }
  Logger.log(probleme.join('\n') || 'Nichts zu tun – die Formeln stimmen bereits.');
}
function formelFehler_(zelle) { SpreadsheetApp.flush(); return /^#(ERROR|NAME|FEHLER)/i.test(String(zelle.getDisplayValue())); }
// In allen Jahres-Reitern ("Aufträge 2026", "Anträge 2027" …) die Förderungs-Formel einstellen bzw. reparieren:
// alte Formel "=I5*15%" und die fehlerhafte Fassung vom 04.10. (#ERROR!) werden durch die richtige ersetzt.
// Von Hand eingetragene Beträge (keine Formel) und andere Formeln bleiben unangetastet.
function foerderFormelnEinstellen_(st, probleme) {
  if ((st._foerderV || 0) >= 2) { _formelTrenner = st._formelTrenner || ';'; return; }
  const ss = listeDatei_();
  if (!ss) return;
  const reiter = jahresReiter_(ss).map(t => ({ t, k: kopfInfo_(t.sh) }))
    .filter(x => x.k && x.k.sp['Förderung'] && x.k.sp['Förderrahmen'] && x.k.sp['Auftragssumme']);
  if (!reiter.length) return;
  const plan = [];
  reiter.forEach(({ t, k }) => {
    const erste = k.kopf + 1, n = t.sh.getLastRow() - k.kopf;
    if (n < 1) return;
    const iB = spaltenBuchstabe_(k.sp['Förderrahmen']);
    const alt = new RegExp('^=\\s*' + iB + '(\\d+)\\s*\\*\\s*(?:15\\s*%|0[.,]15)\\s*$', 'i');
    const neuF = new RegExp('^=IF\\(' + iB + '(\\d+)=""[,;]""[,;]IF\\(AND\\(', 'i');
    t.sh.getRange(erste, k.sp['Förderung'], n, 1).getFormulas().forEach((r, idx) => {
      const m = r[0].match(alt) || r[0].match(neuF);
      if (m && +m[1] === erste + idx) plan.push({ sh: t.sh, row: erste + idx, sp: k.sp });
    });
  });
  if (!plan.length) { st._foerderV = 2; return; }
  // Trennzeichen an der ersten Zelle ausprobieren: erst ";" (deutsche Einstellung), dann ","
  const p0 = plan[0], z0 = p0.sh.getRange(p0.row, p0.sp['Förderung']);
  let sep = null;
  for (const s of [';', ',']) { z0.setFormula(foerderFormel_(p0.row, p0.sp, s)); if (!formelFehler_(z0)) { sep = s; break; } }
  if (!sep) {
    // beide Fassungen gehen nicht → sicherheitshalber überall die alte Formel (15 %) zurück und Bescheid geben
    plan.forEach(p => p.sh.getRange(p.row, p.sp['Förderung']).setFormula('=' + spaltenBuchstabe_(p.sp['Förderrahmen']) + p.row + '*15%'));
    SpreadsheetApp.flush();
    st._foerderV = 2;
    probleme.push('Kundenliste: Die 600-€-Regel in der Spalte "Förderung" ließ sich nicht als Formel einrichten – überall wieder die alte Formel (15 %) eingesetzt. Bitte Bescheid geben.');
    return;
  }
  // Blöcke zusammenhängender Zeilen pro Reiter auf einmal schreiben
  let i = 0, geaendert = 0;
  while (i < plan.length) {
    let j = i;
    while (j + 1 < plan.length && plan[j + 1].sh === plan[i].sh && plan[j + 1].row === plan[j].row + 1) j++;
    const blk = plan.slice(i, j + 1);
    blk[0].sh.getRange(blk[0].row, blk[0].sp['Förderung'], blk.length, 1).setFormulas(blk.map(p => [foerderFormel_(p.row, p.sp, sep)]));
    geaendert += blk.length;
    i = j + 1;
  }
  SpreadsheetApp.flush();
  // Kontrolle: steht irgendwo noch ein Fehler, wird dort die alte Formel eingesetzt
  let fehler = 0;
  reiter.forEach(({ t, k }) => {
    const erste = k.kopf + 1, n = t.sh.getLastRow() - k.kopf;
    if (n < 1) return;
    t.sh.getRange(erste, k.sp['Förderung'], n, 1).getDisplayValues().forEach((r, idx) => {
      if (/^#(ERROR|NAME|FEHLER)/i.test(r[0])) { fehler++; t.sh.getRange(erste + idx, k.sp['Förderung']).setFormula('=' + spaltenBuchstabe_(k.sp['Förderrahmen']) + (erste + idx) + '*15%'); }
    });
  });
  st._formelTrenner = sep; _formelTrenner = sep;
  st._foerderV = 2;
  probleme.push('Kundenliste: Spalte "Förderung" repariert – ' + geaendert + ' Zeilen haben jetzt die richtige Formel (unter 4.000 € pauschal 600 €, sonst 15 %).' +
    (fehler ? ' Bei ' + fehler + ' Zeilen gab es trotzdem einen Fehler – dort steht wieder die alte Formel (15 %).' : ''));
}

function aktuellesJahr_() { return +Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy'); }

function liste_() {
  if (_liste !== null) return _liste || null;
  _liste = false;
  const ss = listeDatei_();
  if (!ss) return null;
  const jahr = aktuellesJahr_();
  const kand = jahresReiter_(ss);
  let teile = [], hinweis = '';
  const haupt = kand.length ? kopfInfo_(kand[0].sh) : null;
  if (haupt) {
    haupt.jahr = kand[0].jahr;
    teile.push(haupt);
    kand.slice(1).forEach(k => {
      if (k.jahr > jahr) return; // künftige Jahre erst ab dem 1. Januar
      const t = kopfInfo_(k.sh);
      if (t && strukturGleich_(haupt, t) && k.sh.getMaxColumns() >= haupt.sh.getLastColumn()) { t.jahr = k.jahr; teile.push(t); }
      else hinweis = 'Der Reiter "' + k.sh.getName() + '" hat nicht dieselbe Spaltenstruktur wie "' + haupt.sh.getName() +
        '" und wird von der Automatik nicht genutzt – bitte einmalig die Funktion "jahresReiterEinrichten" ausführen.';
    });
  } else {
    const t = kopfInfo_(ss.getSheets()[0]);
    if (!t) return null;
    teile = [t];
  }
  _liste = listeAusTeilen_(ss, teile);
  _liste.hinweis = hinweis;
  return _liste;
}

// Mehrere Reiter → eine "virtuelle" Tabelle: Zeilen 1…kopf = Titel/Kopf des ersten Reiters,
// danach die Datenzeilen aller Reiter hintereinander. Liegt ein Bereich in einem Reiter, wird der echte
// Range zurückgegeben; reicht er über mehrere Reiter, ein Sammel-Objekt mit den benutzten Methoden.
function listeAusTeilen_(ss, teile) {
  const haupt = teile[0];
  const L = { kopf: haupt.kopf, sp: haupt.sp, titel: haupt.titel, teile, ss, _lay: null };
  if (teile.length === 1) { L.sh = haupt.sh; L.haupt = haupt; return L; }
  L.haupt = haupt;
  const K = haupt.kopf;
  const lay = () => {
    if (L._lay) return L._lay;
    let start = 0;
    teile.forEach(t => { t.n = Math.max(0, t.sh.getLastRow() - t.kopf); t.start = start; start += t.n; });
    return (L._lay = { N: start });
  };
  L.neuLayout = () => { L._lay = null; };
  // virtuelle Zeile → [Teil, echte Zeile]
  const ort = v => {
    if (v <= K) return [haupt, v];
    const i = v - K - 1;
    lay();
    for (const t of teile) if (i < t.start + t.n) return [t, t.kopf + 1 + i - t.start];
    const t = teile[teile.length - 1];
    return [t, t.kopf + 1 + i - t.start];
  };
  L.virtuell = (teil, real) => { lay(); return teil === haupt && real <= K ? real : K + 1 + teil.start + (real - teil.kopf - 1); };
  L.ort = ort;
  const sammel = segs => {
    const ranges = segs.map(s => s.t.sh.getRange(s.r, s.c, s.n, s.nc));
    const holen = m => () => ranges.reduce((a, r) => a.concat(r[m]()), []);
    const setzen = m => arr => { let o = 0; ranges.forEach(r => { const k = r.getNumRows(); r[m](arr.slice(o, o + k)); o += k; }); return obj; };
    const alle = m => x => { ranges.forEach(r => r[m](x)); return obj; };
    const obj = {
      getNumRows: () => ranges.reduce((a, r) => a + r.getNumRows(), 0),
      getNumColumns: () => ranges[0].getNumColumns(),
      getDisplayValues: holen('getDisplayValues'), getValues: holen('getValues'), getFormulas: holen('getFormulas'),
      getFontColors: holen('getFontColors'), getBackgrounds: holen('getBackgrounds'), getFontWeights: holen('getFontWeights'),
      getDisplayValue: () => ranges[0].getDisplayValue(), getValue: () => ranges[0].getValue(),
      setValues: setzen('setValues'), setFontColors: setzen('setFontColors'), setBackgrounds: setzen('setBackgrounds'),
      setFontColor: alle('setFontColor'), setBackground: alle('setBackground'), clearContent: alle('clearContent')
    };
    return obj;
  };
  L.sh = {
    getRange: (v, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      const segs = [];
      for (let x = v; x < v + nr; x++) {
        const [t, r] = ort(x), last = segs[segs.length - 1];
        if (last && last.t === t && last.r + last.n === r) last.n++;
        else segs.push({ t, r, c, n: 1, nc });
      }
      if (segs.length === 1) { const s = segs[0]; return s.t.sh.getRange(s.r, s.c, s.n, s.nc); }
      return sammel(segs);
    },
    getLastRow: () => K + lay().N,
    getLastColumn: () => haupt.sh.getLastColumn(),
    getMaxColumns: () => Math.min.apply(null, teile.map(t => t.sh.getMaxColumns())),
    getParent: () => ss,
    getName: () => haupt.sh.getName(),
    deleteRow: v => { const [t, r] = ort(v); t.sh.deleteRow(r); L._lay = null; }
  };
  return L;
}

// Reiter, in den neue Kunden eingetragen werden: Reiter des aktuellen Jahres, sonst der jüngste davor
function zielTeil_(L) {
  const teile = L.teile || [L];
  const j = aktuellesJahr_();
  return teile.filter(t => !t.jahr || t.jahr <= j).pop() || teile[0];
}

// ---------- Einmalig von Hand: Jahres-Reiter 2027 … 2030 einrichten ----------
// Legt jeden Jahres-Reiter als Kopie von "Aufträge 2026" an – gleiche Spalten, Formeln, Formate,
// Auswahllisten und bedingte Formatierungen, aber ohne Einträge (alle Datenzeilen wie die vorbereiteten
// Leerzeilen). Schon vorhandene Einträge (z. B. die zwei Fälle in "Anträge 2027") werden in den neuen
// Reiter übernommen; der alte Reiter bleibt als ausgeblendete Sicherung "_Sicherung …" erhalten.
// Reiter, die schon die richtige Struktur haben, werden nicht angefasst (mehrfaches Ausführen ist harmlos).
function jahresReiterEinrichten() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { Logger.log('Ein anderer Lauf ist gerade aktiv – bitte in 1–2 Minuten noch einmal starten.'); return; }
  try {
    const ss = listeDatei_();
    if (!ss) { Logger.log('Kundenliste "1.BAFA-Vorgänge …" im Ordner Kunden nicht gefunden.'); return; }
    const reiter = jahresReiter_(ss);
    const qr = reiter.find(r => /^auftr/i.test(r.sh.getName().trim())) || reiter[0];
    const q = qr ? kopfInfo_(qr.sh) : null;
    if (!q) { Logger.log('Vorlage-Reiter (z. B. "Aufträge 2026") mit Kopfzeile "Nachname" nicht gefunden.'); return; }
    const quelle = q.sh, breite = quelle.getLastColumn();
    const n = Math.max(0, quelle.getLastRow() - q.kopf);
    // Vorlagezeile: erste vorbereitete Leerzeile nach dem letzten Eintrag
    const daten = n ? quelle.getRange(q.kopf + 1, 1, n, breite).getDisplayValues() : [];
    let letzte = -1;
    daten.forEach((r, i) => { if (String(r[q.sp['Nachname'] - 1]).trim()) letzte = i; });
    const leerVorlage = letzte + 1 < daten.length;
    const tplRow = q.kopf + 1 + (leerVorlage ? letzte + 1 : Math.max(letzte, 0));
    const tplFormeln = quelle.getRange(tplRow, 1, 1, breite).getFormulas()[0];
    const bis = Math.max(JAHRES_REITER_BIS, reiter.length ? reiter[reiter.length - 1].jahr : 0);
    const log = [];

    for (let jahr = qr.jahr + 1; jahr <= bis; jahr++) {
      const alt = (jahresReiter_(ss).find(r => r.jahr === jahr) || {}).sh || null;
      const altInfo = alt ? kopfInfo_(alt) : null;
      if (alt && altInfo && altInfo.kopf === q.kopf && strukturGleich_(q, altInfo)) { log.push(alt.getName() + ': hat schon die Struktur – unverändert.'); continue; }
      const name = alt ? alt.getName() : 'Anträge ' + jahr;

      // 1) vorhandene Einträge des alten Reiters merken
      const merk = [];
      if (alt && altInfo && alt.getLastRow() > altInfo.kopf) {
        const an = alt.getLastRow() - altInfo.kopf, ab = alt.getLastColumn();
        const rg = alt.getRange(altInfo.kopf + 1, 1, an, ab);
        const v = rg.getValues(), dv = rg.getDisplayValues(), bg = rg.getBackgrounds(), fc = rg.getFontColors(), fw = rg.getFontWeights();
        const namen = {};
        Object.keys(altInfo.sp).forEach(k => { namen[altInfo.sp[k]] = k; });
        dv.forEach((r, i) => {
          if (!String(r[altInfo.sp['Nachname'] - 1]).trim()) return;
          const z = [];
          r.forEach((x, c) => { if (namen[c + 1]) z.push({ kopf: namen[c + 1], wert: v[i][c], text: x, bg: bg[i][c], fc: fc[i][c], fw: fw[i][c] }); });
          merk.push(z);
        });
      }

      // 2) neuer Reiter als Kopie der Vorlage, alle Datenzeilen = Leerzeile mit Formeln
      const neu = quelle.copyTo(ss);
      if (n) {
        const blk = neu.getRange(q.kopf + 1, 1, n, breite);
        quelle.getRange(tplRow, 1, 1, breite).copyTo(blk);
        // Spalten ohne Formel leeren (nur Inhalte – Formate und Auswahllisten bleiben)
        for (let c = 0; c < breite;) {
          if (tplFormeln[c]) { c++; continue; }
          let e = c;
          while (e + 1 < breite && !tplFormeln[e + 1]) e++;
          neu.getRange(q.kopf + 1, c + 1, n, e - c + 1).clearContent();
          c = e + 1;
        }
        if (!leerVorlage) blk.setBackground(null);
      }
      // Titelzeilen: Jahreszahl ersetzen, "erstellt am" / "aktualisiert am" = heute
      if (q.kopf > 1) {
        const tr = neu.getRange(1, 1, q.kopf - 1, breite), tv = tr.getValues(), tf = tr.getFormulas();
        tv.forEach((r, i) => r.forEach((x, c) => {
          if (tf[i][c]) return;
          if (typeof x === 'string' && x.indexOf(String(qr.jahr)) >= 0) neu.getRange(i + 1, c + 1).setValue(x.split(String(qr.jahr)).join(String(jahr)));
          if (typeof x === 'string' && /erstellt am|aktualisiert am/i.test(x) && c + 1 < breite) neu.getRange(i + 1, c + 2).setValue(heute_());
        }));
      }

      // 3) gemerkte Einträge eintragen (nach Spaltenüberschrift; Formelzellen bleiben Formeln)
      merk.forEach((z, i) => {
        const row = q.kopf + 1 + i;
        const rest = [];
        z.forEach(f => {
          const c = q.sp[f.kopf];
          if (f.text === '' && (f.wert === '' || f.wert === null)) return;
          if (!c) { rest.push(f.kopf + ': ' + f.text); return; }
          if (tplFormeln[c - 1]) return;
          const zelle = neu.getRange(row, c);
          zelle.setValue(f.wert);
          if (f.bg && !/^#ffffff$/i.test(f.bg)) zelle.setBackground(f.bg);
          if (f.fc) zelle.setFontColor(f.fc);
          if (f.fw) zelle.setFontWeight(f.fw);
        });
        if (rest.length && q.sp['Bemerkung']) {
          const b = neu.getRange(row, q.sp['Bemerkung']);
          b.setValue([b.getDisplayValue(), rest.join(' / ')].filter(Boolean).join(' / '));
        }
      });

      // 4) alten Reiter sichern (ausgeblendet) bzw. leeren Reiter ersetzen, neuen an seine Stelle
      let pos = alt ? alt.getIndex() : null;
      if (alt) {
        if (alt.getLastRow() === 0 && alt.getLastColumn() === 0) { ss.deleteSheet(alt); }
        else {
          let sname = '_Sicherung ' + name, k = 2;
          while (ss.getSheetByName(sname)) sname = '_Sicherung ' + name + ' (' + k++ + ')';
          alt.setName(sname);
          alt.hideSheet();
        }
      } else {
        const vor = jahresReiter_(ss).filter(r => r.jahr < jahr && r.sh.getSheetId() !== neu.getSheetId()).pop();
        pos = vor ? vor.sh.getIndex() + 1 : null;
      }
      neu.setName(name);
      if (pos) { ss.setActiveSheet(neu); ss.moveActiveSheet(pos); }
      log.push(name + ': eingerichtet' + (merk.length ? ' – ' + merk.length + ' Einträge übernommen' : ' (leer)') +
        (alt && ss.getSheetByName('_Sicherung ' + name) ? ', alter Reiter als "_Sicherung ' + name + '" ausgeblendet' : '') + '.');
    }
    ss.setActiveSheet(quelle);
    Logger.log((log.length ? log.join('\n') : 'Nichts zu tun.') + '\nVorlage: "' + quelle.getName() + '", Zeile ' + tplRow + '.');
  } finally {
    lock.releaseLock();
  }
}

function heute_() { return Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yy'); }

function listeDaten_(L) {
  const n = L.sh.getLastRow() - L.kopf;
  return n > 0 ? L.sh.getRange(L.kopf + 1, 1, n, L.sh.getLastColumn()).getDisplayValues() : [];
}

function listeZeile_(L, nachname, vorname) {
  const norm = x => ohneAkzente_((x || '').toLowerCase().trim());
  const nn = norm(nachname), vn = norm((vorname || '').split(/\s+/)[0]);
  const d = listeDaten_(L);
  let treffer = -1;
  d.forEach((r, i) => {
    if (norm(r[L.sp['Nachname'] - 1]) !== nn) return;
    if (vn && norm(r[L.sp['Vorname'] - 1]).split(/\s+/)[0] && norm(r[L.sp['Vorname'] - 1]).split(/\s+/)[0] !== vn) return;
    treffer = L.kopf + 1 + i; // letzter Treffer = neuester Vorgang
  });
  return treffer;
}

function listeAktualisiert_(L) {
  // "aktualisiert am" im ersten Reiter und im Reiter des aktuellen Jahres
  const teile = L.teile ? [L.haupt || L.teile[0], zielTeil_(L)].filter((t, i, a) => a.indexOf(t) === i) : [L];
  teile.forEach(t => {
    try {
      for (let r = 0; r < Math.min(t.kopf - 1, t.titel.length); r++) {
        const i = t.titel[r].findIndex(c => /aktualisiert am/i.test(c));
        if (i >= 0) { t.sh.getRange(r + 1, i + 2).setValue(heute_()); return; }
      }
    } catch (e) {}
  });
}

// Werte setzen: String = nur wenn Zelle leer; [String] = immer überschreiben; {anhaengen: x} = an Text anhängen
function listeSetze_(ordner, s, werte, probleme) {
  try {
    const L = liste_();
    if (!L) return;
    const k = s.kunde || {};
    const row = listenZeileFuerOrdner_(L, ordner, k);
    if (row < 0) {
      // nie still übergehen: Bescheid geben, was nicht eingetragen werden konnte
      if (probleme) probleme.push(ordner.getName() + ': Zeile in der Kundenliste nicht eindeutig gefunden – bitte von Hand eintragen: ' +
        Object.keys(werte).map(f => f + ' = ' + (Array.isArray(werte[f]) ? werte[f][0] : (werte[f] && werte[f].anhaengen) || werte[f])).join(', '));
      return;
    }
    Object.keys(werte).forEach(feld => {
      const c = L.sp[feld];
      if (!c) return;
      const zelle = L.sh.getRange(row, c);
      const alt = zelle.getDisplayValue().trim();
      const v = werte[feld];
      if (Array.isArray(v)) {
        // V65: Bearbeitungsstand nie zurücksetzen (z. B. nach "Festsetzungsbescheid erhalten." nicht wieder "Verwendungsnachweis eingegangen")
        if (feld === 'Bearbeitungsstand' && standRang_(alt) > standRang_(v[0]) && standRang_(v[0]) > 0) {
          if (probleme) probleme.push(ordner.getName() + ': Stand in der Liste ist schon "' + alt + '" – nicht auf "' + v[0] + '" zurückgesetzt.');
          return;
        }
        if (String(v[0]) === alt) return;
        zelle.setValue(v[0]);
      }
      else if (v && typeof v === 'object') { if (alt.indexOf(v.anhaengen) < 0) zelleAnhaengen_(zelle, v.anhaengen); else return; } // Formatierung (rote Vermerke) bleibt
      else if (!alt || alt === '-' || /^offen$/i.test(alt)) zelle.setValue(v);
      else return;
      if (feld === 'Bearbeitungsstand') standFarbe_(L, row);
      if (feld === 'Bezahlung') namenFarbe_(L, row, true);
    });
    listeAktualisiert_(L);
  } catch (e) {
    probleme.push(ordner.getName() + ': Kundenliste konnte nicht aktualisiert werden – ' + e.message);
  }
}

// Reihenfolge der Bearbeitungsstände (0 = unbekannter eigener Text → wird nicht geschützt)
function standRang_(x) {
  const t = normStand_(x);
  if (!t) return 0;
  if (/storn|erledigt/.test(t)) return 7;
  if (/festsetzung/.test(t)) return 6;
  if (/verwendungsnachweis|^vn\b/.test(t)) return 5;
  if (/zuwendungsbescheid/.test(t)) return 4;
  if (/antrag/.test(t)) return 3;
  if (/vollmacht (eingegangen|erteilt)/.test(t)) return 2;
  if (/^offen|vollmacht angefragt/.test(t)) return 1;
  return 0;
}
// Text an eine Zelle anhängen (" / …"), ohne vorhandene Formatierung (z. B. rote Vermerke) zu verlieren
function zelleAnhaengen_(zelle, zusatz) {
  const alt = zelle.getDisplayValue();
  const neu = alt.trim() ? alt.replace(/\s+$/, '') + ' / ' + zusatz : zusatz;
  zelleTextSetzen_(zelle, alt, neu);
}
// Zelltext von alt auf neu ändern und dabei die Formatierung der unveränderten Teile behalten
// (gleicher Anfang und gleiches Ende bleiben, nur der geänderte Mittelteil wird ersetzt)
function zelleTextSetzen_(zelle, alt, neu) {
  bemerkungSicherSchreiben_(zelle, alt, neu, rtv => {
    const t = rtv.getText();
    let a = 0;
    while (a < t.length && a < neu.length && t[a] === neu[a]) a++;
    let e = 0;
    while (e < t.length - a && e < neu.length - a && t[t.length - 1 - e] === neu[neu.length - 1 - e]) e++;
    return richErsetzen_(rtv, a, t.length - e, neu.slice(a, neu.length - e));
  });
}

function zahl_(t) {
  // "4.705,88" / "4000,-€" / "30.000,00 €" → Zahl
  const x = String(t || '').replace(/[^\d,.-]/g, '').replace(/,-$/, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(x);
  return isNaN(n) ? null : n;
}

// Kürzel für die Spalte MN (Reihenfolge wie im Beiblatt, mehrere mit "/"):
//   F  = Neue Fenster / Balkon- & Terrassentüren      (Kontrollkästchen1)
//   FE = Ertüchtigte Fenster                           (Kontrollkästchen3)
//   F EINBRUCH = Barrierearme / einbruchh. Fenster     (Kontrollkästchen5)
//   SV = Sonderverglasung gem. TMA                     (Kontrollkästchen2)
//   DF = Dachflächenfenster                            (Kontrollkästchen4)
//   AT = Außentüren beheizte Räume                     (Kontrollkästchen6)
const MASSNAHMEN = [
  ['Kontrollkästchen1', 'F', 'Neue Fenster / Balkon- & Terrassentüren'],
  ['Kontrollkästchen3', 'FE', 'Ertüchtigte Fenster'],
  ['Kontrollkästchen5', 'F EINBRUCH', 'Barrierearme / einbruchhemmende Fenster'],
  ['Kontrollkästchen2', 'SV', 'Sonderverglasung gem. TMA'],
  ['Kontrollkästchen4', 'DF', 'Dachflächenfenster'],
  ['Kontrollkästchen6', 'AT', 'Außentüren beheizte Räume']
];
function massnahmeKuerzel_(f) {
  const an = n => { const v = f[n] || ''; return !!v && !/^\/?Off$/i.test(v); };
  return MASSNAHMEN.filter(m => an(m[0])).map(m => m[1]).join('/');
}

// ---------- Farben wie in der Liste ----------
// Das Script "lernt" die Formatierung aus deiner Liste: Für einen Bearbeitungsstand übernimmt es die
// Formatierung einer bestehenden Zeile mit demselben Stand; für offene/bezahlte Kunden die Schriftfarbe
// der Namen aus einer bestehenden offenen bzw. bezahlten Zeile.
const NAMEN_SPALTEN = ['Nachname', 'Bezahlung']; // in deiner Liste sind Nachname und "offen" rot, nach Zahlung beide schwarz
// Zeile eines Kundenordners in der Liste: Nachname + Vorname; passt der Vorname nicht (z. B. anderer Vorname im Status),
// dann Nachname + PLZ aus dem Ordnernamen, wenn das genau eine aktive Zeile ergibt.
function listenZeileFuerOrdner_(L, ordner, k) {
  // Reihenfolge (V66): 1) Vorgangsnummer (Spalte "Vorgangsnummer" = Zahl am Anfang des Ordnernamens) – eindeutig.
  // 2) Nachname (+ Vorname), bei mehreren: genaue Schreibweise (Kohl ≠ Köhl), PLZ aus dem Ordnernamen, Auftragssumme laut
  //    Beiblatt im Ordner; Zeilen mit einer ANDEREN Vorgangsnummer gehören zu einem anderen Ordner und scheiden aus.
  // Ist das Ergebnis sicher und die Vorgangsnummer in der Zeile noch leer, wird sie eingetragen (ab dann gilt Schritt 1).
  // Ist es nicht eindeutig: -1 (die Automatik schreibt dann nichts und gibt Bescheid).
  const nn = (k && k.nachname) || nachnameAusOrdner_(ordner.getName());
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const vn1 = x => ohneAkzente_(String(x || '').toLowerCase().trim()).split(/\s+/)[0] || '';
  const vn = vn1(k && k.vorname);
  const plz = (ordner.getName().match(/\b(\d{5})\b/) || [])[1];
  const nr = vorgangsNr_(ordner);
  const cP = L.sp['PLZ'], cV = L.sp['Vorname'], cB = L.sp['Bemerkung'], cS = L.sp['Bearbeitungsstand'], cN = L.sp['Vorgangsnummer'], cA = L.sp['Auftragssumme'];
  const nrVon = r => cN ? String(r[cN - 1] || '').replace(/\D/g, '') : '';
  const d = listeDaten_(L);
  // 1) Vorgangsnummer
  if (nr && cN) {
    const t = [];
    d.forEach((r, i) => { if (nrVon(r) === nr) t.push(L.kopf + 1 + i); });
    if (t.length === 1) return t[0];
    if (t.length > 1) return -1; // dieselbe Nummer in mehreren Zeilen → lieber nachfragen
  }
  // 2) Name
  const suche = mitVorname => {
    let kand = [];
    d.forEach((r, i) => {
      if (norm(r[L.sp['Nachname'] - 1]) !== norm(nn)) return;
      const rv = cV ? vn1(r[cV - 1]) : '';
      if (mitVorname && vn && rv && rv !== vn) return;
      if (nr && nrVon(r) && nrVon(r) !== nr) return; // gehört sicher zu einem anderen Ordner
      kand.push({ row: L.kopf + 1 + i, r, rv });
    });
    if (kand.length > 1 && !nr) { const ohneNr = kand.filter(x => !nrVon(x.r)); if (ohneNr.length) kand = ohneNr; } // Ordner ohne Nummer → Zeilen ohne Nummer
    if (kand.length > 1) { // genaue Schreibweise (Umlaute) bevorzugen: Ordner "Kohl" ≠ Zeile "Köhl"
      const genau = kand.filter(x => String(x.r[L.sp['Nachname'] - 1]).trim().toLowerCase() === String(nn).trim().toLowerCase());
      if (genau.length) kand = genau;
    }
    if (kand.length > 1 && plz && cP) { const p = kand.filter(x => String(x.r[cP - 1]).trim() === plz); if (p.length) kand = p; }
    if (kand.length === 1) return { row: kand[0].row, sicher: true };
    if (kand.length > 1 && cA) { // Auftragssumme laut Beiblatt im Ordner
      const summe = beiblattSumme_(ordner);
      if (summe) { const z = kand.filter(x => { const a = zahl_(x.r[cA - 1]); return a !== null && Math.abs(a - summe) < 1; }); if (z.length === 1) return { row: z[0].row, sicher: true }; }
    }
    if (kand.length > 1) {
      const aktiv = kand.filter(x => !(cB && /vorgang erledigt/i.test(String(x.r[cB - 1]))) && !(cS && /storn/i.test(String(x.r[cS - 1]))));
      if (aktiv.length) kand = aktiv;
    }
    if (kand.length === 1) return { row: kand[0].row, sicher: false }; // nur über "aktiv" entschieden → nicht als sicher merken
    if (kand.length > 1 && new Set(kand.map(x => x.rv)).size === 1) {
      // mehrere Aufträge derselben Person: Eingangsdatum am Anlegedatum des Ordners (nur wenn eindeutig)
      try {
        const cE = L.sp['Eingang'] || L.sp['Beiblatt vorhanden'];
        const t0 = ordner.getDateCreated().getTime();
        const dat = v => { const m = String(v || '').match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/); if (!m) return null; let j = +m[3]; if (j < 100) j += 2000; return new Date(j, +m[2] - 1, +m[1]).getTime(); };
        const abst = kand.map(x => ({ row: x.row, d: cE && dat(x.r[cE - 1]) !== null ? Math.abs(dat(x.r[cE - 1]) - t0) : Infinity })).sort((a, b) => a.d - b.d);
        if (abst[0].d < 7 * 864e5 && abst[1].d - abst[0].d > 7 * 864e5) return { row: abst[0].row, sicher: false };
      } catch (e) {}
    }
    return { row: -1 };
  };
  let erg = suche(true);
  if (erg.row < 0 && vn) { // Vorname passt nicht (z. B. anderer Vorname im Status, Herter) → nur Nachname, und nur wenn eindeutig
    const ohne = suche(false);
    if (ohne.row > 0 && ((plz && cP && String(d[ohne.row - L.kopf - 1][cP - 1]).trim() === plz) ||
        d.filter(r => norm(r[L.sp['Nachname'] - 1]) === norm(nn)).length === 1)) erg = ohne;
  }
  // Vorgangsnummer merken (nur bei sicherer Zuordnung und leerer Zelle)
  if (erg.row > 0 && erg.sicher && nr && cN && !nrVon(d[erg.row - L.kopf - 1])) {
    try { L.sh.getRange(erg.row, cN).setValue(nr); d[erg.row - L.kopf - 1][cN - 1] = nr; } catch (e) { console.log('Vorgangsnummer eintragen: ' + e.message); }
  }
  return erg.row;
}
// Spalte "Vorgangsnummer" anlegen (in allen Jahres-Reitern an derselben Stelle) und für alle Kundenordner mit Nummer
// befüllen – dann findet die Automatik die Zeile immer über die Nummer. Läuft in Etappen (max. 30 Ordner pro Lauf).
// Ordner, die sich nicht sicher zuordnen lassen, werden EINMAL gemeldet (bitte die Nummer dann von Hand eintragen).
const VORGANGSNR_FEST = [ // geprüfte Zuordnung bei Kunden mit zwei Aufträgen (ID in der Liste, Nachname, Vorgangsnummer)
  [19, 'Hagl', '94509403'], [38, 'Hagl', '94510289'],
  [30, 'Bussolera', '94509411'], [37, 'Bussolera', '94511582'],
  [7, 'Schimming', '94483320'], [88, 'Schimming', '95031824'],
  [24, 'Poepke', '94505642'], [56, 'Poepke', '95005715'],
  [14, 'Gruber', '94494585'], [83, 'Gruber', '95031812'],
  [12, 'Kohl', '94492201']
];
function vorgangsnummernPflegen_(st, probleme) {
  const L = liste_();
  if (!L || !L.sp['Nachname']) return;
  if (!L.sp['Vorgangsnummer']) {
    const c = spalteSicher_(L, 'Vorgangsnummer');
    // auch in den Reitern künftiger Jahre (z. B. "Anträge 2027"), damit sie ab Januar dieselbe Struktur haben
    try {
      jahresReiter_(L.ss || L.sh.getParent()).forEach(j => {
        if ((L.teile || [L]).some(t => t.sh.getSheetId && j.sh.getSheetId && t.sh.getSheetId() === j.sh.getSheetId())) return;
        const t = kopfInfo_(j.sh);
        if (!t || t.sp['Vorgangsnummer']) return;
        if (j.sh.getMaxColumns() < c) j.sh.insertColumnsAfter(j.sh.getMaxColumns(), c - j.sh.getMaxColumns());
        const z = j.sh.getRange(t.kopf, c);
        if (!z.getDisplayValue().trim()) { j.sh.getRange(t.kopf, c - 1).copyTo(z, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); z.setValue('Vorgangsnummer'); }
      });
    } catch (e) { probleme.push('Spalte "Vorgangsnummer" in den Reitern künftiger Jahre anlegen fehlgeschlagen – ' + e.message); }
    probleme.push('Kundenliste: neue Spalte "Vorgangsnummer" angelegt (ganz rechts). Die Automatik trägt die Nummern aus den Ordnernamen ein und findet die Zeilen ab dann darüber.');
  }
  const cN = L.sp['Vorgangsnummer'], cI = L.sp['ID'];
  // geprüfte Zuordnung der Doppelten einmalig eintragen
  if ((st._vgnrFestV || 0) < 1 && cI) {
    const d = listeDaten_(L), norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
    const ok = [], nicht = [];
    VORGANGSNR_FEST.forEach(([id, name, nr]) => {
      const i = d.findIndex(r => String(r[cI - 1]).trim() === String(id) && norm(r[L.sp['Nachname'] - 1]) === norm(name));
      if (i < 0) { nicht.push(name + ' (ID ' + id + ')'); return; }
      const alt = String(d[i][cN - 1] || '').replace(/\D/g, '');
      if (alt && alt !== nr) { nicht.push(name + ' (ID ' + id + ': steht schon ' + alt + ')'); return; }
      if (!alt) L.sh.getRange(L.kopf + 1 + i, cN).setValue(nr);
      ok.push(name + ' ID ' + id + ' = ' + nr);
    });
    st._vgnrFestV = 1;
    probleme.push('Vorgangsnummern bei Kunden mit zwei Aufträgen eingetragen: ' + ok.join(', ') + (nicht.length ? '. Nicht eingetragen (bitte prüfen): ' + nicht.join(', ') : '') + '.');
  }
  // alle Ordner mit Nummer durchgehen (in Etappen)
  const memo = st._vgnr = st._vgnr || {};
  let n = 0;
  const offen = [];
  for (const o of ordnerListe_()) {
    const nr = vorgangsNr_(o);
    if (!nr || memo[o.getId()] === nr || memo[o.getId()] === 'offen ' + nr + ' ' + heute_()) continue; // nicht zuordenbare: 1× täglich neu versuchen
    if (zeitUeber_() || n >= 30) return;
    n++;
    const s = st[o.getId()] || {};
    const row = listenZeileFuerOrdner_(L, o, s.kunde || {});
    const drin = row > 0 && String(L.sh.getRange(row, cN).getDisplayValue()).replace(/\D/g, '') === nr;
    memo[o.getId()] = drin ? nr : 'offen ' + nr + ' ' + heute_();
    if (!drin) offen.push(o.getName());
  }
  // alle durch: nicht zuordenbare Ordner einmal melden
  const keinTreffer = ordnerListe_().filter(o => vorgangsNr_(o) && memo[o.getId()] !== vorgangsNr_(o)).map(o => o.getName());
  const schluessel = keinTreffer.join('|');
  if (keinTreffer.length && st._vgnrGemeldet !== schluessel) {
    st._vgnrGemeldet = schluessel;
    probleme.push('Vorgangsnummer konnte nicht sicher einer Zeile der Kundenliste zugeordnet werden (' + keinTreffer.length + ' Ordner) – bitte bei Gelegenheit die Nummer in der Spalte "Vorgangsnummer" der richtigen Zeile eintragen (steht der Kunde nicht mehr in "Aufträge 2026", z. B. storniert oder erledigt, einfach ignorieren):\n   • ' + keinTreffer.join('\n   • '));
  }
}

// Antrag eingereicht (begpt_….pdf): Vorgangsnummer aus dem Antrag lesen und den Kundenordner vorne damit benennen,
// z. B. "Köhl 85244 Röhrmoos" → "95049366 Köhl 85244 Röhrmoos" (nur der ORDNER wird umbenannt, keine Datei).
function ordnerMitVorgangsnummer_(ordner, begpt, s, probleme) {
  if (vorgangsNr_(ordner)) return; // hat schon eine Nummer
  const text = pdfText_(begpt);
  const nrn = Array.from(new Set((text.match(/Vorgangsnummer:?\s*(\d{7,9})/gi) || []).map(x => x.replace(/\D/g, ''))));
  if (nrn.length !== 1) {
    probleme.push(ordner.getName() + ': Vorgangsnummer im Antrag ' + begpt.getName() + ' ' + (nrn.length ? 'nicht eindeutig (' + nrn.join(', ') + ')' : 'nicht gefunden') + ' – Ordner bitte selbst mit der Nummer benennen.');
    return;
  }
  const alt = ordner.getName(), neu = nrn[0] + ' ' + alt.trim();
  ordner.setName(neu);
  probleme.push('Antrag eingereicht – Ordner umbenannt: "' + alt + '" → "' + neu + '" (Vorgangsnummer ' + nrn[0] + ').');
  try { const L = liste_(); if (L && L.sp['Vorgangsnummer']) listenZeileFuerOrdner_(L, ordner, s.kunde || {}); } catch (e) {} // Nummer in die Liste
}
// Nachholen: Ordner ohne Nummer, in denen schon ein Antrag (begpt_) liegt → umbenennen (höchstens 3 pro Lauf, je Ordner 1× täglich)
function ordnerNummernNachholen_(st, probleme) {
  const memo = st._umbenannt = st._umbenannt || {};
  let n = 0;
  for (const o of ordnerListe_()) {
    if (n >= 3 || zeitUeber_()) break;
    if (vorgangsNr_(o) || memo[o.getId()] === heute_()) continue;
    const begpt = dateienCache_(o).filter(f => /^begpt_\d/i.test(f.getName())).sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
    if (!begpt) continue;
    memo[o.getId()] = heute_(); n++;
    try { ordnerMitVorgangsnummer_(o, begpt, st[o.getId()] || {}, probleme); }
    catch (e) { probleme.push(o.getName() + ': Ordner konnte nicht mit der Vorgangsnummer benannt werden – ' + e.message); }
  }
}
// Fotos von Vollmachten (Vollmacht_….jpg/png der letzten 3 Tage) zusätzlich als PDF ablegen – das BAFA-Portal braucht PDF
function vollmachtFotosAlsPdf_(st, probleme) {
  const memo = st._vmPdf = st._vmPdf || {};
  const seit = Utilities.formatDate(new Date(Date.now() - 3 * 864e5), 'UTC', "yyyy-MM-dd'T'HH:mm:ss");
  const it = DriveApp.searchFiles('title contains "Vollmacht_" and (mimeType = "image/jpeg" or mimeType = "image/png") and modifiedDate > "' + seit + '" and trashed = false');
  while (it.hasNext()) {
    const f = it.next();
    if (memo[f.getId()]) continue;
    memo[f.getId()] = true;
    const ps = f.getParents();
    if (!ps.hasNext()) continue;
    const o = ps.next();
    if (!ordnerListe_().some(x => x.getId() === o.getId())) continue; // nur in Kundenordnern
    const pdfName = f.getName().replace(/\.[a-z0-9]+$/i, '') + '.pdf';
    if (o.getFilesByName(pdfName).hasNext()) continue;
    try {
      const g = o.createFile(bildZuPdf_(f.getBlob()).setName(pdfName));
      const s = st[o.getId()]; if (s && s.gesehen) s.gesehen.push(g.getId());
      probleme.push(o.getName() + ': Vollmacht-Foto "' + f.getName() + '" zusätzlich als PDF abgelegt: ' + pdfName + ' (fürs BAFA-Portal).');
    } catch (e) { probleme.push(o.getName() + ': Vollmacht-Foto "' + f.getName() + '" konnte nicht in PDF umgewandelt werden – ' + e.message); }
  }
}
// ===================== BEMERKUNG: RECHNUNG / ZUWENDUNGSBESCHEID =====================
// "Rechnung verschickt TT.MM.JJ"   → eintragen, sobald die Honorarrechnung (EB-….pdf) per Mail an den Kunden ging;
//                                     wieder herausnehmen (samt "Zahlung der Rechnung erinnert …"), sobald bezahlt ist.
// "Zuwendungsbescheid noch nicht verschickt" → eintragen, wenn der Bescheid da ist (Stand "Zuwendungsbescheid erhalten",
//                                     höchstens 21 Tage alt), aber noch nicht an den Kunden geschickt wurde; herausnehmen,
//                                     sobald die Mail mit dem Bescheid gesendet ist (auch Varianten wie "ZUWENDUNGSBESCHEID NOCH SCHICKEN").
// Die übrige Formatierung der Bemerkung (z. B. roter Investitionsstandort) bleibt erhalten.
const RE_RECHNUNG_VERMERK = 'Rechnung\\s+(?:am\\s+)?(?:verschickt|versendet|gesendet|geschickt)(?:\\s+am)?\\s*\\d{1,2}\\.\\d{1,2}\\.?(?:\\d{2,4})?|Zahlung\\s+(?:der\\s+Rechnung\\s+)?erinnert(?:\\s+am)?\\s*\\d{1,2}\\.\\d{1,2}\\.?(?:\\d{2,4})?';
const RE_ZB_VERMERK = 'Zuwendungsbescheid\\s+noch\\s+(?:nicht\\s+)?(?:ver|ge)?(?:schickt|schicken|sendet|senden)\\.?|(?<=^|\\/)\\s*noch\\s+nicht\\s+(?:ver|ge)schickt\\.?(?=\\s*(?:\\/|$))';
function vermerkRegex_(kern) { return new RegExp('(\\s*\\/\\s*)?(?:' + kern + ')(\\s*\\/\\s*)?', 'gi'); }
// Textstellen (mit ihrem " / ") aus einer Rich-Text-Zelle entfernen, alle anderen Formatierungen bleiben
function richEntfernen_(rtv, re) {
  const text = rtv.getText();
  const weg = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const ende = m[1] && m[2] ? m.index + m[0].length - m[2].length : m.index + m[0].length; // ein " / " bleibt stehen
    weg.push([m.index, ende]);
  }
  if (!weg.length) return null;
  const neuePos = i => { let d = 0; for (const [a, e] of weg) { if (i >= e) d += e - a; else if (i > a) d += i - a; } return i - d; };
  let neu = '', last = 0;
  weg.forEach(([a, e]) => { neu += text.slice(last, a); last = e; });
  neu += text.slice(last);
  const b = SpreadsheetApp.newRichTextValue().setText(neu);
  rtv.getRuns().forEach(r => { const a = neuePos(r.getStartIndex()), e = neuePos(r.getEndIndex()); if (e > a) b.setTextStyle(a, e, r.getTextStyle()); });
  return b.build();
}
function zelleVermerkEntfernen_(zelle, kern) {
  const alt = zelle.getDisplayValue();
  const re = vermerkRegex_(kern);
  const neuText = alt.replace(re, (m0, a, e) => (a && e ? e : '')).replace(/^\s*\/\s*|\s*\/\s*$/g, '').trim();
  if (neuText === alt.trim()) return false;
  bemerkungSicherSchreiben_(zelle, alt, neuText, rtv => {
    const r1 = richEntfernen_(rtv, vermerkRegex_(kern));
    if (!r1) return null;
    const t = r1.getText(), m = t.match(/^\s*\/\s*|\s*\/\s*$/g);
    if (!m) return r1;
    let x = r1; // Schrägstrich am Anfang/Ende wegputzen
    const a0 = (t.match(/^\s*\/\s*/) || [''])[0].length, e0 = (t.match(/\s*\/\s*$/) || [''])[0].length;
    x = richErsetzen_(x, t.length - e0, t.length, '');
    x = richErsetzen_(x, 0, a0, '');
    return x;
  });
  return true;
}
function bemerkungRechnungZbPflegen_(st, probleme) {
  const L = liste_();
  if (!L || !L.sp['Bemerkung'] || !L.sp['Nachname']) return;
  const cB = L.sp['Bemerkung'], cZ = L.sp['Bezahlung'], cS = L.sp['Bearbeitungsstand'], cE = L.sp['E-Mail'], cZE = L.sp['Zuwendung erhalten'], cEi = L.sp['Eingang'];
  const memo = st._bemPflege = st._bemPflege || {};
  const jetzt = Date.now(), fmt = d => Utilities.formatDate(d, 'Europe/Berlin', 'dd.MM.yy');
  const datum = v => { const m = String(v || '').match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/); if (!m) return null; let j = +m[3]; if (j < 100) j += 2000; return new Date(j, +m[2] - 1, +m[1]); };
  const reR = new RegExp(RE_RECHNUNG_VERMERK, 'i'), reZ = new RegExp(RE_ZB_VERMERK, 'i');
  let suchen = 0;
  const darfSuchen = (key, stunden) => suchen < 8 && !zeitUeber_() && (!memo[key] || jetzt - memo[key] > stunden * 3600e3);
  const geaendert = [];
  listeDaten_(L).forEach((r, i) => {
    const row = L.kopf + 1 + i, nn = String(r[L.sp['Nachname'] - 1]).trim();
    if (!nn) return;
    const bem = String(r[cB - 1] || ''), stand = cS ? String(r[cS - 1]) : '';
    if (/vorgang erledigt|storniert/i.test(bem) || /storn/i.test(stand)) return;
    const bezahlt = cZ && istDatum_(String(r[cZ - 1]).trim());
    const email = cE ? String(r[cE - 1]).trim() : '';
    const mailOk = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email);
    const z = () => L.sh.getRange(row, cB);
    try {
      // 1) bezahlt → Rechnungs-Vermerke raus
      if (bezahlt && reR.test(bem)) { if (zelleVermerkEntfernen_(z(), RE_RECHNUNG_VERMERK)) geaendert.push(nn + ': „Rechnung verschickt …“ entfernt (bezahlt)'); }
      // 2) Rechnung verschickt eintragen (nur offen, ab Antrag, mit E-Mail)
      else if (!bezahlt && mailOk && standRang_(stand) >= 3 && !reR.test(bem) && darfSuchen('re|' + row + '|' + nn, 2)) {
        suchen++; memo['re|' + row + '|' + nn] = jetzt;
        const re = rechnungPdf_(email);
        const eing = cEi ? datum(r[cEi - 1]) : null;
        const reDatum = re ? new Date(+re.d8.slice(0, 4), +re.d8.slice(4, 6) - 1, +re.d8.slice(6, 8)) : null;
        if (re && re.gesendet && (!eing || reDatum >= new Date(eing.getTime() - 30 * 864e5))) {
          zelleAnhaengen_(z(), 'Rechnung verschickt ' + fmt(re.gesendet));
          geaendert.push(nn + ': „Rechnung verschickt ' + fmt(re.gesendet) + '“ eingetragen');
        }
      }
      // 3) Zuwendungsbescheid verschickt → Vermerk raus
      const bem2 = String(z().getDisplayValue());
      const zbVermerk = /zuwendungsbescheid\s+noch/i.test(bem2) || (/zuwendungsbescheid/i.test(stand) && reZ.test(bem2));
      if (zbVermerk) {
        if (darfSuchen('zb|' + row + '|' + nn, 1)) {
          suchen++; memo['zb|' + row + '|' + nn] = jetzt;
          if (zbGesendet_({ email: mailOk ? email : '', nachname: nn }) && zelleVermerkEntfernen_(z(), RE_ZB_VERMERK)) geaendert.push(nn + ': „Zuwendungsbescheid noch nicht verschickt“ entfernt (Bescheid ist verschickt)');
        }
      } else if (/zuwendungsbescheid erhalten/i.test(stand)) {
        // 4) Bescheid da (≤ 21 Tage), aber noch nicht verschickt → Vermerk eintragen
        const zd = cZE ? datum(r[cZE - 1]) : null;
        if (zd && jetzt - zd.getTime() <= 21 * 864e5 && !memo['zbok|' + row + '|' + nn] && darfSuchen('zb|' + row + '|' + nn, 1)) {
          suchen++; memo['zb|' + row + '|' + nn] = jetzt;
          if (zbGesendet_({ email: mailOk ? email : '', nachname: nn })) memo['zbok|' + row + '|' + nn] = 1;
          else { zelleAnhaengen_(z(), 'Zuwendungsbescheid noch nicht verschickt'); geaendert.push(nn + ': „Zuwendungsbescheid noch nicht verschickt“ eingetragen'); }
        }
      }
    } catch (e) { probleme.push(nn + ': Bemerkung (Rechnung/Zuwendungsbescheid) konnte nicht angepasst werden – ' + e.message); }
  });
  if (geaendert.length) { listeAktualisiert_(L); probleme.push('Kundenliste, Bemerkung angepasst:\n   • ' + geaendert.join('\n   • ')); }
}

// Vorgangsnummer = Zahl am Anfang des Ordnernamens ("94509403-Hagl", "95039993 Köhler 80993 München")
function vorgangsNr_(ordner) { return (String(ordner.getName()).match(/^(\d{7,9})(?!\d)/) || [])[1] || ''; }
// Auftragssumme laut Beiblatt im Ordner (Feld "Text1"); null, wenn kein lesbares Beiblatt
const _summeCache = {};
function beiblattSumme_(ordner) {
  const id = ordner.getId();
  if (id in _summeCache) return _summeCache[id];
  let summe = null;
  try {
    const bb = dateienCache_(ordner).filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()) && f.getMimeType() === MimeType.PDF)
      .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
    if (bb) summe = zahl_(leseFormularfelder_(bb.getBlob().getBytes(), pako_())['Text1']);
  } catch (e) { summe = null; }
  return (_summeCache[id] = summe);
}
function normStand_(x) { return String(x || '').toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ').trim(); }
function istDatum_(x) { return /\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}/.test(String(x || '')); }

function vorlageZeile_(L, pruefe, ausser) {
  const d = listeDaten_(L);
  for (let i = d.length - 1; i >= 0; i--) {
    const row = L.kopf + 1 + i;
    if (row === ausser || !String(d[i][L.sp['Nachname'] - 1]).trim()) continue;
    if (pruefe(d[i])) return row;
  }
  return -1;
}

// Deine Farben für den Bearbeitungsstand (aus deiner Liste übernommen). Gibt es für einen Stand noch keine
// gefärbte Zeile, wird diese Farbe verwendet – so wird z. B. "Vollmacht eingegangen" immer sofort umgefärbt.
const STAND_FARBEN = {
  'vollmacht angefragt': '#ffc000',
  'vollmacht eingegangen': '#00ff00',
  'antrag eingegangen': '#92d050',
  'antrag in bearbeitung': '#b6d7a8',
  'zuwendungsbescheid erhalten': '#00b050',
  'verwendungsnachweis muss eingereicht werden': '#00ffff',
  'verwendungsnachweis eingegangen': '#f4cccc',
  'festsetzungsbescheid erhalten': '#93c47d'
};
// Hat die Zelle noch die Farbe eines ANDEREN Standes (z. B. orange von "Vollmacht angefragt")?
function falscheStandFarbe_(stand, bg) {
  const f = String(bg || '').toLowerCase();
  return !!f && f !== STAND_FARBEN[stand] && Object.keys(STAND_FARBEN).some(k => k !== stand && STAND_FARBEN[k] === f);
}
function standFarbe_(L, row) {
  const c = L.sp['Bearbeitungsstand'];
  if (!c) return;
  const zelle = L.sh.getRange(row, c);
  const stand = normStand_(zelle.getDisplayValue());
  if (STAND_FARBEN[stand]) { zelle.setBackground(STAND_FARBEN[stand]); return; }
  const ref = vorlageZeile_(L, r => normStand_(r[c - 1]) === stand, row);
  if (ref > 0) L.sh.getRange(ref, c).copyTo(zelle, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
}

function namenFarbe_(L, row, bezahlt) {
  const r = L.sp['Bezahlung'];
  if (!r) return;
  const ref = vorlageZeile_(L, z => bezahlt ? istDatum_(z[r - 1]) : /^offen$/i.test(String(z[r - 1]).trim()), row);
  NAMEN_SPALTEN.forEach(n => {
    const c = L.sp[n];
    if (!c) return;
    const ziel = L.sh.getRange(row, c);
    if (ref > 0) ziel.setFontColor(L.sh.getRange(ref, c).getFontColor());
    else ziel.setFontColor(bezahlt ? '#000000' : '#ff0000');
  });
}

// Bei jedem Lauf die ganze Liste nach deiner Regel prüfen (nur Abweichungen werden geändert):
//  - Bezahlung "offen" → Nachname rot; Bezahlung mit Datum → Nachname schwarz
//  - Bearbeitungsstand ohne Hintergrundfarbe → Farbe einer anderen Zeile mit demselben Stand
//  - Spalte "E-Mail" anlegen und bei Kunden des Scripts die Beiblatt-Adresse nachtragen
function listeFarbenPruefen_(st, probleme) {
  try {
    const L = liste_();
    if (!L) return;
    if (L.hinweis && tagesAufgabeFaellig_('jahresReiterHinweis', 0)) { probleme.push(L.hinweis); tagesAufgabeErledigt_('jahresReiterHinweis'); }
    const n = L.sh.getLastRow() - L.kopf;
    if (n <= 0) return;
    const cN = L.sp['Nachname'], cB = L.sp['Bezahlung'], cS = L.sp['Bearbeitungsstand'];
    const werte = L.sh.getRange(L.kopf + 1, 1, n, L.sh.getLastColumn()).getDisplayValues();
    let geaendert = false;

    // 1) Nachname rot/schwarz nach Bezahlstatus
    if (cN && cB) {
      // Nachname UND Spalte "Bezahlung" (R): "offen" = rot, Zahlungsdatum = schwarz
      [cN, cB].forEach(spalte => {
        const farben = L.sh.getRange(L.kopf + 1, spalte, n, 1).getFontColors();
        werte.forEach((r, i) => {
          if (!String(r[cN - 1]).trim()) return;
          const b = String(r[cB - 1]).trim();
          const soll = /^offen$/i.test(b) ? '#ff0000' : istDatum_(b) ? '#000000' : null;
          if (!soll) return;
          const istRot = String(farben[i][0] || '').toLowerCase() === '#ff0000';
          if ((soll === '#ff0000') !== istRot) { L.sh.getRange(L.kopf + 1 + i, spalte).setFontColor(soll); geaendert = true; }
        });
      });
    }

    // 2) Bearbeitungsstand einfärben, wo noch keine Farbe ist
    if (cS) {
      const bg = L.sh.getRange(L.kopf + 1, cS, n, 1).getBackgrounds();
      const weiss = x => !x || /^#ffffff$/i.test(x);
      const vorlage = {};
      werte.forEach((r, i) => { const s = normStand_(r[cS - 1]); if (s && !weiss(bg[i][0]) && !falscheStandFarbe_(s, bg[i][0])) vorlage[s] = L.kopf + 1 + i; });
      werte.forEach((r, i) => {
        const s = normStand_(r[cS - 1]);
        if (!s || !String(r[L.sp['Nachname'] - 1]).trim()) return;
        if (!weiss(bg[i][0]) && !falscheStandFarbe_(s, bg[i][0])) return; // passende oder eigene Farbe bleibt
        const ziel = L.sh.getRange(L.kopf + 1 + i, cS);
        if (STAND_FARBEN[s]) ziel.setBackground(STAND_FARBEN[s]);
        else if (vorlage[s]) L.sh.getRange(vorlage[s], cS).copyTo(ziel, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        else return;
        geaendert = true;
      });
    }

    // 2b) Erinnerungs-Vermerke "… nochmals erinnert für die Vollmacht" in roter Schrift halten
    try { if (erinnerungsVermerkeAufraeumen_(L)) geaendert = true; } catch (e) { console.log('Vermerke aufräumen: ' + e.message); }
    try { if (rotVermerkePruefen_(L)) geaendert = true; } catch (e) { console.log('Rote Vermerke: ' + e.message); }

    // 3) E-Mail-Spalte + Adressen der Script-Kunden
    const cE = emailSpalte_(L);
    Object.keys(st).forEach(id => {
      const s = st[id];
      if (!s || typeof s !== 'object' || !s.liste || !s.kunde || !s.kunde.email || !s.kunde.vorname || eigeneAdresse_(s.kunde.email)) return;
      const row = listeZeile_(L, s.kunde.nachname, s.kunde.vorname);
      if (row < 0) return;
      const z = L.sh.getRange(row, cE);
      if (!z.getDisplayValue().trim()) { z.setValue(s.kunde.email); geaendert = true; }
    });

    if (geaendert) listeAktualisiert_(L);
  } catch (e) {
    probleme.push('Farben/E-Mail in der Kundenliste konnten nicht geprüft werden – ' + e.message);
  }
}

// E-Mail-Spalte am Ende anlegen, falls noch nicht vorhanden
function emailSpalte_(L) { return spalteSicher_(L, 'E-Mail'); }

// Spalte mit dieser Überschrift holen – fehlt sie, wird sie rechts angehängt (Format wie die letzte Überschrift)
function spalteSicher_(L, name) {
  if (L.sp[name]) return L.sp[name];
  const letzte = Math.max.apply(null, Object.keys(L.sp).map(k => L.sp[k]));
  const neu = letzte + 1;
  // in jedem Jahres-Reiter an derselben Stelle anlegen
  (L.teile || [L]).forEach(t => {
    if (t.sh.getMaxColumns() < neu) t.sh.insertColumnsAfter(t.sh.getMaxColumns(), neu - t.sh.getMaxColumns());
    const kopf = t.sh.getRange(t.kopf, neu);
    if (!kopf.getDisplayValue().trim()) {
      t.sh.getRange(t.kopf, letzte).copyTo(kopf, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      kopf.setValue(name);
    }
    t.sp[name] = neu;
  });
  L.sp[name] = neu;
  return neu;
}

// Zahlungseingang aus Qonto ("Ihre Rechnung … wurde bezahlt") in die Liste übernehmen
function zahlungenAbgleichen_(st, probleme) {
  try {
    const L = liste_();
    if (!L || !L.sp['Bezahlung']) return;
    st._zahlungen = st._zahlungen || [];
    const threads = GmailApp.search('from:invoice@qonto.com subject:"wurde bezahlt" newer_than:45d', 0, 50);
    const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
    threads.forEach(t => t.getMessages().forEach(m => {
      if (st._zahlungen.indexOf(m.getId()) >= 0) return;
      const txt = m.getPlainBody().replace(/\s+/g, ' ');
      const tr = txt.match(/(?:Nachrichten\.|Hallo,)?\s*([^.,:]+?) hat ([\d.,]+) EUR für Ihre Rechnung (.+?) bezahlt/i);
      if (!tr) { st._zahlungen.push(m.getId()); return; }
      const name = norm(tr[1]), datum = Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM.yy');
      const d = listeDaten_(L), rc = L.sp['Bezahlung'];
      let row = -1;
      for (let i = d.length - 1; i >= 0; i--) {
        const vn = norm(d[i][L.sp['Vorname'] - 1]), nn = norm(d[i][L.sp['Nachname'] - 1]);
        if (!nn) continue;
        const offen = !istDatum_(d[i][rc - 1]);
        if (offen && (name === vn + nn || name === nn + vn || (name.endsWith(nn) && vn && name.indexOf(vn.split(/\s/)[0]) === 0))) { row = L.kopf + 1 + i; break; }
      }
      if (row > 0) {
        L.sh.getRange(row, rc).setValue(datum);
        namenFarbe_(L, row, true);
        listeAktualisiert_(L);
      } else {
        // schon eingetragen oder Name weicht ab
        const schon = d.some(r => norm(r[L.sp['Nachname'] - 1]) && name.endsWith(norm(r[L.sp['Nachname'] - 1])) && istDatum_(r[rc - 1]));
        if (!schon) probleme.push('Zahlung von ' + tr[1] + ' (' + tr[2] + ' EUR, ' + tr[3] + ') – Kunde in der Liste nicht gefunden, bitte Bezahldatum ' + datum + ' von Hand eintragen.');
      }
      st._zahlungen.push(m.getId());
      if (st._zahlungen.length > 1000) st._zahlungen = st._zahlungen.slice(-1000);
    }));
  } catch (e) {
    probleme.push('Zahlungsabgleich mit der Liste fehlgeschlagen – ' + e.message);
  }
}

// Trägt einen vom Script angelegten Kunden einmalig in die Liste ein
function listeSync_(ordner, s, probleme) {
  if (s.liste || !s.kunde || !s.kunde.vorname) return; // nur Kunden, deren Vollmacht das Script vorbereitet hat
  try {
    const L = liste_();
    if (!L) return;
    const k = s.kunde;
    const vorhanden = listeZeile_(L, k.nachname, k.vorname);
    if (vorhanden > 0) {
      // Neuer Auftrag eines Kunden, dessen früherer Auftrag storniert/erledigt ist → trotzdem neue Zeile
      const z = L.sh.getRange(vorhanden, 1, 1, L.sh.getLastColumn()).getDisplayValues()[0];
      const alt = [L.sp['Bearbeitungsstand'], L.sp['Bemerkung']].filter(Boolean).map(c => z[c - 1]).join(' ');
      if (!(s.neuAuftrag && /storn|vorgang erledigt|festsetzung/i.test(alt))) {
        s.liste = true;
        if (s.neuAuftrag) probleme.push(ordner.getName() + ': Neuer Auftrag, aber ' + k.nachname + ' steht schon aktiv in der Liste – kein zweiter Eintrag angelegt. Bitte prüfen.');
        return;
      }
    }
    let f = s.bbV === 2 ? s.bb : null, datum = s.bbDatum ? new Date(s.bbDatum) : null;
    if (!f) { // ältere Läufe (alter Beiblatt-Leser): Beiblatt neu lesen
      const bb = alleDateien_(ordner).filter(x => /beiblatt/i.test(x.getName()) && !/rechnung/i.test(x.getName()))
        .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
      if (!bb) return;
      f = leseFormularfelder_(bb.getBlob().getBytes(), pako_());
      datum = bb.getDateCreated();
      s.adr = adressenAusBeiblatt_(f, ordner.getName(), bb.getId(), probleme);
    }
    const adr = s.adr || { wohn: { s: (f['Straße Hausnr Wohnort'] || '').trim(), p: (f['PLZ_2'] || '').trim(), o: (f['Ort_2'] || '').trim() }, abweichend: false };
    const eingang = Utilities.formatDate(datum || new Date(), 'Europe/Berlin', 'dd.MM.yy');
    const kosten = zahl_(f['Text1']);
    const rahmen = kosten === null ? null : Math.min(kosten, 30000);
    // unter 4.000 € (Förderrahmen und Auftragssumme) pauschal 600 €, sonst 15 % des Förderrahmens
    const foerd = rahmen === null ? null : (rahmen < 4000 && (kosten === null || kosten < 4000) ? 600 : Math.round(rahmen * 15) / 100);
    const bem = [];
    const sidRoh = String(f['SteuerID 11stellig'] || '').replace(/\D/g, '');
    bem.push(k.steuerId ? 'SteuerID: ' + k.steuerId : (sidRoh.length === 11 ? 'SteuerID ungültig (Prüfziffer): ' + sidRoh : 'SteuerID fehlt'));
    const fehltAntrag = fehlendeAngaben_(f).filter(x => x.key !== 'steuer');
    if (fehltAntrag.length) bem.push('Für Antrag fehlt: ' + fehltAntrag.map(x => x.kurz).join(', '));
    weVermerke_(f).forEach(x => bem.push(x));
    if (adr.abweichend) bem.push('ANDERER INVESTITIONSSTANDORT!!! ' + adr.inv.s + ', ' + adr.inv.p + ' ' + adr.inv.o);
    if (adr.hinweis) bem.push(adr.hinweis);
    if (kosten !== null && kosten > 30000) bem.push('Kosten über 30.000 € – Förderrahmen/Wohneinheiten prüfen');
    if (f['Text2']) bem.push('Umsetzung: ' + f['Text2']);
    if (s.neuAuftrag) bem.push('Neuer Auftrag – Vollmacht vom früheren Auftrag übernommen');

    // Ziel: Reiter des aktuellen Jahres (z. B. "Anträge 2027"), dort die erste Zeile ohne Nachname
    // (vorbereitete Leerzeilen mit Formeln nutzen). Die ID zählt über alle Jahres-Reiter weiter.
    const d = listeDaten_(L);
    const T = zielTeil_(L);
    const dT = listeDaten_(T);
    const idx = dT.findIndex(r => !String(r[T.sp['Nachname'] - 1]).trim());
    const echt = idx >= 0 ? T.kopf + 1 + idx : T.sh.getLastRow() + 1;
    const ids = d.map(r => parseInt(r[(L.sp['ID'] || 1) - 1], 10)).filter(n => !isNaN(n));
    const werte = {
      'ID': ids.length ? Math.max.apply(null, ids) + 1 : 1,
      'MN': massnahmeKuerzel_(f),
      'Eingang': eingang,
      'Nachname': k.nachname,
      'Vorname': k.vorname,
      'Adresse': adr.wohn.s,
      'PLZ': adr.wohn.p,
      'Ort': adr.wohn.o,
      'Förderrahmen': rahmen,
      'Auftragssumme': kosten,
      'Förderung': foerd,
      'Beiblatt vorhanden': eingang,
      'Bezahlung': 'offen',
      'Bearbeitungsstand': s.vollmachtDa ? 'Vollmacht eingegangen' : 'Vollmacht angefragt',
      'Vollmacht erteilt': s.vollmachtDa || '',
      'Bemerkung': bem.join(' / '),
      'E-Mail': [k.email, (f['EMail'] || '').trim()].find(e => e && !eigeneAdresse_(e)) || ''
    };
    emailSpalte_(L);
    Object.keys(werte).forEach(feld => {
      const c = L.sp[feld];
      if (!c || werte[feld] === null || werte[feld] === '') return;
      const zelle = T.sh.getRange(echt, c);
      if (zelle.getFormula()) return; // Formeln (z. B. Förderung) nicht überschreiben
      if (feld === 'Förderung' && T.sp['Förderrahmen'] && T.sp['Auftragssumme']) {
        // Formel mit dem passenden Trennzeichen; klappt keines, wird der Betrag als Zahl eingetragen
        let ok = false;
        for (const sep of [_formelTrenner || ';', _formelTrenner === ',' ? ';' : ',']) {
          zelle.setFormula(foerderFormel_(echt, T.sp, sep));
          if (!formelFehler_(zelle)) { ok = true; _formelTrenner = sep; break; }
        }
        if (!ok) zelle.setValue(werte[feld]);
        return;
      }
      zelle.setValue(werte[feld]);
    });
    if (L.neuLayout) L.neuLayout();
    const row = L.virtuell ? L.virtuell(T, echt) : echt;
    standFarbe_(L, row);
    namenFarbe_(L, row, false);
    listeAktualisiert_(L);
    s.liste = true;
  } catch (e) {
    probleme.push(ordner.getName() + ': Eintrag in die Kundenliste fehlgeschlagen – ' + e.message);
  }
}

// ===================== TAGESAUFGABEN: STEUERUNG =====================
const LAUF_START = Date.now();
function zeitUeber_() { return Date.now() - LAUF_START > 4.5 * 60 * 1000; } // Apps Script bricht nach 6 Min. ab
function tagesAufgabeFaellig_(key, abStunde) {
  const jetzt = new Date();
  if (+Utilities.formatDate(jetzt, 'Europe/Berlin', 'H') < abStunde) return false;
  return PropertiesService.getScriptProperties().getProperty(key) !== Utilities.formatDate(jetzt, 'Europe/Berlin', 'yyyy-MM-dd');
}
function tagesAufgabeErledigt_(key) {
  PropertiesService.getScriptProperties().setProperty(key, Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd'));
}
const _dateiCache = {};
function dateienCache_(o) { return _dateiCache[o.getId()] || (_dateiCache[o.getId()] = alleDateien_(o)); }
const VN_STAND = /verwendungsnachweis|^vn\b|festsetzung|erledigt|storniert/i;
function vnUnterlagenDa_(o) {
  const it = o.getFoldersByName(CFG.VN_ORDNER_NAME);
  if (!it.hasNext()) return false;
  const f = it.next().getFiles();
  while (f.hasNext()) if (!f.next().isTrashed()) return true;
  return false;
}
function listeStand_(L, k, o) {
  if (!L || !L.sp['Bearbeitungsstand']) return '';
  const row = o ? listenZeileFuerOrdner_(L, o, k) : listeZeile_(L, k.nachname, k.vorname);
  return row > 0 ? L.sh.getRange(row, L.sp['Bearbeitungsstand']).getDisplayValue().trim() : '';
}
const VN_UNTERLAGEN = [
  '– Schlussrechnung der Firma Eibner & Regnath nebst ausgefülltem Rechnungsbeiblatt',
  '– Zahlungsbeleg (Kontoauszug oder qualifizierte Überweisungsbestätigung zum Nachweis des Geldflusses)',
  '– IBAN des Antragstellers (Kontoinhaber muss mit dem Antragsteller identisch sein)'
];

// ===================== PRÜFZIFFERN =====================
// Steuer-ID: 11 Ziffern, letzte = Prüfziffer (Verfahren nach ISO 7064, MOD 11,10)
function steuerIdGueltig_(id) {
  id = String(id || '').replace(/\D/g, '');
  if (!/^[1-9]\d{10}$/.test(id)) return false;
  let p = 10;
  for (let i = 0; i < 10; i++) { let s = (+id[i] + p) % 10; if (s === 0) s = 10; p = (s * 2) % 11; }
  let c = 11 - p; if (c === 10) c = 0;
  return c === +id[10];
}
// IBAN: Prüfsumme MOD 97 (DE-IBAN hat 22 Zeichen)
function ibanGueltig_(iban) {
  iban = String(iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('DE') && iban.length !== 22) return false;
  const r = iban.slice(4) + iban.slice(0, 4);
  let m = 0;
  for (const ch of r) { const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of v) m = (m * 10 + +d) % 97; }
  return m === 1;
}

// Einmalig von Hand ausführbar: prüft alle Steuer-IDs und IBANs in der Spalte "Bemerkung" und schreibt das Ergebnis ins Protokoll
function pruefziffernCheck() {
  const L = liste_();
  if (!L || !L.sp['Bemerkung']) return;
  const fehler = [];
  listeDaten_(L).forEach(r => {
    const nn = String(r[L.sp['Nachname'] - 1]).trim(), b = String(r[L.sp['Bemerkung'] - 1]);
    if (!nn) return;
    (b.match(/steuer\s*-?\s*id\s*:?\s*((?:\d[\s\/]*){11})/ig) || []).forEach(x => { const id = x.replace(/^\D+/, '').replace(/\D/g, ''); if (!steuerIdGueltig_(id)) fehler.push(nn + ': Steuer-ID ' + id + ' ungültig'); });
    (b.match(/iban\s*:?\s*[A-Z]{2}\s*\d{2}(?:\s*[0-9A-Z]){10,30}/ig) || []).forEach(x => { const ib = x.replace(/^iban\s*:?\s*/i, ''); if (!ibanGueltig_(ib)) fehler.push(nn + ': IBAN ' + ib + ' ungültig'); });
  });
  Logger.log(fehler.length ? 'Auffällig:\n' + fehler.join('\n') : 'Alle Steuer-IDs und IBANs in der Liste sind gültig.');
}

// ===================== KUNDENANTWORTEN AUSWERTEN =====================
// Antwortet ein Kunde, bei dem in der Liste "SteuerID fehlt" / "Steuer ID fehlt" oder "Für Antrag fehlt: …" steht, werden die
// Angaben aus seiner Mail gelesen, geprüft und in die Bemerkung eingetragen. Du bekommst eine kurze Info-Mail.
function kundenAntwortenAuswerten_(st, probleme, protokoll) {
  try {
    const L = liste_();
    if (!L || !L.sp['Bemerkung']) return;
    st._antworten = st._antworten || [];
    st._anhGelesen = st._anhGelesen || [];
    let ocrZaehler = 0;
    const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
    const mailAusSt = {};
    Object.keys(st).forEach(id => { const s = st[id]; if (s && s.kunde && s.kunde.email && s.kunde.nachname && !eigeneAdresse_(s.kunde.email)) mailAusSt[norm(s.kunde.nachname)] = s.kunde.email.toLowerCase(); });
    const offen = {};
    let ordnerCache = null;
    const ohneMail = [];
    listeDaten_(L).forEach((r, i) => {
      const nn = String(r[L.sp['Nachname'] - 1]).trim();
      const bem = String(r[L.sp['Bemerkung'] - 1]);
      // offen: "SteuerID fehlt", "Für Antrag fehlt", eigene Vermerke – oder die Steuer-ID wird erwähnt, steht aber noch nicht da
      // (z. B. "Sie wird mir die Steuer ID per Post schicken")
      const sidErwartet = /steuer[\s-]*id/i.test(bem) && !((bem.match(/\d[\d\s\/]{9,16}\d/g) || []).some(x => steuerIdGueltig_(x.replace(/\D/g, ''))));
      if (!nn || /vorgang erledigt/i.test(bem) || !(/steuer[\s-]*id\s*(?:fehlt|ungültig)|für antrag fehlt/i.test(bem) || OFFEN_VERMERK.test(bem) || sidErwartet)) return;
      let mail = (L.sp['E-Mail'] ? String(r[L.sp['E-Mail'] - 1]).trim().toLowerCase() : '') || mailAusSt[norm(nn)] || '';
      if (!mail || eigeneAdresse_(mail)) { // E-Mail fehlt in der Liste → aus dem Kundenordner / deiner Mail "benötigte Unterlagen"
        try {
          ordnerCache = ordnerCache || ordnerListe_();
          const plz = L.sp['PLZ'] ? String(r[L.sp['PLZ'] - 1]).trim() : '';
          const o = ordnerCache.find(x => norm(nachnameAusOrdner_(x.getName())) === norm(nn) && (!plz || x.getName().indexOf(plz) >= 0));
          if (o) {
            mail = String(kundeAusOrdner_(o, st[o.getId()] || {}).email || '').trim().toLowerCase();
            if (mail && !eigeneAdresse_(mail) && L.sp['E-Mail']) L.sh.getRange(L.kopf + 1 + i, L.sp['E-Mail']).setValue(mail); // gleich in die Liste übernehmen
          }
        } catch (e) {}
      }
      if (!mail || eigeneAdresse_(mail)) ohneMail.push({ row: L.kopf + 1 + i, nachname: nn, vorname: String(r[L.sp['Vorname'] - 1]).trim() });
      if (mail && !eigeneAdresse_(mail)) offen[mailNorm_(mail)] = { row: L.kopf + 1 + i, nachname: nn, vorname: String(r[L.sp['Vorname'] - 1]).trim() };
    });
    const mails = Object.keys(offen);
    for (let i = 0; i < mails.length; i += 20) {
      const q = 'newer_than:14d -in:sent -in:drafts {' + mails.slice(i, i + 20).map(m => 'from:' + m).join(' ') + '}';
      GmailApp.search(q, 0, 50).forEach(t => t.getMessages().forEach(m => {
        const neu = st._antworten.indexOf(m.getId()) < 0;
        const anhOffen = st._anhGelesen.indexOf(m.getId()) < 0;
        if (!neu && !anhOffen) return;
        const von = mailNorm_(((m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1] || '').trim().toLowerCase());
        const k = offen[von];
        if (!k) return;
        // Anhänge (Fotos/PDF) per Texterkennung lesen – Steuer-ID und IBAN stehen oft nur dort
        let anhText = '';
        if (anhOffen) {
          const anh = mailAnhaenge_(m);
          if (anh.length) {
            if (ocrZaehler >= 4 || zeitUeber_()) return; // Rest im nächsten Lauf
            ocrZaehler++;
            anhText = anh.slice(0, 6).map(a => { try { return anhangText_(a.copyBlob()); } catch (e) { console.log('Texterkennung ' + a.getName() + ': ' + e.message); return ''; } }).join('\n');
          }
          st._anhGelesen.push(m.getId());
        }
        if (!neu && !anhText.trim()) return;
        let ergebnis = '';
        try { ergebnis = antwortEintragen_(L, k, m, anhText, !neu); }
        catch (e) { // V65: nicht mehr still verlieren
          probleme.push(k.nachname + ': Antwort vom ' + Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM. HH:mm') + ' ("' + m.getSubject() + '") konnte nicht in die Liste übernommen werden – ' + e.message + '. Bitte die Angaben aus der Mail selbst eintragen.');
        }
        if (neu) st._antworten.push(m.getId());
        if (protokoll) Logger.log('Antwort von ' + k.nachname + ' (' + Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM. HH:mm') + ') ausgewertet: ' + (ergebnis || 'keine verwertbaren Angaben gefunden'));
      }));
    }
    // Kunden ohne E-Mail in der Liste: Absender über Vor- und Nachnamen erkennen
    // (z. B. "AngelikaMoeller@web.de" → Möller-Dietsch, Angelika); die Adresse wird dann in die Liste übernommen.
    if (ohneMail.length) {
      const varianten = x => { const t = String(x || '').toLowerCase(); return [t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'), ohneAkzente_(t)].map(v => v.replace(/[^a-z]/g, '')); };
      const passt = (k, absender) => {
        const nnTeile = String(k.nachname).split(/[-\s]+/).filter(t => t.length >= 4);
        const vn = String(k.vorname).split(/\s+/)[0];
        const voll = varianten(k.nachname).some(v => v.length >= 4 && absender.indexOf(v) >= 0);
        const teil = nnTeile.some(t => varianten(t).some(v => absender.indexOf(v) >= 0));
        const vor = vn.length >= 3 && varianten(vn).some(v => absender.indexOf(v) >= 0);
        return voll ? (vor || nnTeile.length > 0) : (teil && vor);
      };
      GmailApp.search('in:inbox newer_than:14d -from:me -from:qonto.com -from:bafa.bund.de -from:eibner-regnath.de', 0, 40).forEach(t => t.getMessages().forEach(m => {
        if (st._antworten.indexOf(m.getId()) >= 0) return;
        const from = m.getFrom(), adr = ((from.match(/<([^>]+)>/) || [null, from])[1] || '').trim().toLowerCase();
        if (!adr || eigeneAdresse_(adr) || offen[adr]) return;
        const absender = varianten(from).join(' ');
        const treffer = ohneMail.filter(k => passt(k, absender));
        if (treffer.length !== 1) return;
        const k = treffer[0];
        st._antworten.push(m.getId());
        if (L.sp['E-Mail']) { const z = L.sh.getRange(k.row, L.sp['E-Mail']); if (!z.getDisplayValue().trim()) z.setValue(adr); }
        let ergebnis = '';
        try { ergebnis = antwortEintragen_(L, k, m, '', false); }
        catch (e) { probleme.push(k.nachname + ': Antwort ("' + m.getSubject() + '") konnte nicht in die Liste übernommen werden – ' + e.message + '. Bitte die Angaben aus der Mail selbst eintragen.'); }
        if (protokoll) Logger.log('Antwort von ' + k.nachname + ' (über den Namen erkannt, ' + adr + '): ' + (ergebnis || 'keine verwertbaren Angaben gefunden'));
      }));
    }
    if (st._antworten.length > 2000) st._antworten = st._antworten.slice(-2000);
    if (st._anhGelesen.length > 1000) st._anhGelesen = st._anhGelesen.slice(-1000);
  } catch (e) {
    probleme.push('Kundenantworten auswerten fehlgeschlagen – ' + e.message);
  }
}

// V69: Kundenmails der letzten 14 Tage, in denen der Kunde selbst das Lüftungskonzept erwähnt → einmalige Hinweis-Mail
// an dich. Es wird nichts an Kunden geschickt und nichts in der Liste geändert.
// Als Kunde zählt nur, wessen E-Mail-Adresse in der Kundenliste (Spalte "E-Mail") oder im Status der Automatik steht.
// Gmail findet nur ganze Wörter – daher mehrere Wortformen in der Suche. Damit ein zitierter Hinweis aus deinen eigenen
// Mails keinen Fehlalarm auslöst, werden zitierte Zeilen (">") und deine eigenen Sätze (Hinweis in der Mail, Fußzeile der
// Rechnung, Satz in der Festsetzungs-Mail) vor der Prüfung entfernt – egal ob der Kunde über oder unter dem Zitat schreibt.
const LUEFTUNG_SUCHE = '(lüftungskonzept OR lüftungskonzepts OR lüftungskonzeptes OR lueftungskonzept OR lueftungskonzepts OR lueftungskonzeptes OR lüftung OR lueftung OR lüftungsplanung OR lüftungsanlage OR "1946-6")';
let _lueftungEigene = null;
function lueftungEigeneSaetze_() {
  if (_lueftungEigene) return _lueftungEigene;
  const norm = lueftungNorm_;
  _lueftungEigene = [LUEFTUNG_HINWEIS, LUEFTUNG_HINWEIS_RECHNUNG, FESTSETZUNG_WEITERE_BERATUNG].join('\n')
    .split(/\n+|(?<=[.!?:])\s+/).map(norm).filter(x => x.length >= 15)
    .sort((a, b) => b.length - a.length); // lange Sätze zuerst entfernen
  return _lueftungEigene;
}
function lueftungNorm_(x) { return ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z0-9]+/g, ''); }
// Steht im Text des Kunden (ohne Zitat und ohne deine eigenen Sätze) etwas zur Lüftung?
function lueftungVomKunden_(betreff, text) {
  let t = lueftungNorm_(String(text || '').split(/\r?\n/).filter(l => !/^\s*>/.test(l)).join(' '));
  lueftungEigeneSaetze_().forEach(x => { t = t.split(x).join('|'); });
  const b = lueftungNorm_(String(betreff || '').replace(/^\s*((?:re|aw|wg|fw|fwd|antw)\s*:\s*)+/i, ''));
  return /l(?:u|ue)ftung|din19466/.test(t) || /l(?:u|ue)ftung/.test(b);
}
function lueftungsAnfragenMelden_(st) {
  st._lueftung = st._lueftung || [];
  const kunden = {};
  Object.keys(st).forEach(id => { const s = st[id]; if (s && s.kunde && s.kunde.email && !eigeneAdresse_(s.kunde.email)) kunden[mailNorm_(s.kunde.email)] = (s.kunde.vorname ? s.kunde.vorname + ' ' : '') + (s.kunde.nachname || ''); });
  const L = liste_();
  if (L && L.sp['E-Mail']) listeDaten_(L).forEach(r => {
    const mail = String(r[L.sp['E-Mail'] - 1] || '').trim();
    if (!mail || eigeneAdresse_(mail) || kunden[mailNorm_(mail)]) return;
    kunden[mailNorm_(mail)] = (String(r[L.sp['Vorname'] - 1] || '').trim() + ' ' + String(r[L.sp['Nachname'] - 1] || '').trim()).trim();
  });
  GmailApp.search('newer_than:14d -in:sent -in:drafts -in:spam -in:trash ' + LUEFTUNG_SUCHE, 0, 50).forEach(t => t.getMessages().forEach(m => {
    const id = m.getId();
    if (st._lueftung.indexOf(id) >= 0) return;
    const von = mailNorm_(m.getFrom());
    if (eigeneAdresse_(von) || !kunden.hasOwnProperty(von)) return;
    st._lueftung.push(id); // jede Kundenmail nur einmal ansehen (Inhalt und Betreff ändern sich nicht mehr)
    const body = m.getPlainBody();
    if (!lueftungVomKunden_(m.getSubject(), body)) return; // nur dein zitierter Hinweis
    const name = kunden[von] || m.getFrom();
    const auszug = (ohneZitat_(body).trim() || String(body).split(/\r?\n/).filter(l => !/^\s*>/.test(l)).join('\n').trim()).slice(0, 800);
    mailAnMich_('Lüftungskonzept – Nachricht von ' + name,
      name + ' (' + von + ') erwähnt in der Mail vom ' + Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm') +
      ' (Betreff "' + m.getSubject() + '") das Lüftungskonzept.\n\n' +
      'Auszug aus der Mail:\n' + auszug + '\n\n' +
      'Bitte prüfen, ob der Kunde das Lüftungskonzept zum Sonderpreis von ' + LUEFTUNG_PREIS + ' beauftragen möchte, und ggf. Angebot/Rechnung anlegen.\n' +
      'Link zur Mail: https://mail.google.com/mail/u/0/#all/' + t.getId());
  }));
  if (st._lueftung.length > 500) st._lueftung = st._lueftung.slice(-500);
}

// Eigene Vermerke in der Bemerkung, die eine offene Angabe markieren (z. B. "Gesamtwohneinheiten ungenau", "Baujahr fehlt")
const OFFEN_VERMERK = /(wohnungs?\s*-?\s*(?:nummer|nr\.?)|gesamt\s*wohneinheit\w*|wohneinheit\w*(?:\s*gesamt)?|betroffene?\s*(?:we|wohneinheit\w*)|\bwe\b|baujahr|geburtsdatum)\s*(?:ist\s*)?(?:ungenau|unklar|fehlt|fehlen|prüfen|offen|\?)/i;

function ohneZitat_(t) {
  const z = String(t || '').split(/\r?\n/), out = [];
  for (const l of z) {
    if (/^\s*>/.test(l) || /^\s*(Am .{3,80}schrieb|On .{3,80}wrote|-{2,}\s*(Ursprüngliche|Original)|Von:\s|From:\s|Gesendet:\s)/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
}

function angabenAusText_(t, fehlt) {
  const a = {};
  const sid = (t.match(/(?:steuer[\s-]*(?:id|ident\w*|nr\.?\s*\(?id)|identifikations(?:nummer|nr)|id[\s-]*nr)\.?[^0-9\n]{0,40}((?:\d[\s\/.-]?){10}\d)/i) || [])[1];
  if (sid) a.steuer = sid.replace(/\D/g, '');
  if ((!a.steuer || !steuerIdGueltig_(a.steuer)) && fehlt.steuer) {
    const kand = (t.match(/(?<!\d)(?:\d[ ]?){10}\d(?!\d)/g) || []).map(x => x.replace(/\D/g, '')).filter(x => x.length === 11 && steuerIdGueltig_(x));
    if (kand.length === 1) a.steuer = kand[0];
  }
  const geb = t.match(/(?:geb\.|geboren|geburtsdatum|geburtstag)[^0-9\n]{0,25}(\d{1,2}\.\s?\d{1,2}\.\s?(?:19|20)?\d{2})/i);
  if (geb) a.geb = geb[1].replace(/\s/g, '');
  const bj = t.match(/(?:baujahr|\bbj\b\.?|erbaut|gebaut|errichtet|fertigstellung|fertiggestellt)[^0-9\n]{0,30}((?:18|19|20)\d{2})/i);
  if (bj) a.bj = bj[1];
  if (/einfamilienhaus|\bEFH\b/i.test(t)) { a.we = '1'; a.weGes = '1'; }
  const ges = t.match(/(?:insgesamt|gesamt|im\s+(?:ganzen\s+)?(?:haus|gebäude))(?:(?!betroffen|davon)[^0-9\n]){0,30}(\d{1,3})\s*(?:wohneinheit|wohnung|WE\b)(?!\w*\s*(?:nr\.?\s*)?\d)/i)
    || t.match(/(\d{1,3})\s*(?:wohneinheit\w*|wohnungen|WE)\b[^.\n]{0,25}(?:insgesamt|gesamt|im\s+(?:haus|gebäude))/i)
    || t.match(/wohneinheiten\s*(?:gesamt|insgesamt)\s*[:=]?\s*(\d{1,3})/i);
  if (ges) a.weGes = ges[1];
  const betr = t.match(/(?:betroffen\w*|maßnahme|umgesetzt)[^0-9\n]{0,40}(\d{1,3})\s*(?:wohneinheit|wohnung|WE\b)(?!\w*\s*(?:nr\.?\s*)?\d)/i)
    || t.match(/betroffene\s+(?:wohneinheiten|WE)\s*[:=]?\s*(\d{1,3})/i)
    || t.match(/(\d{1,3})\s*betroffene\s+(?:wohneinheit|WE)/i);
  if (betr) a.we = betr[1];
  if (!a.we && !a.weGes) {
    const alle = (t.match(/\d{1,3}\s*(?:wohneinheit\w*|wohnung\w*|WE)\b(?!\s*(?:nr\.?\s*)?\d)/gi) || []).map(x => +x.match(/\d+/)[0]);
    const eine = new Set(alle).size > 1 ? null : (t.match(/(\d{1,3})\s*(?:wohneinheit\w*|wohnungen|WE)\b(?!\s*(?:nr\.?\s*)?\d)/i) || t.match(/wohneinheit\w*[^0-9\n]{0,15}(\d{1,3})/i));
    if (new Set(alle).size > 1) a.weUnklar = Array.from(new Set(alle)).join(' bzw. '); // z. B. "13 Wohnungen … 43 Wohnungen"
    else if (eine) { if (fehlt.we && !fehlt.weGes) a.we = eine[1]; else if (fehlt.weGes && !fehlt.we) a.weGes = eine[1]; else a.weUnklar = eine[1]; }
  }
  if (fehlt.wnr) {
    const nr = t.match(/(?:wohnungs?\s*-?\s*(?:nummer|nr\.?)|\bwhg\.?\s*(?:nr\.?)?|\bwohnung\s+(?:nr\.?\s*)?|\bwe[\s-]*nr\.?|\btop)\s*[:.]?\s*(\d{1,4}\s?[a-z]?)\b/i);
    const lage = t.match(/\b(\d{1,2}\.?\s*(?:OG|Obergeschoss|Stock|Etage)(?:\s*(?:links|rechts|mitte|li\.?|re\.?))?|(?:EG|Erdgeschoss|DG|Dachgeschoss|UG|Souterrain)(?:\s*(?:links|rechts|mitte|li\.?|re\.?))?)\b/i);
    const teile = [];
    if (nr) teile.push('Nr. ' + nr[1].replace(/\s/g, ''));
    if (lage) teile.push(lage[1].replace(/\s+/g, ' ').trim());
    if (teile.length) a.wnr = teile.join(', ');
  }
  const iban = t.match(/\b((?:DE|AT|CH|LU|NL|FR|IT|ES|BE)\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?)\b/i);
  if (iban) a.iban = iban[1].toUpperCase().replace(/\s+/g, ' ').trim();
  return a;
}

function antwortEintragen_(L, k, m, anhText, nurAnhang) {
  const zelle = L.sh.getRange(k.row, L.sp['Bemerkung']);
  const bem = zelle.getDisplayValue();
  const fa = (bem.match(/Für Antrag fehlt:\s*([^\/]+)/i) || [])[1] || '';
  const vm = k => { const m = bem.match(OFFEN_VERMERK); return m && k.test(m[1]); }; // eigener Vermerk wie "Gesamtwohneinheiten ungenau"
  const fehlt = {
    steuer: /steuer[\s-]*id\s*(?:fehlt|ungültig)/i.test(bem),
    geb: /geburtsdatum/i.test(fa) || vm(/geburtsdatum/i), bj: /baujahr/i.test(fa) || vm(/baujahr/i),
    we: /anzahl wohneinheiten/i.test(fa) || vm(/betroffen|\bwe\b/i),
    weGes: /wohneinheiten gesamt/i.test(fa) || vm(/gesamt/i) || (vm(/^wohneinheit/i) && !vm(/betroffen/i)),
    wnr: /wohnungsnummer/i.test(fa) || vm(/^wohnungs?\s*-?\s*(?:nummer|nr)/i)
  };
  const a = nurAnhang ? {} : angabenAusText_(ohneZitat_(m.getPlainBody()), fehlt);
  const eingetragen = [], hinweise = [];
  // IBAN im Mailtext mit ungewöhnlicher Gruppierung (z. B. "DE77 7116 0000 000 38947700") trotzdem erkennen
  if (!nurAnhang && !(a.iban && ibanGueltig_(a.iban))) {
    const b = angabenAusAnhang_(ohneZitat_(m.getPlainBody()), false);
    if (b.iban) {
      a.iban = b.iban;
      if (b.ibanZuLang) hinweise.push('Die IBAN in der Mail hatte eine Stelle zu viel (' + b.ibanZuLang.replace(/(.{4})/g, '$1 ').trim() + '). Die ersten 22 Stellen ergeben die gültige IBAN ' + b.iban + ' – bitte kurz mit dem Kunden abgleichen.');
    }
  }
  // Aus den Anhängen (Texterkennung) nur Steuer-ID und IBAN übernehmen – beide werden per Prüfziffer abgesichert
  let ausAnhang = false;
  if (anhText && String(anhText).trim()) {
    const b = angabenAusAnhang_(anhText, fehlt.steuer);
    if (b.steuer && !(a.steuer && steuerIdGueltig_(a.steuer))) { a.steuer = b.steuer; ausAnhang = true; }
    if (b.iban && !(a.iban && ibanGueltig_(a.iban))) { a.iban = b.iban; ausAnhang = true; }
    if (b.steuerUnsicher && fehlt.steuer && !a.steuer) hinweise.push('Im Anhang steht vermutlich eine Steuer-ID, sie ließ sich aber nicht sicher lesen (' + b.steuerUnsicher + ') – bitte im Anhang nachsehen.');
    if (b.ibanUnsicher && !a.iban) hinweise.push('Im Anhang steht vermutlich eine IBAN, sie ließ sich aber nicht sicher lesen (' + b.ibanUnsicher + ') – bitte im Anhang nachsehen.');
  }
  let neu = bem;
  if (a.steuer) {
    if (steuerIdGueltig_(a.steuer)) {
      if (fehlt.steuer) neu = neu.replace(/Steuer[\s-]*ID\s*(?:fehlt|ungültig[^\/]*?)(?=\s*\/|\s*$)/i, 'SteuerID: ' + a.steuer);
      else if (neu.indexOf(a.steuer) < 0) neu += ' / SteuerID: ' + a.steuer;
      eingetragen.push('Steuer-ID ' + a.steuer);
    } else hinweise.push('Die Steuer-ID ' + a.steuer + ' hat eine ungültige Prüfziffer (vermutlich Zahlendreher) – bitte beim Kunden nachfragen.');
  }
  const felder = [['geb', 'Geburtsdatum'], ['bj', 'Baujahr'], ['we', 'Anzahl Wohneinheiten'], ['weGes', 'Wohneinheiten gesamt'], ['wnr', 'Wohnungsnummer']];
  const rest = [], zusatz = [];
  felder.forEach(([key, label]) => {
    if (!fehlt[key]) return;
    if (key === 'wnr' && !a.wnr && a.weGes === '1') return; // Einfamilienhaus → keine Wohnungsnummer nötig
    if (a[key]) { eingetragen.push(label + ' ' + a[key]); zusatz.push(label + ': ' + a[key]); } else rest.push(label);
  });
  if (fa) neu = neu.replace(/Für Antrag fehlt:\s*[^\/]+/i, rest.length ? 'Für Antrag fehlt: ' + rest.join(', ') + ' ' : '');
  // eigener Vermerk ("Gesamtwohneinheiten ungenau" …) ist erledigt, wenn genau diese Angabe jetzt eingetragen wurde
  const mv = bem.match(OFFEN_VERMERK);
  if (mv) {
    const key = /^wohnungs?\s*-?\s*(?:nummer|nr)/i.test(mv[1]) ? 'wnr' : /gesamt/i.test(mv[1]) ? 'weGes' : /betroffen|\bwe\b/i.test(mv[1]) ? 'we' : /baujahr/i.test(mv[1]) ? 'bj' : /geburtsdatum/i.test(mv[1]) ? 'geb' : 'weGes';
    if (fehlt[key] && a[key]) neu = neu.replace(mv[0], '');
  }
  if (a.weUnklar) zusatz.push('Kunde nennt ' + a.weUnklar + ' Wohnungen (Mail ' + Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM.yy') + ') – bitte entscheiden');
  if (a.weUnklar) hinweise.push('Der Kunde nennt "' + a.weUnklar + ' Wohneinheit(en)/Wohnung(en)" – nicht eindeutig. Bitte entscheiden und in der Bemerkung z. B. „Wohneinheiten gesamt: 13“ bzw. „Anzahl Wohneinheiten: 1“ eintragen – das Beiblatt wird dann automatisch ergänzt.');
  if (a.iban) {
    if (ibanGueltig_(a.iban)) { if (neu.replace(/\s/g, '').indexOf(a.iban.replace(/\s/g, '')) < 0) zusatz.push('IBAN: ' + a.iban); eingetragen.push('IBAN ' + a.iban); }
    else hinweise.push('Die IBAN ' + a.iban + ' ist ungültig (Prüfziffer) – bitte beim Kunden nachfragen.');
  }
  if (zusatz.length) neu += ' / ' + zusatz.join(' / ');
  neu = neu.replace(/\s*\/(?:\s*\/)+\s*/g, ' / ').replace(/\s+\/\s+/g, ' / ').replace(/^\s*\/\s*|\s*\/\s*$/g, '').trim();
  if (neu !== bem) { zelleTextSetzen_(zelle, bem, neu); listeAktualisiert_(L); } // V65: Formatierung (rote Vermerke) bleibt
  if (!eingetragen.length && !hinweise.length) return '';
  const name = (k.vorname ? k.vorname + ' ' : '') + k.nachname;
  const offenGesamt = (fehlt.steuer && !(a.steuer && steuerIdGueltig_(a.steuer)) ? ['Steuer-ID'] : []).concat(rest);
  mailAnMich_( 'Angaben eingegangen – ' + name,
    name + ' hat geantwortet (' + Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM.yyyy HH:mm') + ', Betreff "' + m.getSubject() + '").\n\n' +
    (eingetragen.length ? 'In die Kundenliste eingetragen:\n' + eingetragen.map(x => '• ' + x).join('\n') + '\n\n' : '') +
    (hinweise.length ? 'Bitte prüfen:\n' + hinweise.map(x => '• ' + x).join('\n') + '\n\n' : '') +
    (offenGesamt.length ? 'Noch offen für den Antrag: ' + offenGesamt.join(', ') + '\n' : 'Für den Antrag fehlt jetzt nichts mehr (laut Liste).\n') +
    '\nBitte kurz gegenlesen – die Angaben wurden automatisch aus der Mail' + (ausAnhang ? ' bzw. ihren Anhängen (Texterkennung)' : '') + ' gelesen.');
  return (eingetragen.length ? 'eingetragen: ' + eingetragen.join(', ') : '') + (hinweise.length ? (eingetragen.length ? ' – ' : '') + 'Hinweis: ' + hinweise.join(' ') : '');
}

// Steuer-ID und IBAN aus dem erkannten Text eines Anhangs (Foto/Scan). Nur Werte mit gültiger Prüfziffer.
function angabenAusAnhang_(t, steuerFehlt) {
  const r = {};
  const text = String(t || '').replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0'); // häufiger Lesefehler O ↔ 0
  // Steuer-ID: zuerst mit Beschriftung, sonst genau eine gültige 11-stellige Zahl mit typischem Aufbau
  const lab = text.match(/(?:steuer[\s-]*(?:id|ident\w*)|identifikations\s*-?\s*(?:nummer|nr)|id[\s-]*nr)\.?[^0-9\n]{0,40}((?:\d[\s\/.-]?){10}\d)/i);
  const kandL = lab ? lab[1].replace(/\D/g, '') : '';
  if (kandL && steuerIdGueltig_(kandL)) r.steuer = kandL;
  else {
    if (kandL) r.steuerUnsicher = kandL;
    if (steuerFehlt) {
      const aufbau = id => { const z = {}; for (const c of id.slice(0, 10)) z[c] = (z[c] || 0) + 1; const v = Object.values(z); return v.filter(x => x >= 2).length === 1 && v.every(x => x <= 3); };
      const kand = Array.from(new Set((text.match(/(?<![\dA-Z])(?:\d[ ]?){10}\d(?!\d)/g) || []).map(x => x.replace(/\D/g, ''))))
        .filter(x => x.length === 11 && steuerIdGueltig_(x) && aufbau(x));
      if (kand.length === 1) { r.steuer = kand[0]; delete r.steuerUnsicher; }
    }
  }
  // IBAN: mit Leerzeichen-Gruppen oder zusammengeschrieben, nur mit gültiger Prüfsumme
  const kompakt = text.toUpperCase().replace(/[\s.]/g, '');
  const roh = Array.from(new Set(kompakt.match(/DE\d{20,}|(?:AT|CH|LU|NL|FR|IT|ES|BE)\d{2}[A-Z0-9]{12,30}/g) || []));
  const ib = roh.map(x => { const n = { DE: 22, AT: 20, CH: 21, LU: 20, NL: 18, FR: 27, IT: 27, ES: 24, BE: 16 }[x.slice(0, 2)]; return n ? x.slice(0, n) : x; });
  const gut = ib.filter(x => ibanGueltig_(x));
  if (gut.length) {
    r.iban = gut[0].replace(/(.{4})/g, '$1 ').trim();
    const quelle = roh[ib.indexOf(gut[0])];
    if (/^DE/.test(quelle) && quelle.length > 22) r.ibanZuLang = quelle; // z. B. eine Ziffer zu viel getippt
  }
  else if (/iban/i.test(text) && ib.length) r.ibanUnsicher = ib[0];
  return r;
}

// Texterkennung (Google Drive) für einen Anhang. Große Fotos werden vorher über die Drive-Vorschau
// verkleinert, weil die Texterkennung nur Dateien bis ca. 2 MB zuverlässig liest.
function anhangText_(blob) {
  let b = blob;
  if (/^image\//i.test(b.getContentType()) && b.getBytes().length > 1900000) { try { b = bildVerkleinern_(b) || b; } catch (e) { console.log('Verkleinern: ' + e.message); } }
  const name = '_ocr_tmp_' + (b.getName() || 'anhang');
  let id;
  if (Drive.Files.create) id = Drive.Files.create({ name, mimeType: MimeType.GOOGLE_DOCS }, b, { ocrLanguage: 'de' }).id;
  else id = Drive.Files.insert({ title: name, mimeType: MimeType.GOOGLE_DOCS }, b, { ocr: true, ocrLanguage: 'de' }).id;
  try { return DocumentApp.openById(id).getBody().getText(); }
  finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} } // nur die eigene Hilfsdatei
}
function bildVerkleinern_(blob) {
  const f = DriveApp.createFile(blob.copyBlob().setName('_ocr_bild_' + (blob.getName() || 'bild.jpg')));
  try {
    for (let i = 0; i < 10; i++) {
      const link = (Drive.Files.get(f.getId(), { fields: 'thumbnailLink' }) || {}).thumbnailLink;
      if (link) {
        const url = link.replace(/=s\d+$/, '') + '=s2400';
        let r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (r.getResponseCode() !== 200) r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
        if (r.getResponseCode() === 200 && r.getBlob().getBytes().length > 20000) return r.getBlob().setName('verkleinert.jpg');
      }
      Utilities.sleep(2000);
    }
    return null;
  } finally { try { f.setTrashed(true); } catch (e) {} } // nur die eigene Hilfsdatei
}

// ===================== LISTE → BEIBLATT (Ablauf) =====================
// Die Kundenliste ist maßgeblich: Stehen in der Bemerkung Angaben wie
//   "SteuerID: 12345678901", "Wohneinheiten gesamt: 13", "Anzahl Wohneinheiten: 1", "Baujahr: 1987", "Geburtsdatum: 01.02.1960"
// und fehlen sie im Beiblatt (oder stehen dort unklar, z. B. "von ca 52"), werden sie ins Beiblatt übernommen.
// Die Datei behält Namen und Link, Google Drive hebt die vorige Fassung unter "Versionen verwalten" auf.
// Eine abweichende, gültige Steuer-ID im Beiblatt wird nie überschrieben (nur gemeldet). Erledigte Vorgänge bleiben unberührt.

// Klare Wohneinheiten-Angabe? "2", "1 WE", "1 EF" → Zahl; "von ca 52", "Wohnung 21", "2?" → null
function weZahl_(v) {
  // "1 (Wohnung Nr. 79)" → 1: der Zusatz mit der Wohnungsnummer gehört nicht zur Anzahl
  const t = String(v || '').trim().replace(/\s*\(([^()]*)\)\s*$/, (m, x) => /wohnung|whg|nr\b|nr\.|\bog\b|\beg\b|\bdg\b|stock|top|links|rechts|mitte/i.test(x) ? '' : m);
  if (!t || /\bca\b|circa|ungef|etwa|\bvon\b|\bbis\b|wohnung\s*(?:nr\.?\s*)?\d|\bnr\.?\s*\d|\?/i.test(t)) return null;
  const m = t.match(/^(\d{1,3})\s*(?:WE|EF|EFH|Wohneinheit(?:en)?|Wohnung(?:en)?)?\.?$/i);
  return m ? String(+m[1]) : null;
}
// WE-Felder deuten, auch wenn dort die Wohnungsnummer steht:
//   Betroffene WE "Wohnung Nr.79" + Wohneinheiten gesamt "Von insgesamt 240" → 1 betroffene WE, 240 gesamt, Wohnung Nr. 79
// Ungefähre Angaben ("von ca 52", "2?") bleiben unklar.
function weDeuten_(f) {
  const be = String(f['Betroffene WE'] || '').trim(), ge = String(f['Wohneinheiten gesamt'] || '').trim();
  const t = (be + ' ' + ge).trim();
  const r = { we: weZahl_(be), weGes: weZahl_(ge), wnr: null };
  const ungefaehr = /\bca\b|circa|ungef|etwa|\?/i;
  const nr = t.match(/\b(?:wohnung|whg|wohnungs?nr|top|app(?:artment)?)\.?\s*(?:nr\.?|nummer)?\s*(\d{1,4}[a-z]?)\b/i);
  if (nr) r.wnr = nr[1];
  if (!r.weGes && ge && !ungefaehr.test(ge)) {
    const g = ge.match(/^(?:von\s*)?(?:insgesamt|gesamt)?\s*(\d{1,4})\s*(?:WE|Wohneinheit(?:en)?|Wohnung(?:en)?)?\.?$/i);
    if (g) r.weGes = String(+g[1]);
  }
  if (!r.weGes && !ungefaehr.test(t)) { // "Wohnung Nr. 79 von insgesamt 240" in einem Feld
    const g = t.match(/\bvon\s*(?:insgesamt\s*)?(\d{1,4})\b/i) || t.match(/\binsgesamt\s*(\d{1,4})\b/i);
    if (g) r.weGes = String(+g[1]);
  }
  // Nur eine Wohnungsnummer und sonst keine Zahl bei "betroffene WE" → genau 1 betroffene Wohneinheit
  if (!r.we && r.wnr && !ungefaehr.test(be)) {
    const rest = be.replace(nr[0], '').replace(/\b(?:von\s*)?(?:insgesamt\s*)?\d{1,4}\b/i, m => /von|insgesamt/i.test(m) ? '' : m);
    if (!/\d/.test(rest)) r.we = '1';
  }
  return r;
}
// Gedeutete WE-Angaben als Bemerkung (nur wenn das Beiblatt sie nicht schon als klare Zahl enthält).
// "Anzahl Wohneinheiten: 1" / "Wohneinheiten gesamt: 240" werden danach automatisch als Zahl ins Beiblatt übernommen.
function weVermerke_(f) {
  const wd = weDeuten_(f), out = [];
  if (wd.we && !weZahl_(f['Betroffene WE'])) out.push('Anzahl Wohneinheiten: ' + wd.we);
  if (wd.weGes && !weZahl_(f['Wohneinheiten gesamt'])) out.push('Wohneinheiten gesamt: ' + wd.weGes);
  if (wd.wnr) out.push('Wohnungsnummer: ' + wd.wnr);
  return out;
}
// Einmalig: Kunden der letzten 30 Tage, bei denen "Wohnung Nr. …" / "von insgesamt …" fälschlich als unklar galt
// (z. B. Lorenzen): Bemerkung korrigieren und – falls noch nicht verschickt – den Entwurf "benötigte Unterlagen" anpassen.
function weNachbessern_(st, probleme) {
  if ((st._weDeutV || 0) >= 1) return;
  const L = liste_();
  if (!L || !L.sp['Bemerkung']) return;
  let entwuerfe = null;
  for (const o of ordnerListe_()) {
    const s = st[o.getId()];
    if (!s || !s.bb || !s.kunde || !s.kunde.nachname) continue;
    if (s.bbDatum && Date.now() - new Date(s.bbDatum).getTime() > 30 * 864e5) continue;
    const vermerke = weVermerke_(s.bb);
    if (!vermerke.length) continue;
    const nn = s.kunde.nachname;
    // 1) Bemerkung
    const row = listeZeile_(L, nn, s.kunde.vorname);
    if (row > 0) {
      const zelle = L.sh.getRange(row, L.sp['Bemerkung']);
      const bem = zelle.getDisplayValue();
      if (!/erledigt/i.test(bem)) {
        // nur die jetzt geklärten Punkte aus "Für Antrag fehlt" streichen, alles andere bleibt wie es ist
        const wd = weDeuten_(s.bb);
        const geklaert = x => (wd.we && /^anzahl wohneinheiten/i.test(x)) || (wd.weGes && /^wohneinheiten gesamt/i.test(x)) || (wd.wnr && /^wohnungsnummer/i.test(x));
        const faAlt = (bem.match(/Für Antrag fehlt:\s*([^\/]+)/i) || [])[1] || '';
        const fa = faAlt.split(',').map(x => x.trim()).filter(x => x && !geklaert(x));
        let neu = bem.replace(/Für Antrag fehlt:\s*[^\/]+/i, fa.length ? 'Für Antrag fehlt: ' + fa.join(', ') + ' ' : '');
        vermerke.forEach(v => { if (neu.indexOf(v.split(':')[0] + ':') < 0) neu += ' / ' + v; });
        neu = neu.replace(/\s*\/(?:\s*\/)+\s*/g, ' / ').replace(/\s+\/\s+/g, ' / ').replace(/^\s*\/\s*|\s*\/\s*$/g, '').trim();
        if (neu !== bem) { zelle.setValue(neu); listeAktualisiert_(L); }
      }
    }
    // 2) Entwurf "benötigte Unterlagen", solange er noch nicht verschickt ist
    entwuerfe = entwuerfe || GmailApp.getDrafts();
    const betreff = 'Ihr Förderantrag Eibner & Regnath / benötigte Unterlagen ' + nn;
    const d = entwuerfe.find(x => { try { return x.getMessage().getSubject() === betreff; } catch (e) { return false; } });
    if (d) {
      const m = d.getMessage();
      const alt = m.getPlainBody().replace(/\r\n/g, '\n');
      const fehlt = fehlendeAngaben_(s.bb);
      const abschnitt = /\n\n3\. Für die Antragstellung beim BAFA[\s\S]*?damit wir den Antrag stellen können\./;
      if (abschnitt.test(alt)) {
        let ersatz = '';
        if (fehlt.length) {
          ersatz = '\n\n3. Für die Antragstellung beim BAFA benötigen wir außerdem noch ' + (fehlt.length === 1 ? 'folgende Angabe, die im Beiblatt noch fehlt:' : 'folgende Angaben, die im Beiblatt noch fehlen:') + '\n' +
            fehlt.map(x => '   – ' + x.text).join('\n') + '\n\nBitte senden Sie mir ' + (fehlt.length === 1 ? 'diese Angabe' : 'diese Angaben') + ' einfach als Antwort auf diese E-Mail, damit wir den Antrag stellen können.';
        }
        const neu = alt.replace(abschnitt, ersatz);
        if (neu !== alt) {
          const opt = { htmlBody: htmlMitLinks_(neu), attachments: m.getAttachments() };
          if (m.getCc()) opt.cc = m.getCc();
          d.update(m.getTo(), betreff, neu, opt);
          probleme.push(o.getName() + ': Entwurf "benötigte Unterlagen" angepasst – Wohnungsnummer und Wohneinheiten stehen schon im Beiblatt (' + vermerke.join(', ') + ') und werden nicht mehr abgefragt.');
        }
      } else if (/wohnungsnummer|wohneinheiten/i.test(alt)) {
        probleme.push(o.getName() + ': Im Entwurf "benötigte Unterlagen" werden noch Wohneinheiten/Wohnungsnummer abgefragt, obwohl sie im Beiblatt stehen (' + vermerke.join(', ') + ') – bitte den Punkt im Entwurf selbst streichen.');
      }
    }
  }
  st._weDeutV = 1;
}
// Wert für das Feld "Betroffene WE": die Anzahl – und bei mehr als 1 Wohneinheit im Gebäude zusätzlich die Wohnungsnummer,
// z. B. "1 (Wohnung Nr. 79)". Quelle: Bemerkung ("Anzahl Wohneinheiten: 1", "Wohnungsnummer: 79", "Wohneinheiten gesamt: 240"),
// sonst das, was schon im Beiblatt steht.
function betroffeneWeWert_(bem, bb) {
  const ausBem = (bem.match(/(?:anzahl\s+wohneinheiten|betroffene?\s+(?:wohneinheiten|we)|\bwe\s+betroffen)\s*:?\s*(\d{1,3})\b/i) || [])[1] || null;
  const wd = weDeuten_(bb);
  const zahl = ausBem || wd.we;
  if (!zahl) return null;
  const wnrBem = ((bem.match(/wohnungs?\s*-?\s*(?:nummer|nr\.?)\s*:\s*([^\/\n]+)/i) || [])[1] || '').trim();
  const wnr = wnrBem || wd.wnr || '';
  const ges = +((bem.match(/(?:wohneinheiten|\bwe)\s*gesamt\s*:?\s*(\d{1,4})\b/i) || [])[1] || wd.weGes || 0);
  if (zahl === '1' && wnr && ges > 1) {
    const zusatz = /^\d{1,4}[a-z]?$/i.test(wnr) ? 'Nr. ' + wnr : wnr.replace(/^(?:wohnung|whg)\.?\s*/i, '');
    return '1 (Wohnung ' + zusatz + ')';
  }
  return ausBem; // ohne Wohnungsnummer: nur wenn die Anzahl ausdrücklich in der Bemerkung steht (wie bisher)
}
// Vergleichsform für "Betroffene WE": "1 (Wohnung Nr. 79)" bleibt so, sonst nur die Zahl
function weFeldNorm_(v) {
  const t = String(v || '').trim().replace(/\s+/g, ' ');
  const m = t.match(/^(\d{1,3})\s*(?:WE)?\s*\(\s*(?:wohnung|whg)\.?\s*(.+?)\s*\)$/i);
  if (m) return String(+m[1]) + ' (Wohnung ' + m[2].replace(/^nr\.?\s*/i, 'Nr. ') + ')';
  return weZahl_(t);
}
function datumNorm_(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})$/);
  return m ? ('0' + m[1]).slice(-2) + '.' + ('0' + m[2]).slice(-2) + '.' + m[3] : null;
}
const BEIBLATT_ABGLEICH = [
  { feld: 'SteuerID 11stellig', label: 'Steuer-ID', schuetzen: true,
    ausListe: b => { const m = b.match(/steuer\s*-?\s*id\s*:?\s*((?:\d[\s\/]*){11})/i); const v = m ? m[1].replace(/\D/g, '') : ''; return steuerIdGueltig_(v) ? v : null; },
    norm: v => { const d = String(v || '').replace(/\D/g, ''); return steuerIdGueltig_(d) ? d : null; } },
  { feld: 'Wohneinheiten gesamt', label: 'Wohneinheiten gesamt',
    ausListe: b => (b.match(/(?:wohneinheiten|\bwe)\s*gesamt\s*:?\s*(\d{1,3})\b/i) || [])[1] || null, norm: weZahl_ },
  { feld: 'Betroffene WE', label: 'betroffene Wohneinheiten',
    ausListe: (b, bb) => betroffeneWeWert_(b, bb || {}), norm: weFeldNorm_ },
  { feld: 'Baujahr / Fertigstellungsdatum', label: 'Baujahr',
    ausListe: b => (b.match(/baujahr\s*:?\s*((?:18|19|20)\d{2})\b/i) || [])[1] || null,
    norm: v => (String(v || '').trim().match(/^((?:18|19|20)\d{2})$/) || [])[1] || null },
  { feld: 'Geburtsdatum', label: 'Geburtsdatum',
    ausListe: b => datumNorm_((b.match(/(?:geburtsdatum|\bgeb\.?)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:19|20)\d{2})/i) || [])[1]), norm: datumNorm_ }
];

// Zum Anstoßen von Hand: gleicht sofort ab und zeigt im Protokoll, was passiert ist.
function beiblattAbgleichen() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { Logger.log('Gerade läuft die Automatik – bitte in 2 Minuten nochmal ausführen.'); return; }
  const probleme = [];
  try {
    const st = ladeStatus_();
    kundenAntwortenAuswerten_(st, probleme, true); // 1. neue Kundenantworten in die Liste
    speichereStatus_(st);
    beiblaetterAbgleichen_(st, probleme, true);    // 2. Liste → Beiblatt
    speichereStatus_(st);
  } finally { lock.releaseLock(); }
  Logger.log(probleme.length ? 'Bitte prüfen:\n' + probleme.join('\n') : 'Fertig, keine Probleme.');
}
function steuerIdInsBeiblatt() { beiblattAbgleichen(); } // alter Name

function beiblaetterAbgleichen_(st, probleme, protokoll) {
  const log = t => { if (protokoll) Logger.log(t); };
  const L = liste_();
  if (!L || !L.sp['Bemerkung'] || !L.sp['Nachname']) return;
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const zeilen = {};
  listeDaten_(L).forEach(r => { const k = norm(r[L.sp['Nachname'] - 1]); if (k) (zeilen[k] = zeilen[k] || []).push(r); });
  const eingetragen = [];
  let schreibvorgaenge = 0;
  for (const o of ordnerListe_()) {
    if (zeitUeber_() || schreibvorgaenge >= 10) { log('Zeitlimit/Höchstzahl erreicht – Rest im nächsten Lauf.'); break; }
    const s = st[o.getId()];
    if (!s) continue;
    if (s.bbSyncFehler === heute_() && !protokoll) continue; // heute schon gescheitert – nicht alle 5 Minuten neu versuchen
    s.bbSync = s.bbSync || {};
    if (s.bbSid) { s.bbSync['SteuerID 11stellig'] = s.bbSid; delete s.bbSid; } // alte Form übernehmen
    let treffer = zeilen[norm(nachnameAusOrdner_(o.getName()))] || [];
    const plz = (o.getName().match(/\b(\d{5})\b/) || [])[1];
    if (treffer.length > 1 && plz && L.sp['PLZ']) treffer = treffer.filter(r => String(r[L.sp['PLZ'] - 1]).trim() === plz);
    if (treffer.length !== 1) continue;
    const bem = String(treffer[0][L.sp['Bemerkung'] - 1]);
    if (/erledigt/i.test(bem)) continue;
    const ziele = BEIBLATT_ABGLEICH.map(d => ({ d, wert: d.ausListe(bem, s.bb) })).filter(z => z.wert && s.bbSync[z.d.feld] !== z.wert);
    if (!ziele.length) continue;

    // Beiblatt = PDF mit "Beiblatt" im Namen (Endung egal, E&R lädt teils ohne ".pdf" hoch); als falsch markierte zuletzt
    const bb = dateienCache_(o).filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()) && f.getMimeType() === MimeType.PDF)
      .sort((a, b) => (/falsch|fehlerhaft|\balt\b/i.test(a.getName()) - /falsch|fehlerhaft|\balt\b/i.test(b.getName())) || (b.getDateCreated() - a.getDateCreated()))[0];
    if (!bb) { log(o.getName() + ': kein Beiblatt im Ordner gefunden.'); continue; }
    const roh = bb.getBlob().getBytes();
    const ist = leseFormularfelder_(roh, pako_());
    const schreiben = {}, zeilenMail = [];
    ziele.forEach(({ d, wert }) => {
      const vorher = String(ist[d.feld] || '').trim();
      if (d.norm(vorher) === wert) { s.bbSync[d.feld] = wert; log(o.getName() + ': ' + d.label + ' ' + wert + ' steht bereits im Beiblatt.'); return; }
      if (d.schuetzen && d.norm(vorher)) {
        s.bbSync[d.feld] = wert;
        probleme.push(o.getName() + ': Im Beiblatt steht ' + d.label + ' ' + vorher + ', in der Liste ' + wert + ' – bitte prüfen (Beiblatt nicht geändert).');
        return;
      }
      schreiben[d.feld] = wert;
      zeilenMail.push(d.label + ' ' + wert + (vorher ? ' (vorher: „' + vorher + '“)' : ''));
    });
    if (!Object.keys(schreiben).length) continue;
    const neu = beiblattFelderSetzen_(roh, schreiben);
    if (!neu) { // älteres Beiblatt-Formular ohne ausfüllbare Felder – nichts zu tun
      Object.keys(schreiben).forEach(k => { s.bbSync[k] = schreiben[k]; });
      log(o.getName() + ': älteres Beiblatt ohne Formularfelder – übersprungen.'); continue;
    }
    const pruef = leseFormularfelder_(neu, pako_());
    const falsch = BEIBLATT_ABGLEICH.filter(d => d.feld in schreiben && d.norm(pruef[d.feld]) !== schreiben[d.feld]);
    if (falsch.length) {
      Object.keys(schreiben).forEach(k => { s.bbSync[k] = schreiben[k]; });
      probleme.push(o.getName() + ': ' + falsch.map(d => d.label).join(', ') + ' konnte nicht sicher ins Beiblatt geschrieben werden – bitte von Hand eintragen.');
      continue;
    }
    try {
      // Kundenordner liegen in einer geteilten Ablage → supportsAllDrives ist Pflicht
      Drive.Files.update({}, bb.getId(), Utilities.newBlob(neu, 'application/pdf', bb.getName()), { supportsAllDrives: true });
    } catch (e) {
      const heute = heute_();
      if (s.bbSyncFehler !== heute) { s.bbSyncFehler = heute; probleme.push(o.getName() + ': Beiblatt konnte nicht aktualisiert werden – ' + e.message); }
      continue; // höchstens 1 Meldung pro Tag und Kunde
    }
    delete s.bbSyncFehler;
    schreibvorgaenge++;
    Object.keys(schreiben).forEach(k => { s.bbSync[k] = schreiben[k]; if (s.bb) s.bb[k] = schreiben[k]; });
    if (schreiben['SteuerID 11stellig'] && s.kunde && !s.kunde.steuerId) s.kunde.steuerId = schreiben['SteuerID 11stellig'];
    eingetragen.push('• ' + o.getName() + ': ' + zeilenMail.join(', '));
    log(o.getName() + ': ins Beiblatt "' + bb.getName() + '" eingetragen: ' + zeilenMail.join(', '));
    speichereStatus_(st);
  }
  if (eingetragen.length) {
    mailAnMich_( 'Beiblatt ergänzt (' + eingetragen.length + ')',
      'Folgende Angaben aus der Kundenliste wurden ins Beiblatt übernommen:\n\n' + eingetragen.join('\n') +
      '\n\nDie vorige Fassung ist in Google Drive weiter abrufbar (Datei → Rechtsklick → Dateiinformationen → Versionen verwalten).');
  }
}

// ===================== BEWILLIGUNGSZEITRAUM =====================
// Liest das Ende des Bewilligungszeitraums aus dem Zuwendungsbescheid (Texterkennung über Google Drive),
// schreibt es in die Spalte "Bewilligt bis" und legt 3 Monate vor Ablauf einen Erinnerungs-Entwurf an den Kunden an.
const FRIST_VORLAUF_TAGE = 90;

function pdfText_(datei) {
  const blob = datei.getBlob();
  let id;
  if (Drive.Files.create) id = Drive.Files.create({ name: '_ocr_tmp_' + datei.getName(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'de' }).id;
  else id = Drive.Files.insert({ title: '_ocr_tmp_' + datei.getName(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocr: true, ocrLanguage: 'de' }).id;
  try { return DocumentApp.openById(id).getBody().getText(); }
  finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} } // nur die eigene Hilfsdatei
}

function bewilligungsEnde_(text, fruehestens) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const plausibel = d => !fruehestens || d - fruehestens > 180 * 864e5; // Ende liegt Jahre nach dem Bescheid
  const kandidaten = [
    t.match(/endet\s+(?:daher\s+)?(?:am\s+)?(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/i),
    t.match(/Bewilligungszeitraum[^€]{0,250}?bis\s+(?:zum\s+)?(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/i)
  ];
  for (const m of kandidaten) {
    if (!m) continue;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (plausibel(d)) return { datum: d, geschaetzt: false };
  }
  const d = t.match(/Eschborn,?\s*(?:den\s*)?(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  const mon = +((t.match(/Bewilligungszeitraum\s+betr\S*\s+(\d{1,2})\s+Monat/i) || [])[1] || 36);
  if (d) { const x = new Date(+d[3], +d[2] - 1, +d[1]); x.setMonth(x.getMonth() + mon); return { datum: x, geschaetzt: true }; }
  return null;
}

function bewilligungPruefen_(st, probleme) {
  const L = liste_();
  const jetzt = new Date(), fmt = d => Utilities.formatDate(d, 'Europe/Berlin', 'dd.MM.yyyy');
  let ocr = 0, entwuerfe = 0;
  const tagHeute = heute_();
  for (const o of ordnerListe_()) {
    if (zeitUeber_()) return false;
    const s = st[o.getId()];
    if (!s) continue;
    if (s.bewTag === tagHeute) continue; // V65: heute schon geprüft → bei Fortsetzung im nächsten Lauf nicht wieder von vorn
    try {
      const dateien = dateienCache_(o);
      const zb = dateien.find(f => /zuwendungsbescheid/i.test(f.getName()));
      if (!zb) { s.bewTag = tagHeute; continue; }
      s.bewTag = tagHeute;
      const k = kundeAusOrdner_(o, s);
      const row = L ? listenZeileFuerOrdner_(L, o, k) : -1;
      // 1) Enddatum ermitteln (Spalte "Bewilligt bis" von Hand > Bescheid lesen > Schätzung)
      if (row > 0 && L.sp['Bewilligt bis']) {
        const zelle = L.sh.getRange(row, L.sp['Bewilligt bis']).getDisplayValue();
        const v = zelle.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (v) {
          const d = new Date(+(v[3].length === 2 ? '20' + v[3] : v[3]), +v[2] - 1, +v[1]).toISOString();
          const ca = /ca/i.test(zelle);
          if (d !== s.bewilligtBis || ca !== !!s.bewilligtCa) { s.bewilligtBis = d; s.bewilligtCa = ca; delete s.fristErinnert; }
        }
      }
      if (!s.bewilligtBis && (s.bewilligtVersuche || 0) < 2 && ocr < 12) {
        if (zeitUeber_()) return false;
        ocr++; s.bewilligtVersuche = (s.bewilligtVersuche || 0) + 1;
        let e = null;
        try { e = bewilligungsEnde_(pdfText_(zb), zb.getDateCreated()); } catch (err) { Logger.log('Texterkennung ' + o.getName() + ': ' + err.message); }
        if (!e && s.bewilligtVersuche >= 2) { // Schätzung: Bescheid-Eingang + 36 Monate
          const x = new Date(zb.getDateCreated()); x.setMonth(x.getMonth() + 36); e = { datum: x, geschaetzt: true };
        }
        if (e) {
          s.bewilligtBis = e.datum.toISOString(); s.bewilligtCa = !!e.geschaetzt;
          if (row > 0) L.sh.getRange(row, spalteSicher_(L, 'Bewilligt bis')).setValue(fmt(e.datum) + (e.geschaetzt ? ' (ca.)' : ''));
          if (e.geschaetzt) probleme.push(o.getName() + ': Bewilligungszeitraum nicht sicher lesbar – geschätzt bis ' + fmt(e.datum) + ' (Spalte "Bewilligt bis" mit "ca."). Bitte im Bescheid prüfen und ggf. korrigieren.');
        }
      }
      // 2) Erinnerung 3 Monate vor Ablauf – nur mit sicherem Datum, das noch nicht vorbei ist
      if (!s.bewilligtBis || s.fristErinnert || entwuerfe >= 10) continue;
      const ende = new Date(s.bewilligtBis);
      if (ende - jetzt > FRIST_VORLAUF_TAGE * 864e5) continue;
      if (dateien.some(f => /festsetzungsbescheid/i.test(f.getName())) || vnUnterlagenDa_(o) || VN_STAND.test(listeStand_(L, k, o))) continue;
      if (!k.email || s.wartetZahlung) continue;
      if (s.bewilligtCa || ende < jetzt) {
        probleme.push(o.getName() + ': Bewilligungszeitraum endet ' + (ende < jetzt ? 'bzw. endete ' : '') + 'am ' + fmt(ende) + (s.bewilligtCa ? ' (nur geschätzt)' : '') + ' – Verwendungsnachweis noch offen. Bitte selbst prüfen; ein Entwurf wurde bewusst nicht angelegt.');
        s.fristErinnert = jetzt.toISOString();
        continue;
      }
      if (!GmailApp.search('in:sent to:' + k.email + ' subject:Zuwendungsbescheid has:attachment', 0, 1).length) continue; // Bescheid noch nicht beim Kunden
      if (GmailApp.search('in:drafts subject:Bewilligungszeitraum "' + k.nachname + '"', 0, 1).length) { s.fristErinnert = jetzt.toISOString(); continue; }
      const zeilen = [
        begruessung_(k.anrede, k.nachname), '',
        'ich möchte Sie freundlich daran erinnern, dass der Bewilligungszeitraum Ihres Zuwendungsbescheids am ' + fmt(ende) + ' endet. ' +
        'Bis dahin muss die Maßnahme vollständig umgesetzt sein; auch das Rechnungsdatum und die Zahlung müssen innerhalb des Bewilligungszeitraums liegen. Andernfalls ist der Zuschuss gefährdet.', '',
        'Damit ich den Verwendungsnachweis rechtzeitig für Sie einreichen kann, senden Sie mir bitte – sobald die Maßnahme abgeschlossen ist – folgende Unterlagen per E-Mail:', ''
      ].concat(VN_UNTERLAGEN, ['',
        'Sollte sich die Umsetzung verzögern, melden Sie sich bitte kurz bei mir, damit wir gemeinsam eine Lösung finden.', '',
        SIGNATUR]);
      entwurf_(k.email, 'Wichtig: Bewilligungszeitraum Ihrer BAFA-Förderung endet am ' + fmt(ende) + ' – ' + k.nachname, pruefHinweis_(k.anrede) + zeilen.join('\n'));
      s.fristErinnert = jetzt.toISOString(); entwuerfe++;
      probleme.push('Frist-Erinnerung als Entwurf vorbereitet: ' + k.nachname + ' (Bewilligungszeitraum endet ' + fmt(ende) + ').');
    } catch (e) {
      probleme.push(o.getName() + ': Bewilligungszeitraum prüfen fehlgeschlagen – ' + e.message);
    }
  }
  return true;
}

// ===================== NACHFASSEN NACH DER GEPLANTEN UMSETZUNG =====================
// Beiblatt-Feld "Umsetzung" (z. B. "Mai 2027"): einen Monat nach Ende dieses Monats ein Entwurf an den Kunden,
// ob die Maßnahme fertig ist und er die Unterlagen für den Verwendungsnachweis schicken kann. Einmal pro Kunde.
function umsetzungsMonat_(text) {
  const t = ohneAkzente_(String(text || '').toLowerCase());
  const jahre = (t.match(/\b20\d{2}\b/g) || []);
  const letztesJahr = jahre.length ? +jahre[jahre.length - 1] : null;
  const j2 = y => !y ? null : (y.length === 2 ? 2000 + +y : +y);
  // 1) Kalenderwoche: "KW 45 2026", "KW 12/2027"
  const kw = t.match(/kw\s*(\d{1,2})\s*[\/.\-]?\s*(20\d{2}|\d{2})?\b/);
  if (kw && +kw[1] >= 1 && +kw[1] <= 53) {
    const y = j2(kw[2]) || letztesJahr;
    return y ? new Date(y, Math.min(11, Math.floor((+kw[1] - 1) / 4.35)), 1) : null;
  }
  // 2) Monatsname oder Jahreszeit, ggf. mit Jahr – bei mehreren der späteste ("Dezember 2026 / Januar 2027")
  const namen = { jan: 0, feb: 1, mar: 2, maerz: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11,
    fruehjahr: 4, fruhjahr: 4, fruehling: 4, sommer: 7, herbst: 10, winter: 11, anfang: 2, mitte: 6, ende: 11 };
  let best = null;
  const re = /\b(maerz|jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|dez|fruehjahr|fruhjahr|fruehling|sommer|herbst|winter|anfang|mitte|ende)[a-z]*\.?\s*(20\d{2}|'?\d{2}\b)?/g;
  let m;
  while ((m = re.exec(t))) {
    const y = j2(m[2] ? m[2].replace("'", '') : null) || letztesJahr;
    if (!y) continue;
    const d = new Date(y, namen[m[1]], 1);
    if (!best || d > best) best = d;
  }
  if (best) return best;
  // 3) Zahlen: "05/2027", "05.2027", "05/27"
  for (const n of t.matchAll(/(\d{1,2})\s*[.\/\-]\s*(20\d{2})(?![.\d])|(\d{1,2})\s*\/\s*(\d{2})(?![.\d])/g)) {
    const mon = +(n[1] || n[3]), y = j2(n[2] || n[4]);
    if (mon >= 1 && mon <= 12) return new Date(y, mon - 1, 1);
  }
  // 4) nur ein Jahr: Dezember dieses Jahres
  return letztesJahr ? new Date(letztesJahr, 11, 1) : null;
}

function umsetzungNachfassen_(st, probleme) {
  const L = liste_();
  const jetzt = new Date();
  let gelesen = 0, entwuerfe = 0;
  for (const o of ordnerListe_()) {
    if (zeitUeber_()) return false;
    if (entwuerfe >= 10) break;
    const s = st[o.getId()];
    if (!s || s.nachgefasstAm) continue;
    try {
      const dateien = dateienCache_(o);
      if (!dateien.some(f => /zuwendungsbescheid/i.test(f.getName()))) continue;
      if (dateien.some(f => /festsetzungsbescheid/i.test(f.getName())) || vnUnterlagenDa_(o)) continue;
      let ums = s.bb && s.bbV === 2 ? (s.bb['Text2'] || '') : s.umsetzung;
      if (ums === undefined) {
        if (gelesen >= 10) continue;
        gelesen++;
        const bb = dateien.filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()))
          .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
        ums = '';
        if (bb) { try { ums = String(leseFormularfelder_(bb.getBlob().getBytes(), pako_())['Text2'] || ''); } catch (e) {} }
        s.umsetzung = ums;
      }
      const monat = umsetzungsMonat_(ums);
      if (!monat) continue;
      const faellig = new Date(monat.getFullYear(), monat.getMonth() + 1, 0); // letzter Tag des Monats
      faellig.setDate(faellig.getDate() + 30);
      if (jetzt < faellig) continue;
      const k = kundeAusOrdner_(o, s);
      if (!k.email || s.wartetZahlung || VN_STAND.test(listeStand_(L, k, o))) continue;
      if (!GmailApp.search('in:sent to:' + k.email + ' subject:Zuwendungsbescheid has:attachment', 0, 1).length) continue; // Bescheid noch nicht beim Kunden
      if (GmailApp.search('in:sent to:' + k.email + ' newer_than:30d (Schlussrechnung OR Verwendungsnachweis OR Bewilligungszeitraum)', 0, 1).length
        || GmailApp.search('in:drafts (subject:Verwendungsnachweis OR subject:Bewilligungszeitraum) "' + k.nachname + '"', 0, 1).length) continue;
      const steuerFehlt = !(k.steuerId || steuerIdAusMails_(k.email));
      const zeilen = [
        begruessung_(k.anrede, k.nachname), '',
        'laut Ihrem Beiblatt war die Umsetzung Ihrer Maßnahme für ' + ums.trim() + ' geplant. Ich hoffe, alles hat gut geklappt!', '',
        'Ist die Maßnahme inzwischen abgeschlossen? Dann senden Sie mir bitte für den Verwendungsnachweis folgende Unterlagen per E-Mail:', ''
      ].concat(VN_UNTERLAGEN, steuerFehlt ? ['– Ihre Steuer-ID (11-stellig) für die Auszahlung des Zuschusses'] : [], ['',
        'Sobald mir die Unterlagen vorliegen, reiche ich den Verwendungsnachweis für Sie ein, damit der Zuschuss ausgezahlt werden kann.', '',
        'Falls sich die Umsetzung verschoben hat, geben Sie mir gerne kurz Bescheid.', '',
        SIGNATUR]);
      entwurf_(k.email, 'Ihre BAFA-Förderung – Unterlagen für den Verwendungsnachweis ' + k.nachname, pruefHinweis_(k.anrede) + zeilen.join('\n'));
      s.nachgefasstAm = jetzt.toISOString(); entwuerfe++;
      probleme.push('Nachfass-Entwurf vorbereitet: ' + k.nachname + ' (Umsetzung laut Beiblatt: ' + ums.trim() + ').');
    } catch (e) {
      probleme.push(o.getName() + ': Nachfassen fehlgeschlagen – ' + e.message);
    }
  }
  return true;
}

// ===================== STORNO =====================
// Wird ein Kundenordner in "… storniert" umbenannt, wandert seine Zeile in den Reiter "Storniert".
// Ordner, die beim ersten Lauf schon "storniert" heißen, werden nur vermerkt (nicht angefasst).
function stornosUebernehmen_(st, probleme) {
  const L = liste_();
  if (!L) return true;
  const ziel = L.sh.getParent().getSheets().find(x => /^storniert/i.test(x.getName()));
  if (!ziel) return true;
  const ersterLauf = !st._stornoBasis; // beim allerersten kompletten Durchgang nur vormerken
  st._storno = st._storno || [];
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const it = DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID).getFolders();
  while (it.hasNext()) {
    if (zeitUeber_()) return false;
    const o = it.next();
    if (o.isTrashed() || !/storniert/i.test(o.getName()) || st._storno.indexOf(o.getId()) >= 0) continue;
    if (ersterLauf) { st._storno.push(o.getId()); continue; }
    try {
      const nn = o.getName().replace(/storniert/ig, ' ').replace(/[()_]/g, ' ').replace(/^\s*\d+\s*-?\s*/, '').replace(/\s+\d{5}.*$/, '').replace(/^[-–\s]+|[-–\s]+$/g, '').trim();
      const plz = (o.getName().match(/\b(\d{5})\b/) || [])[1];
      // passende Zeilen zählen: nur bei genau einer Zeile verschieben
      const d = listeDaten_(L);
      let idx = d.map((r, i) => i).filter(i => norm(d[i][L.sp['Nachname'] - 1]) === norm(nn));
      if (idx.length > 1 && plz && L.sp['PLZ']) idx = idx.filter(i => String(d[i][L.sp['PLZ'] - 1]).trim() === plz);
      st._storno.push(o.getId());
      if (idx.length !== 1) {
        probleme.push('Storno "' + o.getName() + '": ' + (idx.length ? idx.length + ' passende Zeilen' : 'keine passende Zeile') + ' in der Liste – bitte selbst prüfen und ggf. in den Reiter "' + ziel.getName() + '" verschieben.');
        continue;
      }
      const row = L.kopf + 1 + idx[0];
      const breite = L.sh.getLastColumn();
      const zRow = Math.max(ziel.getLastRow(), L.kopf) + 1;
      const quelle = L.sh.getRange(row, 1, 1, breite);
      quelle.copyTo(ziel.getRange(zRow, 1, 1, breite));
      const a = quelle.getDisplayValues()[0], b = ziel.getRange(zRow, 1, 1, breite).getDisplayValues()[0];
      if (a[L.sp['Nachname'] - 1] !== b[L.sp['Nachname'] - 1]) { probleme.push('Storno ' + nn + ': Kopie nicht bestätigt – Zeile bleibt in der Liste.'); continue; }
      if (L.sp['Bemerkung']) { const z = ziel.getRange(zRow, L.sp['Bemerkung']); zelleAnhaengen_(z, 'storniert ' + heute_()); }
      L.sh.deleteRow(row);
      speichereStatus_(st); // sofort merken – nie zweimal verschieben
      listeAktualisiert_(L);
      probleme.push('Storno übernommen: ' + nn + ' – Zeile in den Reiter "' + ziel.getName() + '" verschoben. Bitte in Qonto prüfen, ob noch eine Rechnung oder ein Rechnungsentwurf offen ist.');
    } catch (e) {
      probleme.push('Storno "' + o.getName() + '" fehlgeschlagen – ' + e.message);
    }
  }
  st._stornoBasis = true;
  return true;
}

// ===================== ERINNERUNG: VOLLMACHT NOCH OFFEN =====================
// Einmal täglich ab 8 Uhr: Steht ein Kunde in der Liste seit mindestens 7 Tagen auf "Vollmacht angefragt",
// wird ein freundlicher Erinnerungs-Entwurf (mit der vorbereiteten Vollmacht im Anhang) in Gmail angelegt.
// Abstand zwischen zwei Erinnerungen mind. 7 Tage (auch eigene Vermerke "erinnert 17.08." zählen),
// höchstens VM_ERINNERUNG_MAX automatische Erinnerungen – danach ein Hinweis an dich zum telefonischen Nachfassen.
// Steht in der Bemerkung z. B. "erst ab dem 03.10.26", wird vorher nicht erinnert.
// Ist eine Erinnerung verschickt, wird "erinnert TT.MM.JJ" in der Bemerkung ergänzt.
const VM_ERINNERUNG_TAGE = 7;
const VM_ERINNERUNG_MAX = 3;
const VM_ERINNERUNG_BETREFF = 'Erinnerung: Vollmacht für Ihren BAFA-Förderantrag';

function vollmachtErinnerungen_(st, probleme, sofort) {
  if (!sofort && !tagesAufgabeFaellig_('vm_erinnerung_tag', 8)) return true;
  const L = liste_();
  if (!L || !L.sp['Bearbeitungsstand'] || !L.sp['Nachname']) return true;
  const tag = 864e5, jetzt = Date.now();
  const fmt = d => Utilities.formatDate(d, 'Europe/Berlin', 'dd.MM.yy');
  const datum = t => { const m = String(t || '').match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/); if (!m) return null; let j = m[3] ? +m[3] : new Date().getFullYear(); if (j < 100) j += 2000; return new Date(j, +m[2] - 1, +m[1]); };
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const cE = L.sp['E-Mail'], cB = L.sp['Bemerkung'];
  st._vmErinnertVermerk = st._vmErinnertVermerk || [];
  st._vmErinnerungMax = st._vmErinnerungMax || [];
  const ordner = ordnerListe_();
  const neu = [];
  const daten = listeDaten_(L);
  for (let i = 0; i < daten.length; i++) {
    if (zeitUeber_()) return false; // im nächsten Lauf weiter
    const r = daten[i], row = L.kopf + 1 + i;
    const nn = String(r[L.sp['Nachname'] - 1]).trim();
    if (!nn || normStand_(r[L.sp['Bearbeitungsstand'] - 1]) !== 'vollmacht angefragt') continue;
    const bem = cB ? String(r[cB - 1]) : '';
    if (/vorgang erledigt|storniert/i.test(bem)) continue;
    const email = cE ? String(r[cE - 1]).trim().toLowerCase() : '';
    const vn = L.sp['Vorname'] ? String(r[L.sp['Vorname'] - 1]).trim() : '';
    const plz = L.sp['PLZ'] ? String(r[L.sp['PLZ'] - 1]).trim() : '';
    const schluessel = norm(nn) + '|' + plz;
    try {
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) continue; // ohne E-Mail keine Erinnerung möglich
      // 1) bereits verschickte Erinnerungen → in der Bemerkung vermerken
      const gesendet = GmailApp.search('in:sent to:' + email + ' subject:"' + VM_ERINNERUNG_BETREFF + '"', 0, 10);
      let vermerkNeu = '';
      gesendet.forEach(t => t.getMessages().forEach(m => {
        if (!/energieberatungmuenchen/i.test(m.getFrom()) || m.getSubject().indexOf('Erinnerung') < 0) return;
        if (st._vmErinnertVermerk.indexOf(m.getId()) >= 0) return;
        st._vmErinnertVermerk.push(m.getId());
        vermerkNeu = 'Kunde am ' + fmt(m.getDate()) + ' nochmals erinnert für die Vollmacht';
      }));
      if (vermerkNeu && cB) {
        const z = L.sh.getRange(row, cB), alt = z.getDisplayValue().trim();
        if (alt.indexOf(vermerkNeu) < 0) {
          zelleAnhaengen_(z, vermerkNeu); // Formatierung bleibt
          const rot = rotVermerkRich_(z.getRichTextValue());
          if (rot) z.setRichTextValue(rot);
          listeAktualisiert_(L);
        }
      }
      // 2) Entwurf schon vorhanden? → nichts tun
      if (GmailApp.search('in:drafts to:' + email + ' subject:"' + VM_ERINNERUNG_BETREFF + '"', 0, 1).length) continue;
      // 3) seit wann angefragt? (Mail "benötigte Unterlagen", sonst Spalte "Beiblatt vorhanden"/"Eingang")
      const anfrage = GmailApp.search('in:sent to:' + email + ' subject:"benötigte Unterlagen"', 0, 5);
      let seit = anfrage.length ? Math.min.apply(null, anfrage.map(t => t.getLastMessageDate().getTime())) : null;
      if (!seit) { const d = datum(r[(L.sp['Beiblatt vorhanden'] || L.sp['Eingang']) - 1]); seit = d ? d.getTime() : null; }
      if (!seit || jetzt - seit < VM_ERINNERUNG_TAGE * tag) continue;
      // 4) letzte Erinnerung (gesendet oder eigener Vermerk "erinnert …") mind. 7 Tage her
      const erinnertDaten = (bem.match(/erinnert[^\/]{0,30}?(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)/gi) || [])
        .concat(bem.match(/Kunde am \d{1,2}\.\d{1,2}\.\d{2,4} nochmals erinnert/gi) || [])
        .map(x => datum(x)).filter(Boolean).map(d => d.getTime());
      gesendet.forEach(t => erinnertDaten.push(t.getLastMessageDate().getTime()));
      const letzte = erinnertDaten.length ? Math.max.apply(null, erinnertDaten) : 0;
      const anzahl = new Set(erinnertDaten.map(x => fmt(new Date(x)))).size; // gleicher Tag zählt einmal
      if (letzte && jetzt - letzte < VM_ERINNERUNG_TAGE * tag) continue;
      // 5) "erst ab dem 03.10.26" o. ä. in der Bemerkung respektieren
      const ab = bem.match(/\bab\s+(?:dem\s+)?(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
      if (ab && datum(ab[1]) && datum(ab[1]).getTime() > jetzt) continue;
      // 6) Kunde hat sich in den letzten 3 Tagen gemeldet → noch abwarten
      if (GmailApp.search('from:' + email + ' newer_than:3d', 0, 1).length) continue;
      // 7) Höchstzahl erreicht → einmalig Hinweis an dich
      if (anzahl >= VM_ERINNERUNG_MAX) {
        if (st._vmErinnerungMax.indexOf(schluessel) < 0) {
          st._vmErinnerungMax.push(schluessel);
          probleme.push(nn + (plz ? ' ' + plz : '') + ': Vollmacht trotz ' + anzahl + ' Erinnerungen noch offen – bitte telefonisch nachfassen (keine weitere automatische Erinnerung).');
        }
        continue;
      }
      // Kundenordner (für Anrede und die vorbereitete Vollmacht)
      const o = ordner.find(x => norm(nachnameAusOrdner_(x.getName())) === norm(nn) && (!plz || x.getName().indexOf(plz) >= 0))
        || ordner.find(x => norm(nachnameAusOrdner_(x.getName())) === norm(nn));
      const s = o ? (st[o.getId()] || {}) : {};
      let anrede = s.kunde && s.kunde.anrede, sicher = !!anrede;
      if (!anrede) { const a = anredeErmitteln_(vn.split(/\s+/)[0]); anrede = a.anrede; sicher = a.sicher; }
      const anhang = [];
      if (o) {
        const vm = dateienCache_(o).filter(f => /_beg_formular_beg_vm\.pdf$/i.test(f.getName())).sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
        if (vm) anhang.push(vm.getBlob());
      }
      // noch offene Angaben aus der Bemerkung
      const offen = [];
      if (/steuer[\s-]*id\s*(?:fehlt|ungültig)/i.test(bem)) offen.push('Ihre steuerliche Identifikationsnummer (Steuer-ID, 11-stellig)');
      const fa = (bem.match(/Für Antrag fehlt:\s*([^\/]+)/i) || [])[1];
      const punkte = fa ? fa.split(',').map(x => x.trim()).filter(Boolean) : [];
      (bem.match(/(Geburtsdatum|Baujahr|Wohnungsnummer|Wohneinheiten gesamt|Anzahl Wohneinheiten)\s+(?:fehlt|fehlen|offen)/gi) || [])
        .forEach(x => { const k = x.replace(/\s+(?:fehlt|fehlen|offen)$/i, ''); if (!punkte.some(p => p.toLowerCase() === k.toLowerCase())) punkte.push(k); });
      punkte.forEach(x => offen.push(
        /geburtsdatum/i.test(x) ? 'Ihr Geburtsdatum' : /baujahr/i.test(x) ? 'das Baujahr des Gebäudes' :
        /wohnungsnummer/i.test(x) ? 'die Nummer bzw. Lage Ihrer Wohnung' : /gesamt/i.test(x) ? 'die Gesamtzahl der Wohneinheiten im Gebäude' :
        /wohneinheit/i.test(x) ? 'die Anzahl der Wohneinheiten, in denen die Maßnahme umgesetzt wird' : x));
      if (!/iban/i.test(bem)) offen.push('Ihre IBAN für die spätere Auszahlung des Zuschusses');
      const zeilen = [
        begruessung_(anrede, nn), '',
        'ich hoffe, es geht Ihnen gut!', '',
        'Ich wollte mich kurz bei Ihnen melden, da mir die unterschriebene Vollmacht für Ihren BAFA-Förderantrag noch nicht vorliegt. Sicher ist sie im Alltag einfach etwas untergegangen – das passiert schnell.', '',
        'Damit ich den Antrag zügig für Sie stellen kann und Sie sich Ihren Zuschuss sichern, bitte ich Sie, die Vollmacht auszudrucken, handschriftlich zu unterschreiben und mir eingescannt oder gut lesbar abfotografiert an info@energieberatungmuenchen.com zurückzusenden. ' +
          (anhang.length ? 'Die bereits für Sie vorbereitete Vollmacht finden Sie der Einfachheit halber noch einmal im Anhang.' : 'Die vorbereitete Vollmacht finden Sie in meiner vorherigen E-Mail.')
      ];
      if (offen.length) {
        zeilen.push('', 'Außerdem benötige ich noch ' + (offen.length === 1 ? 'folgende Angabe' : 'folgende Angaben') + ':');
        offen.forEach(x => zeilen.push('   – ' + x));
      }
      zeilen.push('',
        'Wichtig: Bitte beginnen Sie mit der Maßnahme erst, nachdem der Antrag beim BAFA eingereicht ist – nur so bleibt Ihr Förderanspruch erhalten.', '',
        'Sollten Sie Fragen haben oder Unterstützung benötigen, melden Sie sich jederzeit gerne bei mir – per E-Mail oder telefonisch.', '',
        'Ich freue mich auf Ihre Rückmeldung.', '',
        SIGNATUR);
      entwurf_(email, VM_ERINNERUNG_BETREFF + ' – ' + nn, pruefHinweis_(sicher ? anrede : '') + zeilen.join('\n'), anhang.length ? { attachments: anhang } : {});
      neu.push(nn + (vn ? ', ' + vn : '') + ' (angefragt am ' + fmt(new Date(seit)) + (letzte ? ', zuletzt erinnert ' + fmt(new Date(letzte)) : '') + ')');
    } catch (e) {
      probleme.push(nn + ': Vollmacht-Erinnerung fehlgeschlagen – ' + e.message);
    }
  }
  if (st._vmErinnertVermerk.length > 500) st._vmErinnertVermerk = st._vmErinnertVermerk.slice(-500);
  if (neu.length) probleme.push('Erinnerungs-Entwürfe "Vollmacht" in Gmail vorbereitet (bitte prüfen und senden):\n' + neu.map(x => '   • ' + x).join('\n'));
  if (!sofort) tagesAufgabeErledigt_('vm_erinnerung_tag');
  return true;
}

// Bei jedem Lauf (nur eine Gmail-Suche): frisch verschickte Vollmacht-Erinnerungen sofort in der Bemerkung vermerken
function vmErinnerungVermerken_(st, probleme) {
  const L = liste_();
  if (!L || !L.sp['Bemerkung'] || !L.sp['Nachname']) return;
  st._vmErinnertVermerk = st._vmErinnertVermerk || [];
  const threads = GmailApp.search('in:sent subject:"' + VM_ERINNERUNG_BETREFF + '" newer_than:3d', 0, 30);
  if (!threads.length) return;
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  let daten = null;
  threads.forEach(t => t.getMessages().forEach(m => {
    if (!/energieberatungmuenchen/i.test(m.getFrom()) || m.getSubject().indexOf(VM_ERINNERUNG_BETREFF) < 0) return;
    if (st._vmErinnertVermerk.indexOf(m.getId()) >= 0) return;
    const an = ((m.getTo().match(/<([^>]+)>/) || [null, m.getTo()])[1] || '').trim().toLowerCase();
    const nn = (m.getSubject().match(/–\s*(.+)$/) || [])[1] || '';
    daten = daten || listeDaten_(L);
    const cE = L.sp['E-Mail'];
    let treffer = daten.map((r, i) => ({ r, row: L.kopf + 1 + i })).filter(x => String(x.r[L.sp['Nachname'] - 1]).trim() &&
      ((cE && String(x.r[cE - 1]).trim().toLowerCase() === an) || (nn && norm(x.r[L.sp['Nachname'] - 1]) === norm(nn))));
    if (treffer.length > 1) treffer = treffer.filter(x => /vollmacht angefragt/i.test(String(x.r[(L.sp['Bearbeitungsstand'] || 1) - 1])));
    st._vmErinnertVermerk.push(m.getId());
    if (treffer.length !== 1) { probleme.push('Vollmacht-Erinnerung an ' + an + ' verschickt – Zeile in der Liste nicht eindeutig gefunden, bitte Vermerk selbst eintragen.'); return; }
    const vermerk = 'Kunde am ' + Utilities.formatDate(m.getDate(), 'Europe/Berlin', 'dd.MM.yy') + ' nochmals erinnert für die Vollmacht';
    const z = L.sh.getRange(treffer[0].row, L.sp['Bemerkung']), alt = z.getDisplayValue().trim();
    if (alt.indexOf(vermerk) >= 0) return;
    zelleAnhaengen_(z, vermerk); // Formatierung bleibt
    const rot = rotVermerkRich_(z.getRichTextValue());
    if (rot) z.setRichTextValue(rot);
    listeAktualisiert_(L);
    daten = null;
  }));
}

// Vermerk "Kunde am … nochmals erinnert für die Vollmacht" immer in roter Schrift (übrige Formatierung bleibt)
const VM_VERMERK = /Kunde am \d{1,2}\.\d{1,2}\.\d{2,4} nochmals erinnert für die Vollmacht/g;
function rotVermerkRich_(rtv) {
  if (!rtv) return null;
  const text = rtv.getText();
  const treffer = Array.from(text.matchAll(VM_VERMERK));
  if (!treffer.length) return null;
  const istRot = m => { try { const st = rtv.getTextStyle(m.index, m.index + m[0].length); return String(st && st.getForegroundColor() || '').toLowerCase() === '#ff0000'; } catch (e) { return false; } };
  if (treffer.every(istRot)) return null;
  const b = SpreadsheetApp.newRichTextValue().setText(text);
  rtv.getRuns().forEach(r => { if (r.getEndIndex() > r.getStartIndex()) b.setTextStyle(r.getStartIndex(), r.getEndIndex(), r.getTextStyle()); });
  const rot = SpreadsheetApp.newTextStyle().setForegroundColor('#ff0000').build();
  treffer.forEach(m => b.setTextStyle(m.index, m.index + m[0].length, rot));
  return b.build();
}
// Erinnerungs-Vermerk aus einer Bemerkung entfernen (übrige Formatierung, z. B. andere rote Teile, bleibt erhalten)
const VM_VERMERK_RAUS = /(\s*\/\s*)?Kunde am \d{1,2}\.\d{1,2}\.\d{2,4} nochmals erinnert für die Vollmacht(\s*\/\s*)?/g;
function ohneErinnerungsVermerk_(rtv) {
  const text = rtv.getText();
  const weg = [];
  for (const m of text.matchAll(VM_VERMERK_RAUS)) {
    const ende = m[1] && m[2] ? m.index + m[0].length - m[2].length : m.index + m[0].length; // ein " / " bleibt stehen
    weg.push([m.index, ende]);
  }
  if (!weg.length) return null;
  const neuePos = i => { let d = 0; for (const [a, e] of weg) { if (i >= e) d += e - a; else if (i > a) d += i - a; } return i - d; };
  let neu = '', last = 0;
  weg.forEach(([a, e]) => { neu += text.slice(last, a); last = e; });
  neu += text.slice(last);
  const b = SpreadsheetApp.newRichTextValue().setText(neu);
  rtv.getRuns().forEach(r => {
    const a = neuePos(r.getStartIndex()), e = neuePos(r.getEndIndex());
    if (e > a) b.setTextStyle(a, e, r.getTextStyle());
  });
  return b.build();
}
// Bei jedem Lauf: ist die Vollmacht da (Stand nicht mehr "Vollmacht angefragt" oder Datum in "Vollmacht erteilt"),
// wird der Vermerk "Kunde am … nochmals erinnert für die Vollmacht" wieder aus der Bemerkung genommen.
function erinnerungsVermerkeAufraeumen_(L) {
  const cB = L.sp['Bemerkung'], cS = L.sp['Bearbeitungsstand'], cV = L.sp['Vollmacht erteilt'];
  if (!cB || !cS) return false;
  let geaendert = false;
  (L.teile || [L]).forEach(t => {
    const n = t.sh.getLastRow() - t.kopf;
    if (n <= 0) return;
    const d = t.sh.getRange(t.kopf + 1, 1, n, Math.max(cB, cS, cV || 1)).getDisplayValues();
    d.forEach((r, i) => {
      if (!/nochmals erinnert für die Vollmacht/.test(r[cB - 1])) return;
      const da = normStand_(r[cS - 1]) !== 'vollmacht angefragt' || (cV && istDatum_(r[cV - 1]));
      if (!da) return;
      const z = t.sh.getRange(t.kopf + 1 + i, cB);
      const neu = ohneErinnerungsVermerk_(z.getRichTextValue());
      if (neu) { z.setRichTextValue(neu); geaendert = true; }
    });
  });
  return geaendert;
}

// Text in einer Zelle ersetzen bzw. anhängen, ohne die Formatierung (z. B. rote Vermerke) zu verlieren
function richErsetzen_(rtv, a, e, ersatz) {
  const text = rtv.getText();
  const neu = text.slice(0, a) + ersatz + text.slice(e);
  const pos = i => i <= a ? i : (i >= e ? i - (e - a) + ersatz.length : a + ersatz.length);
  const b = SpreadsheetApp.newRichTextValue().setText(neu);
  rtv.getRuns().forEach(r => {
    const s = pos(r.getStartIndex()), t = pos(r.getEndIndex());
    if (t > s) b.setTextStyle(s, t, r.getTextStyle());
  });
  // eingefügter Text bekommt dieselbe Schrift wie der Text davor (bzw. der ersetzte Text) – nie die rote
  // Schrift eines Erinnerungs-Vermerks; dann die Schrift des ersten Textteils der Zelle
  const stil = richNachbarStil_(rtv, a, e);
  if (ersatz.length && stil) b.setTextStyle(a, a + ersatz.length, stil);
  return b.build();
}
function richNachbarStil_(rtv, a, e) {
  const text = rtv.getText(), runs = rtv.getRuns();
  const istVermerk = r => /nochmals erinnert|Kunde am \d/.test(text.slice(r.getStartIndex(), r.getEndIndex()));
  const kand = (e > a ? runs.filter(r => r.getStartIndex() <= a && r.getEndIndex() > a) : [])
    .concat(runs.filter(r => r.getStartIndex() < a && r.getEndIndex() >= a))
    .filter(r => !istVermerk(r) && text.slice(r.getStartIndex(), r.getEndIndex()).trim());
  if (kand.length) return kand[0].getTextStyle();
  const erst = runs.find(r => !istVermerk(r) && text.slice(r.getStartIndex(), r.getEndIndex()).trim());
  return erst ? erst.getTextStyle() : null;
}
// Einmalig: "SteuerID: …", das am 04.10. schwarz statt in der Schrift der übrigen Bemerkung angehängt wurde (Memmler), angleichen
function steuerIdFarbeAngleichen_(st) {
  if ((st._sidFarbeV || 0) >= 2) return;
  const L = liste_();
  if (!L || !L.sp['Bemerkung']) return;
  (L.teile || [L]).forEach(t => {
    const n = t.sh.getLastRow() - t.kopf;
    if (n <= 0) return;
    const rg = t.sh.getRange(t.kopf + 1, L.sp['Bemerkung'], n, 1);
    const zellFarben = rg.getFontColors();
    rg.getRichTextValues().forEach((r, i) => {
      const v = r[0];
      if (!v) return;
      const text = v.getText();
      const m = text.match(/ \/ SteuerID: \d{11}$/);
      if (!m) return;
      const a = m.index;
      const seg = v.getRuns().find(x => x.getStartIndex() <= a + 3 && x.getEndIndex() >= text.length);
      const vor = richNachbarStil_(v, a, a);
      if (!seg) return;
      const fSeg = String(seg.getTextStyle().getForegroundColor() || '').toLowerCase();
      const fVor = String((vor && vor.getForegroundColor()) || zellFarben[i][0] || '').toLowerCase();
      if (fSeg !== '#000000' || !fVor || fVor === '#000000') return;
      const stil = vor && vor.getForegroundColor() ? vor : SpreadsheetApp.newTextStyle().setForegroundColor(fVor).build();
      const b = v.copy().setTextStyle(a, text.length, stil).build();
      t.sh.getRange(t.kopf + 1 + i, L.sp['Bemerkung']).setRichTextValue(b);
    });
  });
  st._sidFarbeV = 2;
}

// Bei jedem Lauf: Steht im Beiblatt eine gültige Steuer-ID, in der Liste aber keine (z. B. weil die Zeile von Hand
// angelegt wurde, wie bei Memmler), wird sie in die Bemerkung übernommen ("SteuerID: …"). Eine abweichende gültige
// Steuer-ID in der Liste wird nie überschrieben, nur gemeldet.
// ===================== ANDERER INVESTITIONSSTANDORT =====================
// Bei jedem Lauf: Weicht im Beiblatt der Investitionsstandort vom Wohnort ab, muss in der Bemerkung
// "ANDERER INVESTITIONSSTANDORT!!! <Adresse>" (rot) stehen. Fehlt das, wird es vorne ergänzt – der übrige Text bleibt.
function investVermerkPruefen_(st, probleme) {
  const L = liste_();
  if (!L || !L.sp['Bemerkung']) return;
  const heute = heute_();
  const memo = st._invGeprueft = st._invGeprueft || {};
  if (st._invTag !== heute) Object.keys(memo).forEach(k => { if (memo[k] === 'warten') delete memo[k]; });
  const normN = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const rot = SpreadsheetApp.newTextStyle().setForegroundColor('#ff0000').build();
  // Einmalig: Memmler – die Bemerkung wurde am 04.10. versehentlich bis auf die Steuer-ID geleert → wiederherstellen
  if ((st._memmlerFixV || 0) < 1) {
    try {
      const row = listeZeile_(L, 'Memmler', 'Harald');
      if (row > 0) {
        const z = L.sh.getRange(row, L.sp['Bemerkung']);
        if (z.getDisplayValue().trim() === 'SteuerID: 62470938658') {
          const text = 'ANDERER INVESTITIONSSTANDORT!!! Maiglöckchenweg 1B, 85521 Riemerling / SteuerID: 62470938658';
          z.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(text).setTextStyle(0, text.length, rot).build());
          z.setFontColor('#ff0000');
          listeAktualisiert_(L);
          probleme.push('Memmler: Bemerkung wiederhergestellt – "ANDERER INVESTITIONSSTANDORT!!! Maiglöckchenweg 1B, 85521 Riemerling / SteuerID: 62470938658".');
        }
      }
    } catch (e) { probleme.push('Memmler: Bemerkung konnte nicht wiederhergestellt werden – ' + e.message); }
    st._memmlerFixV = 1;
  }
  let gelesen = 0, n = 0;
  for (const o of ordnerListe_()) {
    if (zeitUeber_() || n >= 15) break;
    const id = o.getId();
    if (memo[id]) continue;
    const s = st[id] || {};
    let bb = s.bb;
    if (!bb) {
      if (gelesen >= 10) continue;
      gelesen++;
      const datei = alleDateien_(o).filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()) && f.getMimeType() === MimeType.PDF)
        .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
      if (!datei) { memo[id] = 'warten'; continue; }
      try { bb = leseFormularfelder_(datei.getBlob().getBytes(), pako_()); } catch (e) { memo[id] = 'warten'; continue; }
    }
    const w = k => String((bb && bb[k]) || '').replace(/\s+/g, ' ').trim();
    const inv = { s: w('Straße Hausnr Investitionsort  wie oben  Wohnort'), p: w('PLZ'), o: w('Ort') };
    const wohn = { s: w('Straße Hausnr Wohnort'), p: w('PLZ_2'), o: w('Ort_2') };
    const abweichend = !!inv.s && !!wohn.s && (normStrasse_(inv.s) !== normStrasse_(wohn.s) || (!!inv.p && !!wohn.p && inv.p !== wohn.p));
    if (!abweichend) { memo[id] = 'gleich'; continue; }
    const nn = (s.kunde && s.kunde.nachname) || nachnameAusOrdner_(o.getName());
    let vn = (s.kunde && s.kunde.vorname) || '';
    if (!vn) {
      const teile = w('Vorname Nachname').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      const rest = teile.filter(t => normN(t) !== normN(nn));
      if (rest.length && rest.length < teile.length) vn = rest[0];
    }
    const row = listenZeileFuerOrdner_(L, o, { nachname: nn, vorname: vn });
    if (row < 0) { memo[id] = 'warten'; continue; }
    n++;
    const z = L.sh.getRange(row, L.sp['Bemerkung']);
    const bem = z.getDisplayValue();
    if (/investitionsstandort/i.test(bem) || /vorgang erledigt/i.test(bem)) { memo[id] = 'ok'; continue; }
    const vermerk = 'ANDERER INVESTITIONSSTANDORT!!! ' + inv.s + ', ' + (inv.p + ' ' + inv.o).trim();
    const vorne = vermerk + (bem.trim() ? ' / ' : '');
    try {
      bemerkungSicherSchreiben_(z, bem, vorne + bem, rtv => {
        const b = richErsetzen_(rtv, 0, 0, vorne);
        return b.copy().setTextStyle(0, vermerk.length, rot).build();
      });
      // falls ohne Einzelformatierung geschrieben: Vermerk trotzdem rot
      try { const r2 = z.getRichTextValue(); if (r2 && r2.getText().indexOf(vermerk) === 0) z.setRichTextValue(r2.copy().setTextStyle(0, vermerk.length, rot).build()); } catch (e) {}
      memo[id] = 'ergänzt';
      listeAktualisiert_(L);
      probleme.push(o.getName() + ': In der Bemerkung fehlte der Hinweis auf den anderen Investitionsstandort – ergänzt: "' + vermerk + '".');
    } catch (e) { memo[id] = 'warten'; probleme.push(o.getName() + ': Hinweis "' + vermerk + '" bitte selbst in die Bemerkung eintragen (' + e.message + ').'); }
  }
  st._invTag = heute;
}

// Bemerkung sicher ändern: Die Formatierung (Rich Text) wird nur benutzt, wenn ihr Text genau dem angezeigten Text
// entspricht – sonst wird der Text ohne Einzelformatierung geschrieben (die Zellfarbe bleibt). Danach wird geprüft,
// dass nichts verloren ging; wenn doch, wird der alte Text wiederhergestellt. So kann nie wieder Text verschwinden.
function bemerkungSicherSchreiben_(z, alt, erwartet, richBauen) {
  const norm = x => String(x || '').replace(/\s+/g, ' ').trim();
  let rtv = null;
  try { rtv = z.getRichTextValue(); } catch (e) {}
  let ok = false;
  if (rtv && norm(rtv.getText()) === norm(alt)) {
    try { const neu = richBauen(rtv); if (neu && norm(neu.getText()) === norm(erwartet)) { z.setRichTextValue(neu); ok = true; } } catch (e) {}
  }
  if (!ok) z.setValue(erwartet);
  SpreadsheetApp.flush();
  if (norm(z.getDisplayValue()) !== norm(erwartet)) { z.setValue(alt); throw new Error('Bemerkung konnte nicht sicher geändert werden – alter Text bleibt'); }
}

function steuerIdAusBeiblattInListe_(st, probleme) {
  const L = liste_();
  if (!L || !L.sp['Bemerkung']) return;
  let n = 0, gelesen = 0;
  const heute = heute_();
  const normN = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  if (st._sidListeTag !== heute) { // einmal am Tag: Wartende neu prüfen
    const m = st._sidListe || {}; Object.keys(m).forEach(k => { if (m[k] === 'warten') delete m[k]; });
  }
  for (const o of ordnerListe_()) {
    if (zeitUeber_() || n >= 15) break;
    const s = st[o.getId()] || {};
    const id = o.getId(), memo = st._sidListe = st._sidListe || {};
    if (memo[id] && (memo[id] !== 'warten' || st._sidListeTag === heute)) continue;
    // Beiblatt-Angaben: aus dem Status – oder, wenn die Vollmacht von Hand vorbereitet wurde (z. B. Memmler), direkt aus dem Beiblatt
    let bb = s.bb;
    if (!bb) {
      if (gelesen >= 6) continue; // Rest im nächsten Lauf
      gelesen++;
      const datei = alleDateien_(o).filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()) && f.getMimeType() === MimeType.PDF)
        .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
      if (!datei) { memo[id] = 'warten'; continue; }
      try { bb = leseFormularfelder_(datei.getBlob().getBytes(), pako_()); } catch (e) { memo[id] = 'warten'; continue; }
    }
    const sid = String((bb && bb['SteuerID 11stellig']) || '').replace(/\D/g, '');
    if (sid.length !== 11 || !steuerIdGueltig_(sid)) { memo[id] = 'keine'; continue; }
    const nn = (s.kunde && s.kunde.nachname) || nachnameAusOrdner_(o.getName());
    let vn = (s.kunde && s.kunde.vorname) || '';
    if (!vn) {
      const teile = String(bb['Vorname Nachname'] || '').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      const rest = teile.filter(t => normN(t) !== normN(nn));
      if (rest.length && rest.length < teile.length) vn = rest[0];
    }
    const row = listenZeileFuerOrdner_(L, o, { nachname: nn, vorname: vn });
    if (row < 0) { memo[id] = 'warten'; continue; } // (noch) nicht in der Liste – morgen nochmal
    n++;
    const z = L.sh.getRange(row, L.sp['Bemerkung']);
    const bem = z.getDisplayValue();
    if (/vorgang erledigt/i.test(bem)) { memo[id] = 'erledigt'; continue; }
    const vorhanden = (bem.match(/\d[\d \/]{9,16}\d/g) || []).map(x => x.replace(/\D/g, '')).filter(x => x.length === 11 && steuerIdGueltig_(x));
    if (vorhanden.indexOf(sid) >= 0) { memo[id] = sid; continue; }
    if (vorhanden.length) {
      memo[id] = sid;
      probleme.push(o.getName() + ': Im Beiblatt steht die Steuer-ID ' + sid + ', in der Liste ' + vorhanden[0] + ' – bitte prüfen (Liste nicht geändert).');
      continue;
    }
    const m = bem.match(/steuer[\s-]*id\s*(?:fehlt|ungültig[^\/]*?)(?=\s*\/|\s*$)/i);
    const erwartet = m ? bem.slice(0, m.index) + 'SteuerID: ' + sid + bem.slice(m.index + m[0].length)
                       : bem + (bem.trim() ? ' / ' : '') + 'SteuerID: ' + sid;
    try {
      bemerkungSicherSchreiben_(z, bem, erwartet, rtv => m ? richErsetzen_(rtv, m.index, m.index + m[0].length, 'SteuerID: ' + sid)
                                                           : richErsetzen_(rtv, rtv.getText().length, rtv.getText().length, (bem.trim() ? ' / ' : '') + 'SteuerID: ' + sid));
    } catch (e) { memo[id] = 'warten'; probleme.push(o.getName() + ': Steuer-ID ' + sid + ' bitte selbst in die Bemerkung eintragen (' + e.message + ').'); continue; }
    if (s.kunde && !s.kunde.steuerId) s.kunde.steuerId = sid;
    memo[id] = sid;
    listeAktualisiert_(L);
    probleme.push(o.getName() + ': Steuer-ID ' + sid + ' aus dem Beiblatt in die Kundenliste (Bemerkung) übernommen.');
  }
  st._sidListeTag = heute;
}

// Bei jedem Lauf: rote Schrift der Erinnerungs-Vermerke wiederherstellen (falls die Bemerkung inzwischen geändert wurde)
function rotVermerkePruefen_(L) {
  const cB = L.sp['Bemerkung'];
  if (!cB) return false;
  let geaendert = false;
  (L.teile || [L]).forEach(t => {
    const n = t.sh.getLastRow() - t.kopf;
    if (n <= 0) return;
    const rg = t.sh.getRange(t.kopf + 1, cB, n, 1);
    const txt = rg.getDisplayValues();
    if (!txt.some(r => /nochmals erinnert für die Vollmacht/.test(r[0]))) return;
    rg.getRichTextValues().forEach((r, i) => {
      if (!/nochmals erinnert für die Vollmacht/.test(txt[i][0]) || /vorgang erledigt/i.test(txt[i][0])) return;
      const neu = rotVermerkRich_(r[0]);
      if (neu) { t.sh.getRange(t.kopf + 1 + i, cB).setRichTextValue(neu); geaendert = true; }
    });
  });
  return geaendert;
}

// Von Hand ausführbar: Vollmacht-Erinnerungen sofort prüfen (Protokoll zeigt das Ergebnis)
function vollmachtErinnerungenJetzt() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { Logger.log('Gerade läuft die Automatik – bitte in 2 Minuten nochmal ausführen.'); return; }
  try {
    const st = ladeStatus_(), probleme = [];
    vollmachtErinnerungen_(st, probleme, true);
    speichereStatus_(st);
    Logger.log(probleme.length ? probleme.join('\n') : 'Keine Erinnerung fällig.');
    if (probleme.length) meldeProbleme_(probleme);
  } finally { lock.releaseLock(); }
}

// ===================== ABSCHLUSS + ARCHIV =====================
// Festsetzungsbescheid-Mail seit 14 Tagen verschickt + Honorar bezahlt → Zeile mit "VORGANG ERLEDIGT" markieren,
// in den Reiter "Erledigte Vorgänge …" kopieren (wie bisher) und den Kundenordner nach "0_Archiv" verschieben.
const ERLEDIGT_AUS_LISTE_ENTFERNEN = false; // true = Zeile nach dem Kopieren aus "Aufträge" entfernen

// Sobald die Mail mit dem Festsetzungsbescheid an den Kunden verschickt ist (Betreff enthält "Festsetzungsbescheid"),
// wird seine Zeile in der Kundenliste wie die übrigen erledigten Vorgänge grün hinterlegt und in der Bemerkung
// "VORGANG ERLEDIGT" vorangestellt. Die Farbe wird von einer bereits erledigten Zeile übernommen.
const ERLEDIGT_FARBE_ERSATZ = '#93c47d';
function erledigtMarkieren_(st, probleme) {
  const L = liste_();
  if (!L || !L.sp['Nachname'] || !L.sp['Bemerkung']) return;
  let daten = null, vorlage = null;
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  // "VORGANG ERLEDIGT" steht immer in schwarzer Schrift (auch bei schon markierten Zeilen nachziehen)
  try {
    const n = L.sh.getLastRow() - L.kopf;
    if (n > 0) {
      const ber = L.sh.getRange(L.kopf + 1, L.sp['Bemerkung'], n, 1);
      const txt = ber.getDisplayValues(), fc = ber.getFontColors();
      let geaendert = false;
      txt.forEach((t, i) => { if (/vorgang erledigt/i.test(t[0]) && !/^#0{6}$/i.test(fc[i][0])) { fc[i][0] = '#000000'; geaendert = true; } });
      if (geaendert) ber.setFontColors(fc);
    }
  } catch (e) {}
  for (const o of ordnerListe_()) {
    if (zeitUeber_()) return;
    const s = st[o.getId()];
    if (!s || s.erledigtMarkiert || s.archiviert) continue;
    if (!dateienCache_(o).some(f => /festsetzungsbescheid/i.test(f.getName()))) continue;
    const k = kundeAusOrdner_(o, s);
    if (!k.email) continue;
    const gesendet = GmailApp.search('in:sent to:' + k.email + ' subject:Festsetzungsbescheid', 0, 1);
    if (!gesendet.length) continue;

    // Zeile bestimmen: gleicher Nachname (+ PLZ), bereits erledigte Zeilen desselben Kunden zählen nicht
    daten = daten || listeDaten_(L);
    const plz = (o.getName().match(/\b(\d{5})\b/) || [])[1];
    let kand = daten.map((r, i) => ({ r, row: L.kopf + 1 + i })).filter(x => norm(x.r[L.sp['Nachname'] - 1]) === norm(k.nachname));
    if (kand.length > 1 && plz && L.sp['PLZ']) kand = kand.filter(x => String(x.r[L.sp['PLZ'] - 1]).trim() === plz);
    const offen = kand.filter(x => !/vorgang erledigt/i.test(String(x.r[L.sp['Bemerkung'] - 1])));
    if (!kand.length) { s.erledigtMarkiert = true; probleme.push(o.getName() + ': Festsetzungsbescheid verschickt, aber keine Zeile "' + k.nachname + '" in der Liste gefunden – bitte von Hand grün markieren und "VORGANG ERLEDIGT" eintragen.'); continue; }
    if (!offen.length) { s.erledigtMarkiert = true; continue; } // schon erledigt markiert
    if (offen.length > 1) {
      s.erledigtMarkiert = true;
      probleme.push(o.getName() + ': Festsetzungsbescheid verschickt, aber ' + offen.length + ' offene Zeilen für ' + k.nachname + ' in der Liste – bitte die richtige von Hand grün markieren und "VORGANG ERLEDIGT" eintragen.');
      continue;
    }
    const row = offen[0].row, breite = L.sh.getLastColumn();
    // Farbe von einer schon erledigten Zeile übernehmen (gleiche Optik wie bisher)
    if (!vorlage) {
      const ref = daten.map((r, i) => ({ r, row: L.kopf + 1 + i })).filter(x => /vorgang erledigt/i.test(String(x.r[L.sp['Bemerkung'] - 1]))).pop();
      vorlage = ref ? L.sh.getRange(ref.row, 1, 1, breite).getBackgrounds()[0] : null;
    }
    const farben = vorlage ? vorlage.map(c => (!c || /^#?ffffff$/i.test(c)) ? ERLEDIGT_FARBE_ERSATZ : c) : new Array(breite).fill(ERLEDIGT_FARBE_ERSATZ);
    L.sh.getRange(row, 1, 1, breite).setBackgrounds([farben]);
    const z = L.sh.getRange(row, L.sp['Bemerkung']);
    const alt = z.getDisplayValue().trim();
    z.setValue('VORGANG ERLEDIGT' + (alt ? ' / ' + alt : '')).setFontColor('#000000');
    if (L.sp['Bearbeitungsstand']) {
      const b = L.sh.getRange(row, L.sp['Bearbeitungsstand']);
      if (!/festsetzung/i.test(b.getDisplayValue())) b.setValue('Festsetzungsbescheid erhalten.');
    }
    listeAktualisiert_(L);
    s.erledigtMarkiert = true;
    daten = null;
    probleme.push('Vorgang erledigt (grün markiert): ' + k.nachname + ' – Festsetzungsbescheid am ' +
      Utilities.formatDate(gesendet[0].getLastMessageDate(), 'Europe/Berlin', 'dd.MM.yy') + ' verschickt.');
  }
}

function erledigteArchivieren_(st, probleme) {
  const L = liste_();
  const ziel = L ? L.sh.getParent().getSheets().filter(x => /^erledigte\s+vorg/i.test(x.getName())).pop() : null;
  const root = DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID);
  let archiv = null;
  const ait = root.getFolders();
  while (ait.hasNext()) { const f = ait.next(); if (!f.isTrashed() && /^0_?\s*archiv/i.test(f.getName())) { archiv = f; break; } }
  let n = 0;
  for (const o of ordnerListe_()) {
    if (zeitUeber_()) return false;
    if (n >= 10) break;
    const s = st[o.getId()];
    if (!s || s.archiviert) continue;
    try {
      if (!dateienCache_(o).some(f => /festsetzungsbescheid/i.test(f.getName()))) continue;
      const k = kundeAusOrdner_(o, s);
      if (!k.email) continue;
      if (!GmailApp.search('in:sent to:' + k.email + ' subject:Festsetzungsbescheid older_than:14d', 0, 1).length) continue;
      const row = L ? listenZeileFuerOrdner_(L, o, k) : -1;
      if (row > 0 && L.sp['Bezahlung'] && !istDatum_(L.sh.getRange(row, L.sp['Bezahlung']).getDisplayValue())) continue; // Honorar noch offen
      if (row > 0) {
        if (L.sp['Bemerkung']) {
          const z = L.sh.getRange(row, L.sp['Bemerkung']);
          if (!/vorgang erledigt/i.test(z.getDisplayValue())) z.setValue('VORGANG ERLEDIGT' + (z.getDisplayValue() ? ' / ' + z.getDisplayValue() : ''));
          z.setFontColor('#000000');
        }
        if (ziel) {
          const breite = L.sh.getLastColumn();
          const id = L.sh.getRange(row, 1).getDisplayValue().trim(), nn = k.nachname.toLowerCase();
          const vorhanden = ziel.getLastRow() > 0 && ziel.getRange(1, 1, ziel.getLastRow(), Math.max(4, L.sp['Nachname'])).getDisplayValues()
            .some(r => r[0].trim() === id && String(r[L.sp['Nachname'] - 1]).trim().toLowerCase() === nn);
          if (!vorhanden) L.sh.getRange(row, 1, 1, breite).copyTo(ziel.getRange(ziel.getLastRow() + 1, 1, 1, breite));
        }
        if (ERLEDIGT_AUS_LISTE_ENTFERNEN) L.sh.deleteRow(row);
        listeAktualisiert_(L);
      }
      if (archiv) {
        try { o.moveTo(archiv); _ordnerListeCache = null; }
        catch (e) { probleme.push(o.getName() + ': konnte nicht nach "' + archiv.getName() + '" verschoben werden (' + e.message + ') – bitte von Hand verschieben.'); }
      }
      s.archiviert = true; n++;
      probleme.push('Vorgang abgeschlossen + archiviert: ' + o.getName());
    } catch (e) {
      probleme.push(o.getName() + ': Archivieren fehlgeschlagen – ' + e.message);
    }
  }
  return true;
}

// ===================== HILFSFUNKTIONEN =====================
function pdfLib_() {
  if (typeof PDFLib === 'undefined') {
    // Polyfills, die pdf-lib in Apps Script braucht
    globalThis.setTimeout = globalThis.setTimeout || function (f) { f(); return 0; };
    globalThis.clearTimeout = globalThis.clearTimeout || function () {};
    (0, eval)(UrlFetchApp.fetch(CFG.PDF_LIB_URL).getContentText()); // global laden
  }
  return globalThis.PDFLib;
}

// Liest die AKTUELLEN Formularfelder aus PDF-Bytes.
// Folgt der Querverweistabelle (xref) wie ein PDF-Programm: neueste Fassung jedes Objekts gewinnt,
// auch bei mehrfach gespeicherten Dateien (Vorschau/FillSign), xref-Streams und Objekt-Streams.
// Bei Kästchen zählt der sichtbare Zustand (/AS). Rückgabe: {Feldname: Wert}, Kästchen als '/Ja' bzw. '/Off'.
const LESER_VERSION = 3; // bei Verbesserungen am Beiblatt-Leser erhöhen → nicht lesbare Beiblätter werden neu versucht
function leseFormularfelder_(rohBytes, pako, info) { // info (optional): bekommt Objekt-Nummern/-Texte zum Nachtragen
  const B = Uint8Array.from(rohBytes, b => b & 255);
  let S = '';
  for (let i = 0; i < B.length; i += 8192) S += String.fromCharCode.apply(null, Array.from(B.subarray(i, i + 8192)));
  const zuText = u8 => { let t = ''; for (let i = 0; i < u8.length; i += 8192) t += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192))); return t; };

  // ---------- Querverweise lesen ----------
  const eintraege = {}; // num -> {typ:1, off} | {typ:2, stm, idx} | {typ:0}
  let rootNum = null; // Katalog aus dem neuesten Trailer
  const setze = (num, e) => { if (!(num in eintraege)) eintraege[num] = e; };
  const zahlNach = (txt, key) => { const m = txt.match(new RegExp('/' + key + '\\s+(\\d+)')); return m ? +m[1] : null; };

  function streamDaten(off) {
    // off zeigt auf "n g obj"; liefert {dict, daten(Uint8Array)}
    const kopfEnde = S.indexOf('stream', off);
    const dict = S.substring(off, kopfEnde);
    let start = kopfEnde + 6;
    if (S[start] === '\r') start++;
    if (S[start] === '\n') start++;
    let len = null;
    const lm = dict.match(/\/Length\s+(\d+)(\s+(\d+)\s+R)?/);
    if (lm && !lm[2]) len = +lm[1];
    else if (lm && lm[2]) { const r = objektText(+lm[1]); if (r) len = parseInt(r.trim(), 10); }
    if (!len || isNaN(len)) len = S.indexOf('endstream', start) - start;
    let daten = B.subarray(start, start + len);
    if (/\/FlateDecode/.test(dict)) daten = entpacke(daten);
    return { dict, daten };
  }

  // Entpacken – auch wenn ein Programm (z. B. Adobe Fill&Sign) den Datenstrom minimal zu kurz gespeichert hat:
  // dann alles nehmen, was sich entpacken lässt (so machen es auch Acrobat und Vorschau).
  function entpacke(d) {
    let r;
    try { r = pako.inflate(d); } catch (e) {}
    if (r && r.length) return r;
    if (!pako.Inflate) return r || new Uint8Array(0);
    const inf = new pako.Inflate();
    try { inf.push(d, false); } catch (e) {}
    const teile = (inf.chunks || []).concat([inf.strm.output ? inf.strm.output.subarray(0, inf.strm.next_out) : new Uint8Array(0)]);
    const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
    let p = 0; teile.forEach(t => { out.set(t, p); p += t.length; });
    return out;
  }

  function pngPraediktor(daten, spalten) {
    const zeile = spalten + 1, out = new Uint8Array((daten.length / zeile | 0) * spalten);
    let vor = new Uint8Array(spalten);
    for (let r = 0; r * zeile < daten.length; r++) {
      const typ = daten[r * zeile], akt = new Uint8Array(spalten);
      for (let c = 0; c < spalten; c++) {
        const x = daten[r * zeile + 1 + c], a = c > 0 ? akt[c - 1] : 0, b = vor[c], cc = c > 0 ? vor[c - 1] : 0;
        let v = x;
        if (typ === 1) v = x + a; else if (typ === 2) v = x + b; else if (typ === 3) v = x + ((a + b) >> 1);
        else if (typ === 4) { const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc); }
        akt[c] = v & 255;
      }
      out.set(akt, r * spalten); vor = akt;
    }
    return out;
  }

  function xrefStream(off) {
    const { dict, daten: roh } = streamDaten(off);
    const w = dict.match(/\/W\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]/).slice(1).map(Number);
    const breite = w[0] + w[1] + w[2];
    const pr = zahlNach(dict, 'Predictor');
    const daten = pr && pr >= 10 ? pngPraediktor(roh, zahlNach(dict, 'Columns') || breite) : roh;
    let index = [0, zahlNach(dict, 'Size')];
    const im = dict.match(/\/Index\s*\[([\d\s]+)\]/);
    if (im) index = im[1].trim().split(/\s+/).map(Number);
    const feld = (p, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + daten[p + i]; return v; };
    let p = 0;
    for (let k = 0; k < index.length; k += 2) {
      for (let j = 0; j < index[k + 1]; j++, p += breite) {
        const typ = w[0] ? feld(p, w[0]) : 1, f2 = feld(p + w[0], w[1]), f3 = feld(p + w[0] + w[1], w[2]);
        const num = index[k] + j;
        if (typ === 1) setze(num, { typ: 1, off: f2 }); else if (typ === 2) setze(num, { typ: 2, stm: f2, idx: f3 }); else setze(num, { typ: 0 });
      }
    }
    return dict;
  }

  function xrefKette(off, gesehen) {
    if (off == null || gesehen[off]) return;
    gesehen[off] = 1;
    let p = off;
    while (/\s/.test(S[p])) p++;
    if (S.substr(p, 4) === 'xref') {
      let q = p + 4;
      const trailer = S.indexOf('trailer', q);
      const block = S.substring(q, trailer).trim().split(/\r?\n|\r/);
      let i = 0;
      while (i < block.length) {
        const kopf = block[i].trim().split(/\s+/);
        if (kopf.length !== 2) { i++; continue; }
        const start = +kopf[0], anz = +kopf[1];
        for (let j = 0; j < anz; j++) {
          const z = (block[i + 1 + j] || '').trim().split(/\s+/);
          if (z[2] === 'n') setze(start + j, { typ: 1, off: +z[0] }); else setze(start + j, { typ: 0 });
        }
        i += anz + 1;
      }
      const tr = S.substring(trailer, S.indexOf('>>', S.indexOf('<<', trailer) + 2) + 200);
      if (rootNum == null) rootNum = zahlNach(tr, 'Root');
      const xs = zahlNach(tr, 'XRefStm');
      if (xs != null) xrefKette(xs, gesehen);
      xrefKette(zahlNach(tr, 'Prev'), gesehen);
    } else {
      const dict = xrefStream(p);
      if (rootNum == null) rootNum = zahlNach(dict, 'Root');
      xrefKette(zahlNach(dict, 'Prev'), gesehen);
    }
  }

  const objStms = {};
  function objektText(num) {
    const e = eintraege[num];
    if (!e || e.typ === 0) return null;
    if (e.typ === 1) {
      const m = S.substr(e.off, 40).match(/^\s*\d+\s+\d+\s+obj/);
      if (!m) return null;
      const start = e.off + m[0].length;
      const ende = S.indexOf('endobj', start);
      let t = S.substring(start, ende);
      const st = t.indexOf('stream');
      return st >= 0 ? t.substring(0, st) : t;
    }
    if (!objStms[e.stm]) {
      const s = eintraege[e.stm];
      const { dict, daten } = streamDaten(s.off);
      const t = zuText(daten), n = zahlNach(dict, 'N'), first = zahlNach(dict, 'First');
      const kopf = t.substring(0, first).trim().split(/\s+/).map(Number);
      const teile = [];
      for (let k = 0; k < n; k++) teile.push(t.substring(first + kopf[2 * k + 1], k + 1 < n ? first + kopf[2 * k + 3] : t.length));
      objStms[e.stm] = teile;
    }
    return objStms[e.stm][e.idx];
  }

  // ---------- Strings dekodieren ----------
  const bytesZuText = b => {
    if (b[0] === 0xFE && b[1] === 0xFF) { let r = ''; for (let i = 2; i + 1 < b.length; i += 2) r += String.fromCharCode((b[i] << 8) | b[i + 1]); return r; }
    return b.map(x => String.fromCharCode(x)).join('');
  };
  const dekodiere = lit => {
    if (lit == null) return '';
    if (lit[0] === '<') {
      const h = lit.slice(1, -1).replace(/\s/g, ''); const b = [];
      for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
      return bytesZuText(b);
    }
    const inner = lit.slice(1, -1), b = [];
    const map = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
    for (let j = 0; j < inner.length; j++) {
      const c = inner[j];
      if (c !== '\\') { b.push(inner.charCodeAt(j) & 255); continue; }
      const d = inner[++j];
      if (d in map) b.push(map[d]);
      else if (/[0-7]/.test(d)) { let o = d; while (o.length < 3 && /[0-7]/.test(inner[j + 1])) o += inner[++j]; b.push(parseInt(o, 8)); }
      else if (d === '\r' || d === '\n') { if (d === '\r' && inner[j + 1] === '\n') j++; }
      else b.push(inner.charCodeAt(j) & 255);
    }
    return bytesZuText(b);
  };
  const holeString = (body, key) => {
    const i = body.search(new RegExp('/' + key + '\\s*[(<](?!<)'));
    if (i < 0) return null;
    const j = i + body.substr(i).search(/[(<]/);
    if (body[j] === '<') return body.substring(j, body.indexOf('>', j) + 1);
    let tiefe = 0, k = j;
    for (; k < body.length; k++) {
      if (body[k] === '\\') { k++; continue; }
      if (body[k] === '(') tiefe++; else if (body[k] === ')') { tiefe--; if (tiefe === 0) break; }
    }
    return body.substring(j, k + 1);
  };
  const holeName = (body, key) => { const m = body.match(new RegExp('/' + key + '\\s*/([^\\s/>\\]\\[()<]+)')); return m ? '/' + m[1] : ''; };

  // ---------- Felder auswerten ----------
  try {
    const sx = S.lastIndexOf('startxref');
    xrefKette(parseInt(S.substr(sx + 9, 30).trim(), 10), {});
  } catch (e) { /* unten Notfall */ }
  const out = {};
  const nums = Object.keys(eintraege);
  if (!nums.length) return out;
  // Felder, die im Formular (Katalog → AcroForm → Fields/Kids) wirklich verzeichnet sind. Manche Programme
  // hinterlassen verwaiste Kopien mit gleichem Namen – bei Namensgleichheit gewinnt das verzeichnete Feld.
  const verzeichnet = {};
  try {
    const rt = objektText(rootNum) || '';
    let af = rt.match(/\/AcroForm\s+(\d+)\s+\d+\s+R/);
    af = af ? (objektText(+af[1]) || '') : rt.substring(rt.indexOf('/AcroForm'));
    const refs = t => ((t.match(/\/(?:Fields|Kids)\s*\[([^\]]*)\]/) || [])[1] || '').match(/\d+\s+\d+\s+R/g) || [];
    const offen = refs(af).map(r => +r.split(/\s+/)[0]);
    while (offen.length && Object.keys(verzeichnet).length < 5000) {
      const n = offen.shift();
      if (verzeichnet[n]) continue;
      verzeichnet[n] = 1;
      refs(objektText(n) || '').forEach(r => offen.push(+r.split(/\s+/)[0]));
    }
  } catch (e) {}
  const ausFormular = {};
  nums.forEach(num => {
    let b;
    try { b = objektText(+num); } catch (e) { return; }
    if (!b || !/\/T\s*[(<]/.test(b)) return;
    const name = dekodiere(holeString(b, 'T'));
    let v = '';
    const vs = holeString(b, 'V');
    if (vs) v = dekodiere(vs); else v = holeName(b, 'V');
    if (/\/FT\s*\/Btn/.test(b) || /\/AS\s*\//.test(b)) {
      const as = holeName(b, 'AS');
      const kids = b.match(/\/Kids\s*\[([^\]]*)\]/);
      if (as && !/Radio|Ff\s+(49152|32768)/.test(b)) v = as; // Kästchen: sichtbarer Zustand
      else if (!v && kids) {
        const ids = (kids[1].match(/(\d+)\s+\d+\s+R/g) || []).map(x => +x.split(/\s+/)[0]);
        for (const id of ids) { const kb = objektText(id) || ''; const ka = holeName(kb, 'AS'); if (ka && ka !== '/Off') { v = ka; break; } }
        if (!v && ids.length) v = '/Off';
      }
      if (!v) v = '/Off';
    }
    if (info) {
      const e = eintraege[num];
      const g = e.typ === 1 ? +((S.substr(e.off, 40).match(/^\s*\d+\s+(\d+)\s+obj/) || [0, 0])[1]) : 0;
      (info.objekte[name] = info.objekte[name] || []).push({ num: +num, gen: g, body: b, verzeichnet: !!verzeichnet[num] });
    }
    // Bei Namensgleichheit: gefüllter Wert vor leerem, dann verzeichnetes Feld vor Kopie, sonst neuestes Objekt
    const leer = x => !String(x || '').trim() || x === '/Off';
    const alt = ausFormular[name], verz = !!verzeichnet[num];
    if (alt && ((leer(v) && !leer(alt.v)) || (!leer(v) && !leer(alt.v) && alt.verz && !verz))) return;
    ausFormular[name] = { v, verz };
    out[name] = v;
  });
  if (info) {
    info.text = S;
    info.maxNum = Math.max.apply(null, nums.map(Number));
    info.objektText = n => objektText(n);
    info.gen = n => { const e = eintraege[n]; return e && e.typ === 1 ? +((S.substr(e.off, 40).match(/^\s*\d+\s+(\d+)\s+obj/) || [0, 0])[1]) : 0; };
  }
  return out;
}

// ===================== STEUER-ID INS BEIBLATT =====================
// Trägt eine Steuer-ID in das Feld "SteuerID 11stellig" des Beiblatts ein – als "inkrementelle Speicherung":
// Der bisherige Inhalt der PDF bleibt Byte für Byte erhalten (Unterschriften, Notizen), es wird nur
// eine neue Fassung dieses einen Feldes angehängt – genau so, wie es Vorschau/Acrobat beim Speichern tun.
// Rückgabe: neue PDF-Bytes (Int8-Array für Utilities.newBlob) oder null, wenn das Feld nicht gefunden wurde.
function beiblattFeldSetzen_(rohBytes, feldName, wert) { const w = {}; w[feldName] = wert; return beiblattFelderSetzen_(rohBytes, w); }

// Mehrere Felder in einem Schritt: werte = { Feldname: Wert }. null, wenn keines der Felder existiert.
function beiblattFelderSetzen_(rohBytes, werte) {
  const info = { objekte: {} };
  leseFormularfelder_(rohBytes, pako_(), info);
  const namen = Object.keys(werte).filter(n => info.objekte[n] && info.objekte[n].length);
  if (!namen.length) return null;
  const S = info.text;
  const pdfText = w => '(' + String(w).replace(/[\\()]/g, m => '\\' + m) + ')';

  // Wert eines Schlüssels (inkl. Schlüssel) aus einem Dictionary-Text entfernen
  const ohneSchluessel = (body, key) => {
    const re = new RegExp('/' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s(<\\/\\[])');
    const m = re.exec(body);
    if (!m) return body;
    let i = m.index + m[0].length;
    while (/\s/.test(body[i])) i++;
    let j = i;
    if (body.startsWith('<<', i)) { let t = 0; for (; j < body.length; j++) { if (body.startsWith('<<', j)) { t++; j++; } else if (body.startsWith('>>', j)) { t--; j++; if (!t) { j++; break; } } } }
    else if (body[i] === '(') { let t = 0; for (; j < body.length; j++) { if (body[j] === '\\') { j++; continue; } if (body[j] === '(') t++; else if (body[j] === ')') { t--; if (!t) { j++; break; } } } }
    else if (body[i] === '<') j = body.indexOf('>', i) + 1;
    else if (body[i] === '[') { let t = 0; for (; j < body.length; j++) { if (body[j] === '[') t++; else if (body[j] === ']') { t--; if (!t) { j++; break; } } } }
    else if (body[i] === '/') { j = i + 1; while (j < body.length && !/[\s\/<>\[\]()]/.test(body[j])) j++; }
    else { const r = body.substr(i).match(/^\d+\s+\d+\s+R|^[-+.\d]+|^true|^false|^null/); j = i + (r ? r[0].length : 0); }
    return body.substring(0, m.index) + body.substring(j);
  };
  const setzeEnde = (body, zusatz) => { const t = body.trim(); return t.substring(0, t.lastIndexOf('>>')) + zusatz + ' >>'; };

  let naechste = Math.max(info.maxNum + 1, +((S.match(/\/Size\s+(\d+)/g) || []).map(x => +x.split(/\s+/)[1]).reduce((a, c) => Math.max(a, c), 0)));
  const fontNum = naechste++;
  const neu = []; // [num, gen, text]
  neu.push([fontNum, 0, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  const erledigt = {};

  const apFuer = (body, wertPdf) => {
    const r = ((body.match(/\/Rect\s*\[([^\]]*)\]/) || [])[1] || '0 0 150 24').trim().split(/\s+/).map(Number);
    const br = Math.abs(r[2] - r[0]), ho = Math.abs(r[3] - r[1]);
    const gr = Math.min(12, Math.max(6, ho - 6));
    const y = Math.max(1, (ho - gr) / 2 + gr * 0.22);
    const inhalt = '/Tx BMC q BT /Helv ' + gr + ' Tf 0 g 3 ' + y.toFixed(2) + ' Td ' + wertPdf + ' Tj ET Q EMC';
    const num = naechste++;
    neu.push([num, 0, '<< /Type /XObject /Subtype /Form /BBox [0 0 ' + br.toFixed(2) + ' ' + ho.toFixed(2) + '] /Resources << /Font << /Helv ' + fontNum + ' 0 R >> >> /Length ' + inhalt.length + ' >>\nstream\n' + inhalt + '\nendstream']);
    return num;
  };
  // Ein Objekt neu schreiben: Wert setzen (Feld) und/oder Darstellung erneuern (Widget mit /Rect)
  const schreibe = (num, gen, body, mitWert, wertPdf) => {
    if (erledigt[num]) return;
    erledigt[num] = 1;
    let b = body;
    ['AP', 'AAPL:AKExtras'].concat(mitWert ? ['V'] : []).forEach(k => { b = ohneSchluessel(b, k); });
    let zusatz = mitWert ? ' /V ' + wertPdf : '';
    if (/\/Rect\s*\[/.test(b)) zusatz += ' /AP << /N ' + apFuer(b, wertPdf) + ' 0 R >>';
    neu.push([num, gen, setzeEnde(b, zusatz)]);
  };
  namen.forEach(name => {
    const wertPdf = pdfText(werte[name]);
    info.objekte[name].forEach(f => {
      schreibe(f.num, f.gen, f.body, true, wertPdf);
      const kids = ((f.body.match(/\/Kids\s*\[([^\]]*)\]/) || [])[1] || '').match(/\d+\s+\d+\s+R/g) || [];
      kids.forEach(r => { const n = +r.split(/\s+/)[0]; const kb = info.objektText(n) || ''; if (/\/Rect/.test(kb)) schreibe(n, info.gen(n), kb, false, wertPdf); });
    });
  });

  // Letzten Querverweis (Trailer bzw. XRef-Stream) lesen
  const sx = S.lastIndexOf('startxref');
  const prev = parseInt(S.substr(sx + 9, 30).trim(), 10);
  let p = prev; while (/\s/.test(S[p])) p++;
  const istTabelle = S.substr(p, 4) === 'xref';
  const tdict = istTabelle ? S.substring(S.indexOf('trailer', p), S.indexOf('startxref', p)) : S.substring(p, S.indexOf('stream', p));
  const ref = k => (tdict.match(new RegExp('/' + k + '\\s+(\\d+\\s+\\d+\\s+R)')) || [])[1];
  const idm = tdict.match(/\/ID\s*\[[^\]]*\]/);
  const root = ref('Root'), infoRef = ref('Info');
  if (!root) return null;

  // Anhängen
  let anhang = S.endsWith('\n') || S.endsWith('\r') ? '' : '\n';
  const offs = {};
  neu.forEach(([n, g, t]) => { offs[n] = { off: S.length + anhang.length, gen: g }; anhang += n + ' ' + g + ' obj\n' + t + '\nendobj\n'; });
  const xrefOff = S.length + anhang.length;
  const zusatzTrailer = ' /Root ' + root + (infoRef ? ' /Info ' + infoRef : '') + (idm ? ' ' + idm[0] : '') + ' /Prev ' + prev;
  const sortiert = Object.keys(offs).map(Number).sort((a, b) => a - b);
  if (istTabelle) {
    anhang += 'xref\n';
    sortiert.forEach(n => { anhang += n + ' 1\n' + ('0000000000' + offs[n].off).slice(-10) + ' ' + ('00000' + offs[n].gen).slice(-5) + ' n\r\n'; });
    anhang += 'trailer\n<< /Size ' + naechste + zusatzTrailer + ' >>\n';
  } else {
    const xnum = naechste++;
    offs[xnum] = { off: xrefOff, gen: 0 };
    sortiert.push(xnum);
    const bytes = [];
    sortiert.forEach(n => { const o = offs[n].off, g = offs[n].gen; bytes.push(1, (o >>> 24) & 255, (o >>> 16) & 255, (o >>> 8) & 255, o & 255, (g >> 8) & 255, g & 255); });
    const index = sortiert.map(n => n + ' 1').join(' ');
    anhang += xnum + ' 0 obj\n<< /Type /XRef /Size ' + naechste + ' /Index [' + index + '] /W [1 4 2]' + zusatzTrailer + ' /Length ' + bytes.length + ' >>\nstream\n' +
      String.fromCharCode.apply(null, bytes) + '\nendstream\nendobj\n';
  }
  anhang += 'startxref\n' + xrefOff + '\n%%EOF\n';
  const alt = Array.from(rohBytes, x => (x << 24) >> 24);
  for (let i = 0; i < anhang.length; i++) { const c = anhang.charCodeAt(i) & 255; alt.push(c > 127 ? c - 256 : c); }
  return alt;
}

function pako_() {
  if (typeof globalThis.pako === 'undefined') {
    (0, eval)(UrlFetchApp.fetch('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako_inflate.min.js').getContentText());
  }
  return globalThis.pako;
}

let _ordnerListeCache = null; // V65: die Ordnerliste wird pro Lauf nur einmal von Drive geholt (spart Zeit)
function ordnerListe_() {
  if (_ordnerListeCache) return _ordnerListeCache.slice();
  const out = [];
  const it = DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID).getFolders();
  while (it.hasNext()) {
    const o = it.next();
    if (o.isTrashed()) continue; // Papierkorb ignorieren
    if (!CFG.UEBERSPRINGEN.some(r => r.test(o.getName()))) out.push(o);
  }
  _ordnerListeCache = out;
  return out.slice();
}

const _unterordnerDatei = {}; // Dateien aus Unterordnern (z. B. "Unterlagen Verwendungsnachweis")
function alleDateien_(ordner) {
  const out = [];
  const nimm = f => { if (!f.isTrashed()) out.push(f); }; // Papierkorb ignorieren
  let it = ordner.getFiles();
  while (it.hasNext()) nimm(it.next());
  const sub = ordner.getFolders();
  while (sub.hasNext()) {
    const u = sub.next();
    if (u.isTrashed()) continue;
    it = u.getFiles(); while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) { _unterordnerDatei[f.getId()] = true; out.push(f); } }
  }
  return out;
}

function dateiExistiert_(ordner, regex) {
  return alleDateien_(ordner).some(f => regex.test(f.getName()));
}

function vnOrdner_(ordner) {
  const it = ordner.getFoldersByName(CFG.VN_ORDNER_NAME);
  return it.hasNext() ? it.next() : ordner.createFolder(CFG.VN_ORDNER_NAME);
}

function nachnameAusOrdner_(n) {
  // "95023070 Guttoriello 86343 Königsbrunn" / "94485209-Möller-Dietsch" / "Plümer 83109 Großkarolinenfeld"
  return n.replace(/^\d+\s*-?\s*/, '').replace(/\s+\d{5}.*$/, '').replace(/\s*-\s*(storniert|beiblatt.*)$/i, '').trim();
}

function kundeAusOrdner_(ordner, s) {
  if (s.kunde && eigeneAdresse_(s.kunde.email)) delete s.kunde.email; // früher fälschlich gemerkte eigene Adresse
  if (s.kunde && s.kunde.email) return Object.assign({ name: s.kunde.vorname + ' ' + s.kunde.nachname }, s.kunde);
  const nn = nachnameAusOrdner_(ordner.getName());
  const k = { nachname: nn, vorname: '', anrede: '', email: '', steuerId: '' };
  // E-Mail + Anrede aus deiner Mail "benötigte Unterlagen <Nachname>" (nur Empfänger, die nicht du selbst bist)
  const th = GmailApp.search('in:sent subject:"benötigte Unterlagen ' + nn + '"', 0, 5);
  for (const t of th) {
    for (const m of t.getMessages()) {
      if (!eigeneAdresse_((m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1])) continue;
      const an = m.getTo().split(',').map(x => ((x.match(/<([^>]+)>/) || [null, x])[1] || '').trim()).find(x => x && !eigeneAdresse_(x));
      if (!an) continue;
      k.email = an;
      const ar = m.getPlainBody().match(/Sehr geehrte[r]? (Frau|Herr)/);
      if (ar) k.anrede = ar[1];
      break;
    }
    if (k.email) break;
  }
  k.name = nn;
  // V65: bekannte Angaben (Vorname, Anrede, Steuer-ID) nicht mit leeren Werten überschreiben
  const altK = s.kunde || {};
  ['vorname', 'anrede', 'steuerId'].forEach(x => { if (!k[x] && altK[x]) k[x] = altK[x]; });
  s.kunde = Object.assign({}, altK, k);
  // sonst: E-Mail und Vorname aus der Kundenliste – nur wenn die Zeile eindeutig ist (wird nicht gespeichert)
  if (!k.email || !k.vorname) {
    try {
      const L = liste_();
      const z = L ? eindeutigeZeile_(L, nn, (ordner.getName().match(/\b(\d{5})\b/) || [])[1]) : null;
      if (z) {
        const r = Object.assign({}, k);
        if (!r.email && L.sp['E-Mail']) { const e = String(z[L.sp['E-Mail'] - 1]).trim(); if (!eigeneAdresse_(e)) r.email = e; }
        if (!r.vorname && L.sp['Vorname']) r.vorname = String(z[L.sp['Vorname'] - 1]).trim();
        return r;
      }
    } catch (e) {}
  }
  return k;
}

// Genau eine Listenzeile mit diesem Nachnamen (und ggf. dieser PLZ)? Dann deren Werte, sonst null
function eindeutigeZeile_(L, nachname, plz) {
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const nn = norm(nachname);
  let treffer = listeDaten_(L).filter(r => norm(r[L.sp['Nachname'] - 1]) === nn);
  if (treffer.length > 1 && plz && L.sp['PLZ']) treffer = treffer.filter(r => String(r[L.sp['PLZ'] - 1]).trim() === plz);
  return treffer.length === 1 ? treffer[0] : null;
}

// E-Mail-Adressen vergleichbar machen: googlemail.com = gmail.com, Punkte im Gmail-Namen zählen nicht
function mailNorm_(e) {
  let x = String(e || '').trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1');
  const m = x.match(/^([^@]+)@(gmail|googlemail)\.com$/);
  if (m) x = m[1].replace(/\./g, '').replace(/\+.*$/, '') + '@gmail.com';
  return x;
}

// Kundenordner zu einer Mail finden: 1) gespeicherte Kunden-E-Mail, 2) E-Mail-Spalte der Liste,
// 3) deine Mail "benötigte Unterlagen" an diese Adresse, 4) andere Adressen der Mail (An/CC, z. B. Angehörige),
// 5) Name im Absender (z. B. "haraldmemmler@gmail.com" → Ordner "Memmler …") – nur wenn genau ein Ordner passt.
function ordnerFuerEmail_(email, ordner, st, m) {
  if (!email || eigeneAdresse_(email)) return null; // eigene Mails sind nie Kundenpost
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const normU = x => String(x || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
  const adressen = [email];
  if (m) (m.getTo() + ',' + m.getCc()).split(',').map(x => ((x.match(/<([^>]+)>/) || [null, x])[1] || '').trim().toLowerCase())
    .filter(x => x && x.indexOf('@') > 0 && !eigeneAdresse_(x) && adressen.indexOf(x) < 0).forEach(x => adressen.push(x));
  // Antwort auf eine deiner Mails (z. B. "benötigte Unterlagen Köhl") von einer anderen Adresse:
  // die Empfänger deiner eigenen Mails im selben Verlauf zählen mit
  if (m) {
    try {
      m.getThread().getMessages().forEach(x => {
        const von = ((x.getFrom().match(/<([^>]+)>/) || [null, x.getFrom()])[1] || '').trim().toLowerCase();
        if (!eigeneAdresse_(von)) return;
        (x.getTo() + ',' + x.getCc()).split(',').map(y => ((y.match(/<([^>]+)>/) || [null, y])[1] || '').trim().toLowerCase())
          .filter(y => y && y.indexOf('@') > 0 && !eigeneAdresse_(y) && adressen.indexOf(y) < 0).forEach(y => adressen.push(y));
      });
    } catch (e) {}
  }
  const nAdr = adressen.map(mailNorm_);
  for (const o of ordner) {
    const s = st[o.getId()];
    if (s && s.kunde && s.kunde.email && nAdr.indexOf(mailNorm_(s.kunde.email)) >= 0) return o;
  }
  // E-Mail-Spalte der Kundenliste
  try {
    const L = liste_();
    if (L && L.sp['E-Mail']) {
      const z = listeDaten_(L).filter(r => nAdr.indexOf(mailNorm_(r[L.sp['E-Mail'] - 1])) >= 0 && String(r[L.sp['E-Mail'] - 1]).trim());
      for (const r of z.reverse()) {
        const nn = norm(r[L.sp['Nachname'] - 1]), plz = L.sp['PLZ'] ? String(r[L.sp['PLZ'] - 1]).trim() : '';
        const o = ordner.filter(x => norm(nachnameAusOrdner_(x.getName())) === nn && (!plz || x.getName().indexOf(plz) >= 0));
        if (o.length === 1) return o[0];
      }
    }
  } catch (e) {}
  for (const a of adressen) {
    const th = GmailApp.search('in:sent to:' + a + ' subject:"benötigte Unterlagen"', 0, 1);
    if (!th.length) continue;
    const nn = (th[0].getFirstMessageSubject().match(/benötigte Unterlagen\s+(.+)$/i) || [])[1];
    const o = nn && ordner.find(x => norm(nachnameAusOrdner_(x.getName())) === norm(nn));
    if (o) return o;
  }
  // Betreff der Antwort enthält deinen Betreff "… benötigte Unterlagen <Name>" bzw. "… Herr/Frau <Name>"
  if (m) {
    const nb = (m.getSubject().match(/(?:benötigte Unterlagen|Vollmacht für Ihren BAFA-Förderantrag[^\w]*|ist da (?:Herr|Frau))\s+([^\s,]+(?:[\s-][^\s,]+)?)\s*$/i) || [])[1];
    if (nb) {
      // Umlaute bleiben erhalten (Köhl ≠ Kohl)
      const tr = ordner.filter(x => normU(nachnameAusOrdner_(x.getName())) === normU(nb));
      if (tr.length === 1) return tr[0];
    }
  }
  // Name im Absender (Adresse oder Anzeigename)
  if (m) {
    const varianten = x => { const t = String(x || '').toLowerCase(); return [t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'), ohneAkzente_(t)].map(v => v.replace(/[^a-z]/g, '')); };
    const absender = varianten(m.getFrom()).join(' ');
    const treffer = ordner.filter(x => {
      const nn = nachnameAusOrdner_(x.getName());
      return nn.split(/[-\s]+/).some(t => t.length >= 5 && varianten(t).some(v => absender.indexOf(v) >= 0));
    });
    if (treffer.length === 1) return treffer[0];
    // kurze Nachnamen (z. B. "Köhl"): nur als ganzes Wort im Anzeigenamen, Umlaute exakt
    const anzeige = (m.getFrom().replace(/<[^>]*>/, '').replace(/"/g, '').trim().toLowerCase().split(/[\s,\-]+/)).map(normU).filter(Boolean);
    const kurz = ordner.filter(x => {
      const nn = normU(nachnameAusOrdner_(x.getName()));
      return nn.length >= 3 && nn.length < 5 && anzeige.indexOf(nn) >= 0;
    });
    if (kurz.length === 1 && !treffer.length) return kurz[0];
  }
  return null;
}

function mailExistiert_(betreffTeil) {
  const q = 'subject:"' + betreffTeil.replace(/"/g, '') + '"';
  return GmailApp.search('in:sent ' + q, 0, 1).length > 0 || GmailApp.search('in:drafts ' + q, 0, 1).length > 0;
}

function mailMitNameExistiert_(wort, nachname) {
  const q = 'subject:' + wort + ' subject:"' + nachname.replace(/"/g, '') + '"';
  return GmailApp.search('in:sent ' + q, 0, 1).length > 0 || GmailApp.search('in:drafts ' + q, 0, 1).length > 0;
}

function istBezahlt_(name, rechnungsDatum8) {
  if (!name) return false;
  const nn = name.split(/\s+/).pop();
  // mit Rechnungsnummer (z. B. "20260907") genauer – wichtig bei Kunden mit mehreren Aufträgen
  const nr = rechnungsDatum8 ? ' "' + rechnungsDatum8 + '"' : '';
  return GmailApp.search('from:invoice@qonto.com subject:"wurde bezahlt" "' + nn + '"' + nr, 0, 1).length > 0;
}

function steuerIdAusText_(t) {
  const m = (t || '').match(/steuer[\s-]*id[^0-9]{0,30}((?:\d[\s]?){11})/i);
  if (!m) return '';
  const id = m[1].replace(/\D/g, '');
  return id.length === 11 && steuerIdGueltig_(id) ? id : '';
}

function steuerIdAusMails_(email) {
  const th = GmailApp.search('from:' + email + ' steuer', 0, 10);
  for (const t of th) for (const m of t.getMessages()) {
    const id = steuerIdAusText_(m.getPlainBody());
    if (id) return id;
  }
  return '';
}

// ===================== ANREDE =====================
// Reihenfolge:
//  1. NAMEN_EXTRA (deine eigenen Einträge, siehe unten)
//  2. NAMEN_UNKLAR (Unisex-Namen → nie automatisch)
//  3. Eingebaute Listen (deutschsprachige Sonderfälle + Ergänzungen aus Afrika, Nahost, Asien …)
//  4. Weltweites Vornamen-Wörterbuch (rund 48.000 Namen aus 55 Ländern/Regionen). Es wird einmalig
//     aus dem Internet geladen und danach als Datei "_vornamen_weltweit.json" im Ordner 2_Neu gespeichert.
//  5. Endungs-Regel als letzte Schätzung (wird dir dann als "geschätzt" gemeldet)
// Ergebnis: { anrede: 'Herr' | 'Frau' | '', sicher: true/false }
const WELT_QUELLE = 'https://raw.githubusercontent.com/lead-ratings/gender-guesser/master/gender_guesser/data/nam_dict.txt';
const WELT_DATEI = '_vornamen_weltweit.json';
const WELT_ORDNER_ID = '1q5CSw3zdrwTkQvrITtnOAot1i9dZ53qj'; // 2_Neu

// ---------- Namenslisten (eingebaut, keine zweite Datei nötig) ----------
// Deutschsprachige Namen, die im Welt-Wörterbuch fehlen oder dort anders gewertet werden (z. B. Gabriele = Frau)
const NAMEN_DE_M = 'abhilash|adi|adolf|aime|aldis|alija|anar|andree|artjom|auguste|bao|bela|bo|carmel|chan|chandra|chien|cong|cyrille|dimitrija|don|eli|friedl|gerd|gia|gil|hayat|iman|isa|jai|jaime|jun|kadri|kari|lee|long|mar|marian|maris|meine|merle|michal|miho|mo|nam|nanne|nermin|nino|nubar|olof|petja|petya|quan|rein|rok|rosario|rui|sasha|shahin|suad|sultan|tae|tam|terje|ton|tone|ulli|valdis|willie|yan|yong|yvon';
const NAMEN_DE_F = 'aiman|aime|aki|aldis|alke|almaz|aly|amal|ami|andree|be|berti|carol|conny|daniele|dao|di|dian|dima|dori|dudu|eiko|eli|elke|gabriele|gene|gerti|gun|hani|henny|hilal|indra|inge|isa|janne|jasmin|jessie|jin|joan|kari|kea|kerry|kristel|kristen|kyle|laurence|le|leslie|lin|lois|luz|mar|maris|marlen|miki|misa|my|nan|nicola|nihal|nural|olof|orla|rae|ran|rim|rosario|run|sava|sima|sina|suha|toma|tracy|valdis|vesa';
// Ergänzung weltweit (Afrika, Naher/Mittlerer Osten, Türkei/Kurdistan, Südasien, Ostasien, Lateinamerika, Griechenland)
const NAMEN_WELT_M = 'abdi|abdirahman|abdoulaye|abdullahi|abebe|abhilash|abhishek|abubakar|adebayo|aditya|ahmad|ahmed|ali|aliyu|alper|amadou|amir|amit|anas|anil|anwar|arash|arda|arjun|asif|athanasios|ayodele|aziz|babak|babatunde|bakari|baraka|baris|bayo|behzad|bereket|berk|bilal|bo|bongani|boubacar|bruno|burak|caner|cem|cheikh|cheng|chibuike|chinedu|christos|chukwudi|chukwuemeka|cuong|daiki|dapo|dariush|dawit|deepak|diego|dilshad|dimitrios|dong|duc|dung|eduardo|ekow|emeka|emre|enes|fadi|faisal|farah|farhad|farid|felipe|femi|fernando|furkan|ganesh|georgios|getachew|giorgos|guilherme|gustavo|haile|hakan|hamid|hamisi|hamza|hao|harish|haruto|hassan|hieu|hiroshi|hoang|hossein|hung|hussein|hyun|ibrahim|ibrahima|ifeanyi|ikenna|imran|ioannis|jabari|jae|jian|joao|juma|jun|kaan|kagiso|kamran|karim|karthik|karwan|kelechi|kemal|kenji|kenta|khaled|khalid|kian|kobina|kofi|kojo|konstantinos|krishna|kunle|kwabena|kwaku|kwame|kwan|kwasi|kweku|lamine|leandro|lei|long|lucas|lungelo|mahmoud|majid|mamadou|mandla|manoj|marcelo|matheus|mehdi|mehmet|mesfin|ming|modou|mohamed|mohamud|moussa|muhammad|murat|musa|mustafa|nabil|nam|nasser|navid|nikhil|nikolaos|nnamdi|obinna|olufemi|olumide|oluwafemi|oluwatobi|omar|omari|omid|onur|ousmane|panagiotis|parviz|phong|prakash|pranav|qiang|quang|rafael|rahim|rahul|rajesh|ramesh|rami|ramin|ravi|rebwar|ren|reza|ricardo|riku|rodrigo|rohit|rojan|rojhat|saeed|samir|sandeep|sani|sanjay|sardar|segun|serkan|seung|seydou|shota|shvan|siamak|sibusiso|sipho|son|sota|souleymane|srinivas|sunil|suresh|tafadzwa|takashi|tao|tariq|tatenda|tendai|tesfaye|tewodros|thabo|thang|themba|thiago|tiago|tobi|tochukwu|tolga|tshepo|tuan|tunde|uchenna|ugur|usman|vasileios|venkat|vijay|vikram|vinh|volkan|wahid|walid|yasin|yassin|yaw|yohannes|yusuf|yuto|zabihullah|ziad|zubair';
const NAMEN_WELT_F = 'abena|abimbola|achieng|adaeze|adenike|adwoa|afua|aisha|aishwarya|aissatou|akinyi|akosua|akua|ama|amaka|amani|amina|aminata|amma|ana|ananya|anita|anjali|aoi|atieno|awa|ayaan|ayesha|ayse|ayşe|azadeh|beatriz|berivan|bethlehem|bisi|bruna|bukola|buse|busra|camila|chiamaka|chidinma|chinwe|chioma|deepa|derya|dilan|dilek|dimitra|dina|divya|ebere|ebru|efua|eleni|elif|emine|esi|esra|eun-ji|fang|farzana|fatima|fatma|fatou|fereshteh|fernanda|folake|funmilayo|gabriela|georgia|golnaz|gul|gulalai|gulsen|halima|hana|hang|haruka|hatice|hauwa|helin|hibo|hina|hiwot|hoa|hodan|huda|hulya|huong|hye-jin|ifeoma|imani|ji-yeon|jing|joana|juliana|kadiatou|katerina|kavita|kavya|kemi|khadija|konstantina|kubra|lakshmi|lan|larissa|layla|leila|leticia|li-na|lina|lindiwe|linh|liya|mahlet|mahsa|mai|malalai|maria|mariama|mariana|marta|maryam|meera|mei|mei-ling|melek|meron|merve|min-ji|misaki|mona|my|nadia|nana|nanami|nandi|nasrin|nazia|neema|neha|nesrin|nga|ngozi|nimco|njeri|nneka|nokuthula|nomvula|noor|nour|nural|nurcan|nyokabi|obiageli|oluwakemi|omolara|ozlem|panagiota|parisa|pooja|precious|priya|ramatoulaye|rania|reem|rehema|rekha|rojda|sahra|sakura|salma|samira|sana|sara|seda|selam|seo-yeon|shalini|shireen|shirin|shreya|sibel|sofia|soo-jin|soraya|subira|sunita|swati|thandiwe|thu|thuy|tigist|titilayo|trang|tugba|tumaini|uchechi|vasiliki|vitoria|wairimu|wambui|wanjiru|xia|xiu|yaa|yasmin|yasmine|yetunde|ying|yui|yuki|yuna|zahra|zainab|zanele|zawadi|zeynep|zilan';
// Unisex/unklare Namen: hier wird NIE automatisch Herr/Frau gesetzt
const NAMEN_UNKLAR = 'ha|van|farah|akira|an|anh|ayo|bao|chinaza|deniz|eden|evren|hikaru|ini|ji-woo|jin|kamari|kaoru|khanh|kiran|makoto|min|minh|nao|ning|nkosi|noa|nur|oluwaseun|ope|ping|sasha|seun|shan|temitope|thanh|tosin|umut|valya|xin|yu|zhenya|kay|kim|andrea|toni|sascha|maxi|robin|rong|nikola|jean|chris|alex|eike|gabriel|mika|noa|charlie|sam|jo|jule|kai|dominique|claude|yu|li|wei|luca';
// Eigene Ergänzungen, z. B.  'kay': 'Frau',
const NAMEN_EXTRA = {
};

let _namenCache = null, _weltCache = null;
function namenSets_() {
  if (_namenCache) return _namenCache;
  const norm = x => ohneAkzente_(x.toLowerCase());
  const set = str => new Set(str.split('|').map(norm));
  _namenCache = { m: set(NAMEN_DE_M + '|' + NAMEN_WELT_M), f: set(NAMEN_DE_F + '|' + NAMEN_WELT_F), u: set(NAMEN_UNKLAR) };
  return _namenCache;
}
function ohneAkzente_(x) {
  return x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
}

// Wandelt das Wörterbuch (nam_dict.txt) in {m:[...], f:[...], u:[...]} um
function weltWoerterbuchParsen_(text) {
  const punkte = {}; // name -> {m: Summe, f: Summe}
  text.split(/\r?\n/).forEach(z => {
    if (!z || z[0] === '#' || z[0] === '=') return;
    const teile = z.split(/\s+/);
    if (teile.length < 2) return;
    const code = teile[0];
    let geschl = null, faktor = 1;
    if (code === 'M') geschl = 'm';
    else if (code === '1M' || code === '?M') { geschl = 'm'; faktor = 0.6; }
    else if (code === 'F') geschl = 'f';
    else if (code === '1F' || code === '?F') { geschl = 'f'; faktor = 0.6; }
    else if (code === '?') geschl = 'u';
    else return;
    let summe = 0;
    z.substring(30, z.length - 1).split('').forEach(c => { const v = parseInt(c, 16); if (!isNaN(v)) summe += v; });
    summe = Math.max(summe, 1) * faktor;
    const roh = teile[1].toLowerCase();
    [roh.replace(/\+/g, ''), roh.replace(/\+/g, '-')].forEach(n => {
      const k = ohneAkzente_(n);
      const p = punkte[k] || (punkte[k] = { m: 0, f: 0, u: 0 });
      p[geschl] += summe;
    });
  });
  const out = { m: [], f: [], u: [] };
  Object.keys(punkte).forEach(n => {
    const p = punkte[n];
    if (p.m > 0 && p.m >= 3 * (p.f + p.u)) out.m.push(n);
    else if (p.f > 0 && p.f >= 3 * (p.m + p.u)) out.f.push(n);
    else out.u.push(n);
  });
  return out;
}

// Lädt das weltweite Wörterbuch (aus Drive, sonst einmalig aus dem Internet)
function weltSets_() {
  if (_weltCache) return _weltCache;
  let daten = null;
  try {
    const it = DriveApp.getFolderById(WELT_ORDNER_ID).getFilesByName(WELT_DATEI);
    if (it.hasNext()) daten = JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
  } catch (e) {}
  if (!daten) daten = vornamenWeltweitLaden();
  if (!daten) return null;
  const set = a => new Set(a);
  _weltCache = { m: set(daten.m), f: set(daten.f), u: set(daten.u) };
  return _weltCache;
}

// Einmal ausführen (oder automatisch beim ersten Bedarf): lädt das Wörterbuch und speichert es in 2_Neu.
function vornamenWeltweitLaden() {
  try {
    const text = UrlFetchApp.fetch(WELT_QUELLE).getContentText('UTF-8');
    const daten = weltWoerterbuchParsen_(text);
    const ordner = DriveApp.getFolderById(WELT_ORDNER_ID);
    const alt = ordner.getFilesByName(WELT_DATEI);
    const json = JSON.stringify(daten);
    if (alt.hasNext()) alt.next().setContent(json);
    else ordner.createFile(WELT_DATEI, json, 'application/json');
    Logger.log('Weltweites Vornamen-Wörterbuch gespeichert: ' + daten.m.length + ' männlich, '
      + daten.f.length + ' weiblich, ' + daten.u.length + ' unisex/unklar.');
    return daten;
  } catch (e) {
    Logger.log('Wörterbuch konnte nicht geladen werden: ' + e.message);
    return null;
  }
}

function anredeErmitteln_(vorname) {
  const voll = (vorname || '').trim().toLowerCase();
  if (!voll) return { anrede: '', sicher: false };
  const extra = {};
  Object.keys(NAMEN_EXTRA).forEach(k => extra[ohneAkzente_(k.toLowerCase())] = NAMEN_EXTRA[k]);
  const s = namenSets_();
  // Kandidaten: "Mark-Robin" → mark-robin, mark ; "Martina Christine" → martina
  const erster = voll.split(/\s+/)[0];
  const kandidaten = [...new Set([erster, erster.split('-')[0]].map(ohneAkzente_))];
  for (const k of kandidaten) {
    if (extra[k]) return { anrede: extra[k], sicher: true };
    if (s.u.has(k)) return { anrede: '', sicher: false };
    if (s.f.has(k)) return { anrede: 'Frau', sicher: true };
    if (s.m.has(k)) return { anrede: 'Herr', sicher: true };
  }
  const w = weltSets_();
  if (w) for (const k of kandidaten) {
    if (w.f.has(k)) return { anrede: 'Frau', sicher: true };
    if (w.m.has(k)) return { anrede: 'Herr', sicher: true };
    if (w.u.has(k)) return { anrede: '', sicher: false };
  }
  // Unbekannter Name: nach Endung schätzen, aber als "geschätzt" melden
  const k = kandidaten[kandidaten.length - 1];
  const weiblich = /(a|ine|ina|ette|elle|ia|ie|ana|ika|ita|ilde|trud|gard|run)$/.test(k)
    && !/(luca|andrea|nikita|sascha|mischa|elia|jona|joshua|mustafa|hamza|musa|isa|nicola|ilja)$/.test(k);
  return { anrede: weiblich ? 'Frau' : 'Herr', sicher: false };
}
// Kompatibilität: liefert nur die Anrede, wenn sie sicher ist
function anredeAus_(vorname) {
  const r = anredeErmitteln_(vorname);
  return r.sicher ? r.anrede : '';
}

function begruessung_(anrede, nachname) {
  if (anrede === 'Frau') return 'Sehr geehrte Frau ' + nachname + ',';
  if (anrede === 'Herr') return 'Sehr geehrter Herr ' + nachname + ',';
  return 'Sehr geehrte/r Frau/Herr ' + nachname + ',';
}

function pruefHinweis_(anrede) {
  return anrede ? '' : '### BITTE ANREDE PRÜFEN (diese Zeile löschen) ###\n\n';
}

function holeLabel_() {
  return GmailApp.getUserLabelByName(CFG.LABEL_ABGELEGT) || GmailApp.createLabel(CFG.LABEL_ABGELEGT);
}

// Hinweis-Mail an dich selbst. Ist das tägliche Mail-Kontingent von Google erschöpft (z. B. nach vielen Hinweisen),
// bricht die Automatik NICHT ab – der Hinweis landet dann als Entwurf "[BAFA-Hinweis] …" in deinen Entwürfen.
function mailAnMich_(betreff, text) {
  const an = Session.getActiveUser().getEmail();
  try { if (MailApp.getRemainingDailyQuota() > 3) { MailApp.sendEmail(an, betreff, text); return; } } catch (e) { console.log('Hinweis-Mail: ' + e.message); }
  try { GmailApp.createDraft(an, '[BAFA-Hinweis] ' + betreff, text); } catch (e) { console.log('Hinweis-Entwurf: ' + e.message); }
}

function meldeProbleme_(probleme) {
  // V65: Google erlaubt pro gespeichertem Wert nur 9 KB. Früher wurden die kompletten Hinweistexte des Tages gespeichert –
  // an Tagen mit vielen Hinweisen schlug das Speichern fehl und ALLE weiteren Hinweis-Mails des Tages fielen still aus
  // (vermutlich der Grund für die fehlenden Hinweise am 04.10.). Jetzt: nur kurze Prüfsummen, alte Tage werden aufgeräumt.
  const props = PropertiesService.getScriptProperties();
  const heute = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  const key = 'probleme_' + heute;
  const hash = p => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(p), Utilities.Charset.UTF_8)).slice(0, 12);
  try { Object.keys(props.getProperties()).forEach(x => { if (/^probleme_/.test(x) && x !== key) props.deleteProperty(x); }); } catch (e) { console.log('Aufräumen: ' + e.message); }
  let alt = [];
  try { alt = JSON.parse(props.getProperty(key) || '[]'); } catch (e) { alt = []; }
  alt = alt.map(x => String(x).length === 12 ? String(x) : hash(x)); // ältere Einträge (ganze Texte) umrechnen
  const neu = probleme.filter((p, i, a) => a.indexOf(p) === i && alt.indexOf(hash(p)) < 0);
  if (!neu.length) return;
  try {
    let liste = alt.concat(neu.map(hash));
    if (liste.length > 500) liste = liste.slice(-500);
    props.setProperty(key, JSON.stringify(liste));
  } catch (e) { console.log('Hinweise merken: ' + e.message); }
  mailAnMich_('BAFA-Automatik: ' + neu.length + ' Punkt(e) bitte prüfen',
    neu.map(p => '• ' + p).join('\n'));
}

// Schickt dir eine Mail, sobald im Ordner "Kunden" ein neuer Kundenordner auftaucht (nur an dich, nie an Kunden)
function neueKundenMelden_(neueOrdner, st) {
  if (!neueOrdner.length) return;
  try {
    const an = Session.getActiveUser().getEmail();
    const block = o => {
      const s = st[o.getId()] || {};
      const dateien = alleDateien_(o).map(f => f.getName());
      let wer = '';
      try { const ow = o.getOwner(); if (ow) wer = ow.getName() || ow.getEmail(); } catch (e) {}
      const bb = dateien.some(n => /beiblatt/i.test(n) && !/rechnung/i.test(n));
      return 'Ordner: ' + o.getName() + '\n' +
        (wer ? 'Angelegt von: ' + wer + '\n' : '') +
        'Link: ' + o.getUrl() + '\n' +
        'Dateien: ' + (dateien.length ? dateien.join(', ') : '(noch leer)') + '\n' +
        (s.kunde && s.kunde.vorname ? 'Vollmacht + Entwurf "benötigte Unterlagen" sind schon vorbereitet (siehe Gmail-Entwürfe).'
          : bb ? 'Beiblatt ist da – Vollmacht wird im nächsten Lauf vorbereitet.'
          : 'Noch kein Beiblatt – sobald es hochgeladen ist, bereitet die Automatik die Vollmacht vor.');
    };
    if (neueOrdner.length > 5) {
      // Sicherung: nicht mit Einzelmails fluten (z. B. nach Neueinrichtung)
      mailAnMich_('BAFA-Automatik: ' + neueOrdner.length + ' neue Kundenordner', neueOrdner.map(block).join('\n\n'));
    } else {
      neueOrdner.forEach(o => mailAnMich_('Neuer BAFA-Kunde: ' + o.getName(), 'Im Ordner "Kunden" wurde ein neuer Kundenordner angelegt.\n\n' + block(o)));
    }
  } catch (e) { Logger.log('Hinweis-Mail fehlgeschlagen: ' + e.message); }
}

// Status liegt als Datei im Kundenordner-Root (Script Properties wären bei ~100 Kunden zu klein)
function statusDatei_() {
  const root = DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID);
  const it = root.getFilesByName('_bafa_automatik_status.json');
  return it.hasNext() ? it.next() : null;
}
function ladeStatus_() {
  const f = statusDatei_();
  return f ? JSON.parse(f.getBlob().getDataAsString()) : {};
}
function speichereStatus_(st) {
  const f = statusDatei_();
  const txt = JSON.stringify(st);
  if (f) f.setContent(txt);
  else DriveApp.getFolderById(CFG.KUNDEN_ORDNER_ID).createFile('_bafa_automatik_status.json', txt, 'application/json');
}

// ===================== EINMALIG: E-MAILS FÜR ALLE KUNDEN NACHTRAGEN =====================
// Füllt die Spalte "E-Mail" für alle Zeilen, in denen sie leer ist. Quelle in dieser Reihenfolge:
//   1. Beiblatt im Kundenordner (Feld "EMail")   2. vorausgefüllte Vollmacht (Feld "EMailAdresse optional")
//   3. gesendete Mail "benötigte Unterlagen <Nachname>" (Empfänger)
// Bestehende Einträge werden nie überschrieben. Läuft max. ~5 Minuten; bei vielen Kunden einfach nochmal starten,
// es macht dort weiter, wo es aufgehört hat. Am Ende steht im Protokoll, was eingetragen wurde und was fehlt.
function emailsNachtragen() {
  const start = Date.now();
  const L = liste_();
  if (!L) { Logger.log('Kundenliste nicht gefunden.'); return; }
  const cE = emailSpalte_(L);
  const props = PropertiesService.getScriptProperties();
  const erledigt = JSON.parse(props.getProperty('emailNachtrag_geprueft') || '{}');
  const norm = x => ohneAkzente_(String(x || '').toLowerCase()).replace(/[^a-z]/g, '');
  const gueltig = x => /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(x || '').trim());

  // Kundenordner nach Nachname gruppieren
  const ordnerNach = {};
  ordnerListe_().forEach(o => {
    const k = norm(nachnameAusOrdner_(o.getName()));
    if (k) (ordnerNach[k] = ordnerNach[k] || []).push(o);
  });

  const n = L.sh.getLastRow() - L.kopf;
  const d = L.sh.getRange(L.kopf + 1, 1, n, L.sh.getLastColumn()).getDisplayValues();
  const eingetragen = [], fehlt = [], abweichend = [];
  let fertig = true;
  for (let i = 0; i < d.length; i++) {
    if (Date.now() - start > 5 * 60 * 1000) { fertig = false; break; }
    const r = d[i], row = L.kopf + 1 + i;
    const nachname = String(r[L.sp['Nachname'] - 1]).trim(), vorname = String(r[L.sp['Vorname'] - 1]).trim();
    if (!nachname || String(r[cE - 1]).trim()) continue;
    const schluessel = norm(nachname) + '|' + norm(vorname);
    if (erledigt[schluessel]) continue;

    let mail = '', quelle = '';
    // passender Ordner: gleicher Nachname, bei mehreren zusätzlich gleiche PLZ
    let kand = ordnerNach[norm(nachname)] || [];
    if (kand.length > 1 && L.sp['PLZ']) {
      const plz = String(r[L.sp['PLZ'] - 1]).trim();
      kand = kand.filter(o => plz && o.getName().indexOf(plz) >= 0);
    }
    if (kand.length === 1) {
      const dateien = alleDateien_(kand[0]).filter(f => /pdf/i.test(f.getMimeType()));
      const bb = dateien.filter(f => /beiblatt/i.test(f.getName()) && !/rechnung/i.test(f.getName()))
        .sort((a, b) => b.getDateCreated() - a.getDateCreated())[0];
      if (bb) {
        try { const f = leseFormularfelder_(bb.getBlob().getBytes(), pako_()); if (gueltig(f['EMail'])) { mail = f['EMail'].trim(); quelle = 'Beiblatt'; } } catch (e) {}
      }
      if (!mail) {
        const vm = dateien.find(f => /_beg_vm\.pdf$/i.test(f.getName()));
        if (vm) {
          try { const f = leseFormularfelder_(vm.getBlob().getBytes(), pako_()); if (gueltig(f['EMailAdresse optional'])) { mail = f['EMailAdresse optional'].trim(); quelle = 'Vollmacht'; } } catch (e) {}
        }
      }
    }
    // gesendete BAFA-Mails, die den Kunden mit Namen ansprechen ("Herr/Frau <Nachname>" oder Name im Betreff)
    let gesendet = '';
    try {
      const fremd = /energieberatungmuenchen|eibner|regnath|bafa\.|qonto/i;
      const th = GmailApp.search('in:sent "' + nachname + '" subject:(Unterlagen OR Förderantrag OR BAFA OR Zuwendungsbescheid OR Festsetzungsbescheid OR Vollmacht)', 0, 10);
      const nn = norm(nachname);
      const msgs = [];
      th.forEach(t => t.getMessages().forEach(m => msgs.push(m)));
      msgs.sort((a, b) => a.getDate() - b.getDate()); // älteste zuerst = erste Kontaktaufnahme
      for (const m of msgs) {
        if (!/energieberatungmuenchen/i.test(m.getFrom())) continue;
        const betreff = norm(m.getSubject());
        const anrede = (m.getPlainBody().slice(0, 400).match(/(?:Herr|Frau)\s+([^\s,]+(?:-[^\s,]+)?)/) || [])[1];
        if (betreff.indexOf(nn) < 0 && norm(anrede) !== nn) continue;
        const adressen = (m.getTo() + ',' + m.getCc()).split(',').map(x => ((x.match(/<([^>]+)>/) || [null, x])[1] || '').trim()).filter(x => gueltig(x) && !fremd.test(x));
        if (adressen.length) { gesendet = adressen[0]; break; }
      }
    } catch (e) {}
    if (!mail && gesendet) { mail = gesendet; quelle = 'gesendete Mail'; }

    if (mail) {
      L.sh.getRange(row, cE).setValue(mail.toLowerCase());
      eingetragen.push(nachname + ', ' + vorname + ': ' + mail.toLowerCase() + ' (' + quelle + ')');
      if (gesendet && gesendet.toLowerCase() !== mail.toLowerCase()) abweichend.push(nachname + ': Beiblatt/Vollmacht ' + mail + ' – Mail ging an ' + gesendet);
    } else {
      fehlt.push(nachname + ', ' + vorname);
    }
    erledigt[schluessel] = 1;
  }
  props.setProperty('emailNachtrag_geprueft', JSON.stringify(erledigt));
  if (eingetragen.length) listeAktualisiert_(L);

  Logger.log('Eingetragen (' + eingetragen.length + '):\n' + eingetragen.join('\n'));
  if (abweichend.length) Logger.log('Bitte prüfen – unterschiedliche Adressen (' + abweichend.length + '):\n' + abweichend.join('\n'));
  Logger.log('Keine Adresse gefunden (' + fehlt.length + '):\n' + fehlt.join('\n'));
  Logger.log(fertig ? 'FERTIG – alle Zeilen geprüft.' : 'Zeit abgelaufen – bitte "emailsNachtragen" nochmal ausführen, es macht weiter.');
}

// ===================== TEST =====================
// Zeigt im Protokoll, was aus dem Beiblatt eines Ordners gelesen wird – ohne etwas anzulegen.
function testeBeiblatt() {
  const ORDNERNAME = 'Plümer 83109 Großkarolinenfeld'; // hier anpassen
  const o = ordnerListe_().find(x => x.getName() === ORDNERNAME);
  const bb = alleDateien_(o).find(f => /beiblatt/i.test(f.getName()));
  const felder = leseFormularfelder_(bb.getBlob().getBytes(), pako_());
  Object.keys(felder).forEach(k => Logger.log(k + ' = ' + felder[k]));
  Logger.log('→ Maßnahme (MN): ' + massnahmeKuerzel_(felder));
  const adr = adressenAusBeiblatt_(felder, ORDNERNAME, null, []);
  Logger.log('→ Wohnort geprüft: ' + adr.wohn.s + ', ' + adr.wohn.p + ' ' + adr.wohn.o);
  Logger.log('→ Investitionsstandort: ' + adr.inv.s + ', ' + adr.inv.p + ' ' + adr.inv.o + (adr.abweichend ? '  (ABWEICHEND)' : '  (identisch)'));
  Logger.log('→ Hinweis: ' + (adr.hinweis || 'keiner'));
}

// Zeigt im Protokoll, welche Anrede für Testnamen ermittelt wird.
function testeAnrede() {
  ['Adolf', 'Martina', 'Kay', 'Mark-Robin', 'Joaquin', 'Nural', 'Roxana', 'Traude', 'Abhilash', 'Bertram',
   'Mehmet', 'Ayşe', 'Fatma', 'Oluwaseun', 'Chiamaka', 'Thanh', 'Nguyen', 'Priya', 'Rajesh', 'Svetlana', 'Dmitri', 'Siobhan', 'Ngozi', 'Yuki', 'Hiroshi']
    .forEach(n => { const r = anredeErmitteln_(n); Logger.log(n + ' → ' + (r.anrede || '(unklar)') + (r.sicher ? '' : '  [geschätzt]')); });
}
