const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'translations');

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.ts')).sort()) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'\s*,/gm;
  let m, total = 0, identity = 0, empty = 0;
  const identityExamples = [];
  while ((m = re.exec(src))) {
    total++;
    const k = m[1].replace(/\\'/g, "'");
    const v = m[2].replace(/\\'/g, "'");
    if (v === k) { identity++; if (identityExamples.length < 3) identityExamples.push(k); }
    if (v === '') empty++;
  }
  console.log(`${f}: total=${total} identity(untranslated)=${identity} empty=${empty}${identityExamples.length ? ' e.g. ' + identityExamples.map(JSON.stringify).join(', ') : ''}`);
}
