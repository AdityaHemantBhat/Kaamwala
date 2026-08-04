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
    'Account Suspended': 'Account Suspended',
    'Your account has been suspended for violating our Terms of Service.': 'Your account has been suspended for violating our Terms of Service.',
    'You can no longer access the platform.': 'You can no longer access the platform.',
    'Suspension Details': 'Suspension Details',
    'Type': 'Type',
    'Permanent Ban': 'Permanent Ban',
    'Temporary Suspension': 'Temporary Suspension',
    'Reason': 'Reason',
    'Administrative decision': 'Administrative decision',
    'Expires On': 'Expires On',
    'Contact Support': 'Contact Support',
    'Sign Out': 'Sign Out',
    'Support team will contact you shortly.': 'Support team will contact you shortly.',
  },
  hi: {
    'Account Suspended': 'खाता निलंबित',
    'Your account has been suspended for violating our Terms of Service.': 'आपका खाता हमारी सेवा की शर्तों का उल्लंघन करने के लिए निलंबित कर दिया गया है।',
    'You can no longer access the platform.': 'आप अब प्लेटफॉर्म तक नहीं पहुंच सकते।',
    'Suspension Details': 'निलंबन विवरण',
    'Type': 'प्रकार',
    'Permanent Ban': 'स्थायी प्रतिबंध',
    'Temporary Suspension': 'अस्थायी निलंबन',
    'Reason': 'कारण',
    'Administrative decision': 'प्रशासनिक निर्णय',
    'Expires On': 'समाप्ति तिथि',
    'Contact Support': 'सहायता से संपर्क करें',
    'Sign Out': 'साइन आउट',
    'Support team will contact you shortly.': 'सहायता टीम जल्द ही आपसे संपर्क करेगी।',
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