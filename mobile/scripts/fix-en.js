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

// Read hi.ts to get the complete key list
const hiObj = readModule(path.join(dir, 'hi.ts'));
console.log('Source hi.ts keys:', Object.keys(hiObj).length);

// Read en.ts - use its existing English values where available, add missing with key as value
const enObj = readModule(path.join(dir, 'en.ts'));
console.log('Current en.ts keys:', Object.keys(enObj).length);

// For each key in hiObj, ensure enObj has it with English value (fallback to key itself)
Object.keys(hiObj).forEach(key => {
  if (!enObj[key]) {
    enObj[key] = key; // Use the key itself as English value
  }
});

writeModule(path.join(dir, 'en.ts'), 'en', enObj);
console.log('✅ en.ts updated with', Object.keys(enObj).length, 'keys (all English)');