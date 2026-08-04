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

// New keys for timeline details
const newKeys = {
  en: {
    'Ban Type': 'Ban Type',
    'Unknown': 'Unknown',
    'Reason': 'Reason',
    'N/A': 'N/A',
    'Duration': 'Duration',
    'days': 'days',
    'IP Banned': 'IP Banned',
    'Yes': 'Yes',
    'No': 'No',
    'User was unbanned': 'User was unbanned',
  },
  hi: {
    'Ban Type': 'प्रतिबंध प्रकार',
    'Unknown': 'अज्ञात',
    'Reason': 'कारण',
    'N/A': 'लागू नहीं',
    'Duration': 'अवधि',
    'days': 'दिन',
    'IP Banned': 'आईपी प्रतिबंधित',
    'Yes': 'हाँ',
    'No': 'नहीं',
    'User was unbanned': 'उपयोगकर्ता को अनबैन किया गया',
  }
};

// Update en.ts
const enObj = readModule(path.join(dir, 'en.ts'));
Object.assign(enObj, newKeys.en);
writeModule(path.join(dir, 'en.ts'), 'en', enObj);
console.log('✅ en.ts updated with', Object.keys(newKeys.en).length, 'new keys');

// Update hi.ts
const hiObj = readModule(path.join(dir, 'hi.ts'));
Object.assign(hiObj, newKeys.hi);
writeModule(path.join(dir, 'hi.ts'), 'hi', hiObj);
console.log('✅ hi.ts updated with', Object.keys(newKeys.hi).length, 'new keys');

// Sync other languages with hi.ts
const otherLangs = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && !['en.ts', 'hi.ts'].includes(f));
otherLangs.forEach(file => {
  const langCode = path.basename(file, '.ts');
  const obj = readModule(path.join(dir, file));
  Object.assign(obj, newKeys.hi);
  writeModule(path.join(dir, file), langCode, obj);
});
console.log('✅ Other', otherLangs.length, 'languages synced with hi.ts');