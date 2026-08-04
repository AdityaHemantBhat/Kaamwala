/* One-off verification for the as.ts dedup. Safe to delete. */
const fs = require('fs');

function lastValues(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const last = {};
  for (const line of lines) {
    const m = line.match(/^  '([^']+)': '((?:[^'\\]|\\.)*)'/);
    if (m) last[m[1]] = m[2];
  }
  return last;
}

const oldV = lastValues('/tmp/as.ts.bak');
const newV = lastValues('src/translations/as.ts');
const keys = Object.keys(oldV);
let mism = 0;
for (const k of keys) {
  if (newV[k] !== oldV[k]) {
    mism++;
    console.log('VALUE MISMATCH:', k, '=>', oldV[k], '|', newV[k]);
  }
}
console.log('Old keys:', keys.length, ' New keys:', Object.keys(newV).length);
console.log('Value mismatches (must be 0):', mism);

const first = fs.readFileSync('src/translations/as.ts', 'utf8').split('\n')[0];
console.log('First line:', first);
