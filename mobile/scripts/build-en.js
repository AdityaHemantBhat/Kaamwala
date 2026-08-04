/**
 * Builds the canonical English key list for en.ts.
 * Source of truth = every t('...') key referenced in source code (tsx + ts,
 * excluding translations), merged with the existing key set so nothing is lost.
 * Writes sorted unique keys to scripts/en-keys.json
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src');
const OUT = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !p.includes('translations')) collect(p);
  }
}

function collect(file) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /\bt\(\s*(?:`|"|')((?:[^`"'\\]|\\.)*)(?:`|"|')\s*[,)]/g;
  let m;
  while ((m = re.exec(src))) {
    const k = m[1].replace(/\\'/g, "'").trim();
    if (k) OUT.push(k);
  }
}

// Seed with existing keys so nothing is lost
const hi = fs.readFileSync(path.join(ROOT, 'translations', 'hi.ts'), 'utf8');
const keyRe = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
let m;
while ((m = keyRe.exec(hi))) OUT.push(m[1].replace(/\\'/g, "'"));

walk(ROOT);

const unique = [...new Set(OUT)].sort();
fs.writeFileSync(path.join(__dirname, 'en-keys.json'), JSON.stringify(unique, null, 0));
console.log(`Wrote ${unique.length} unique keys to scripts/en-keys.json`);
