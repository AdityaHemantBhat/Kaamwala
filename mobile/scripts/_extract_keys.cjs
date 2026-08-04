const fs = require('fs');
const hi = fs.readFileSync('src/translations/hi.ts', 'utf8');
const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
let m;
const keys = [];
while ((m = re.exec(hi))) keys.push(m[1].replace(/\\'/g, "'"));
console.log('total keys:', keys.length);
fs.writeFileSync('scripts/_existing_keys.json', JSON.stringify(keys));
console.log('written scripts/_existing_keys.json');
