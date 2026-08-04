const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'translations');

function getKeys(file) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
  const set = new Set();
  let m;
  while ((m = re.exec(src))) set.add(m[1].replace(/\\'/g, "'"));
  return set;
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.ts')).sort();
const sets = files.map(f => ({ file: f, keys: getKeys(f) }));
const ref = sets[0].keys;
console.log(`Reference file: ${sets[0].file} (${ref.size} keys)`);
for (const s of sets) {
  const diff = ref.size - s.keys.size;
  if (diff !== 0) {
    console.log(`  ${s.file}: ${s.keys.size} keys (${diff > 0 ? 'MISSING ' + diff : 'EXTRA ' + (-diff)})`);
    const missing = [...ref].filter(k => !s.keys.has(k));
    if (missing.length) console.log(`    e.g. missing: ${missing.slice(0, 5).map(x => JSON.stringify(x)).join(', ')}`);
    const extra = [...s.keys].filter(k => !ref.has(k));
    if (extra.length) console.log(`    e.g. extra: ${extra.slice(0, 5).map(x => JSON.stringify(x)).join(', ')}`);
  } else {
    const missing = [...ref].filter(k => !s.keys.has(k));
    if (missing.length) {
      console.log(`  ${s.file}: same count but differing keys (${missing.length} missing)`);
    } else {
      console.log(`  ${s.file}: ${s.keys.size} keys — OK`);
    }
  }
}
