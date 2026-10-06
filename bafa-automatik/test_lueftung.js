const fs = require('fs'), path = require('path'), os = require('os');
const MOD = path.join(os.tmpdir(), 'lueftung_test_mod.js');
const src = fs.readFileSync(process.argv[2], 'utf8');
function grab(re) { const m = src.match(re); if (!m) throw new Error('nicht gefunden: ' + re); return m[0]; }
const code = [
  grab(/function ohneAkzente_[\s\S]*?\n}\n/),
  grab(/const FESTSETZUNG_WEITERE_BERATUNG = .*\n/),
  grab(/const LUEFTUNG_PREIS = .*\n/),
  grab(/const LUEFTUNG_HINWEIS = \[[\s\S]*?\]\.join\('\\n'\);\n/),
  grab(/const LUEFTUNG_HINWEIS_RECHNUNG = .*\n/),
  grab(/let _lueftungEigene = null;[\s\S]*?\nfunction lueftungsAnfragenMelden_/).replace(/\nfunction lueftungsAnfragenMelden_$/, ''),
].join('\n') + '\nmodule.exports={lueftungVomKunden_, LUEFTUNG_HINWEIS, FESTSETZUNG_WEITERE_BERATUNG, LUEFTUNG_HINWEIS_RECHNUNG};';
fs.writeFileSync(MOD, code);
const M = require(MOD);
const mail = 'Sehr geehrter Herr Muster,\n\nvielen Dank ...\n\nWichtig: Das BAFA akzeptiert ...\n\n' + M.LUEFTUNG_HINWEIS + '\n\nMit freundlichen Grüßen\nAmina Lemzouri';
const q = t => t.split('\n').map(l => '> ' + l).join('\n');
const wrap = (t, n) => t.split('\n').map(l => { const out = []; let cur = ''; l.split(' ').forEach(w => { if ((cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }); out.push(cur); return out.join('\n'); }).join('\n');
const faelle = [
  ['Gmail oben, nur Vollmacht', 'Anbei die Vollmacht.\n\nAm Mo., 6. Okt. 2026 um 10:00 Uhr schrieb Amina <info@x.de>:\n' + q(wrap(mail, 76)), false],
  ['Outlook ohne >, nur Vollmacht', 'Anbei die Vollmacht.\n\nVon: Amina\nGesendet: Montag\n' + mail, false],
  ['Yahoo eingerückt, nur Vollmacht', 'Anbei die Vollmacht.\n\n    Am Montag, 6. Oktober 2026 um 10:15:23 MESZ hat Amina Lemzouri <info@energieberatungmuenchen.com> Folgendes geschrieben:\n' + wrap(mail, 70).split('\n').map(l => '    ' + l).join('\n'), false],
  ['Outlook € als EUR', 'Danke.\n\nVon: A\n' + mail.replace('299 €', '299 EUR'), false],
  ['Gmail oben, Lüftung gewünscht', 'Ja, bitte erstellen Sie auch das Lüftungskonzept.\n\nAm ... schrieb A:\n' + q(mail), true],
  ['Unten geantwortet (Thunderbird)', 'Am 06.10.2026 um 10:00 schrieb A:\n' + q(mail) + '\n\nJa, bitte das Lüftungskonzept erstellen.', true],
  ['Genitiv', 'Wegen des Lüftungskonzepts: gerne.\n\nVon: A\n' + mail, true],
  ['nur Betreff', ['Lüftungskonzept', 'Ja gerne, bitte erstellen.'], true],
  ['Antwort auf Festsetzung', 'Vielen Dank!\n\nAm ... schrieb A:\n' + 'Hallo,\n' + M.FESTSETZUNG_WEITERE_BERATUNG, false],
  ['Rechnungs-Fußzeile zitiert', 'Rechnung bezahlt.\n\n' + M.LUEFTUNG_HINWEIS_RECHNUNG, false],
  ['gelüftet ohne Lüftung', 'Wir haben gelüftet, alles gut.', false],
];
let ok = true;
for (const [name, inh, soll] of faelle) {
  const [betreff, text] = Array.isArray(inh) ? inh : ['AW: Ihr Förderantrag Eibner & Regnath / benötigte Unterlagen Muster', inh];
  const ist = M.lueftungVomKunden_(betreff, text);
  console.log((ist === soll ? 'OK  ' : 'FEHLER') + ' ' + name + ' → ' + ist);
  if (ist !== soll) ok = false;
}
process.exit(ok ? 0 : 1);
