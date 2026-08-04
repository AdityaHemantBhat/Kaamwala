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

// New keys for accessibility
const newKeys = {
  en: {
    'Phone number': 'Phone number',
    'Get OTP': 'Get OTP',
    'View terms and privacy policy': 'View terms and privacy policy',
    'Verify code': 'Verify code',
    'Resend code': 'Resend code',
  },
  hi: {
    'Phone number': 'फोन नंबर',
    'Get OTP': 'OTP प्राप्त करें',
    'View terms and privacy policy': 'नियम और गोपनीयता नीति देखें',
    'Verify code': 'कोड सत्यापित करें',
    'Resend code': 'कोड पुनः भेजें',
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