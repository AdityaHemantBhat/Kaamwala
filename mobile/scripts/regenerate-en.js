const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), 'mobile', 'src', 'translations');

function readModule(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  let code = src
    .replace(/const \w+: Record<string, string> = /, '')
    .replace(/export default \w+;?\s*$/, '');
  const fn = new Function('return ' + code + ';');
  return fn();
}

function writeModule(filePath, langCode, obj) {
  const lines = ['const ' + langCode + ': Record<string, string> = {'];
  const keys = Object.keys(obj).sort();
  keys.forEach(k => {
    const v = JSON.stringify(obj[k]);
    lines.push("  " + JSON.stringify(k) + ': ' + v + ',');
  });
  lines.push('};');
  lines.push('export default ' + langCode + ';');
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

// Get complete key list from hi.ts
const hiObj = readModule(path.join(dir, 'hi.ts'));
console.log('hi.ts keys:', Object.keys(hiObj).length);

// Create fresh en.ts with key as value (proper English)
const freshEn = {};
Object.keys(hiObj).forEach(key => {
  freshEn[key] = key; // Use key as English value
});

writeModule(path.join(dir, 'en.ts'), 'en', freshEn);
console.log('✅ en.ts regenerated with', Object.keys(freshEn).length, 'keys (all English)');