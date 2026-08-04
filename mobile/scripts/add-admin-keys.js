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

// New keys to add
const newKeys = {
  en: {
    'A reason is required': 'A reason is required',
    'User banned successfully': 'User banned successfully',
    'User unbanned successfully': 'User unbanned successfully',
    'Failed to load user': 'Failed to load user',
    'Failed to ban user': 'Failed to ban user',
    'Failed to unban user': 'Failed to unban user',
  },
  hi: {
    'A reason is required': 'कारण आवश्यक है',
    'User banned successfully': 'उपयोगकर्ता सफलतापूर्वक प्रतिबंधित',
    'User unbanned successfully': 'उपयोगकर्ता सफलतापूर्वक अनबैन',
    'Failed to load user': 'उपयोगकर्ता लोड करने में विफल',
    'Failed to ban user': 'उपयोगकर्ता प्रतिबंधित करने में विफल',
    'Failed to unban user': 'उपयोगकर्ता अनबैन करने में विफल',
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