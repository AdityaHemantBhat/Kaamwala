const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'src');

const hi = fs.readFileSync(path.join(ROOT, 'translations', 'hi.ts'), 'utf8');
const keys = new Set();
const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
let m;
while ((m = re.exec(hi))) keys.add(m[1].replace(/\\'/g, "'"));

const used = new Map();
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !p.includes('translations')) collect(p);
  }
}
function collect(f) {
  const src = fs.readFileSync(f, 'utf8');
  const tRe = /\bt\(\s*(?:`|"|')((?:[^`"'\\]|\\.)*)(?:`|"|')\s*[,)]/g;
  let m;
  while ((m = tRe.exec(src))) {
    const k = m[1].replace(/\\'/g, "'").trim();
    if (!k) continue;
    if (!used.has(k)) used.set(k, []);
    used.get(k).push(path.relative(path.join(__dirname, '..'), f));
  }
}
walk(ROOT);
let missing = 0;
for (const [k, files] of [...used.entries()].sort()) {
  if (!keys.has(k)) {
    missing++;
    console.log(`MISSING: ${JSON.stringify(k)}  <= ${[...new Set(files)].join(', ')}`);
  }
}
console.log('\nTotal t() keys referenced:', used.size);
console.log('Missing from translations:', missing);
