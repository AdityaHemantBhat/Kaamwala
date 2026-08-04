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
    'User Profile': 'User Profile',
    'Activity Timeline': 'Activity Timeline',
    'No recent activity found.': 'No recent activity found.',
    'Logged In': 'Logged In',
    'IP:': 'IP:',
    'Unban User': 'Unban User',
    'Ban User': 'Ban User',
    'Configure Ban': 'Configure Ban',
    'Ban Type': 'Ban Type',
    'Temporary': 'Temporary',
    'Permanent': 'Permanent',
    'Duration (Days)': 'Duration (Days)',
    'Reason (Required)': 'Reason (Required)',
    'Why is this user being banned?': 'Why is this user being banned?',
    'Ban IP Address': 'Ban IP Address',
    'Prevent new accounts from this IP': 'Prevent new accounts from this IP',
    'Cancel': 'Cancel',
    'Apply Ban': 'Apply Ban',
    'Ban Type:': 'Ban Type:',
    'Reason:': 'Reason:',
    'Duration:': 'Duration:',
    'days': 'days',
    'IP Banned:': 'IP Banned:',
    'Yes': 'Yes',
    'No': 'No',
    'User was unbanned': 'User was unbanned',
  },
  hi: {
    'User Profile': 'उपयोगकर्ता प्रोफ़ाइल',
    'Activity Timeline': 'गतिविधि टाइमलाइन',
    'No recent activity found.': 'कोई हालिया गतिविधि नहीं मिली।',
    'Logged In': 'लॉग इन किया',
    'IP:': 'आईपी:',
    'Unban User': 'उपयोगकर्ता अनबैन करें',
    'Ban User': 'उपयोगकर्ता प्रतिबंधित करें',
    'Configure Ban': 'प्रतिबंध कॉन्फ़िगर करें',
    'Ban Type': 'प्रतिबंध प्रकार',
    'Temporary': 'अस्थायी',
    'Permanent': 'स्थायी',
    'Duration (Days)': 'अवधि (दिन)',
    'Reason (Required)': 'कारण (आवश्यक)',
    'Why is this user being banned?': 'इस उपयोगकर्ता को क्यों प्रतिबंधित किया जा रहा है?',
    'Ban IP Address': 'आईपी पता प्रतिबंधित करें',
    'Prevent new accounts from this IP': 'इस आईपी से नए खातों को रोकें',
    'Cancel': 'रद्द करें',
    'Apply Ban': 'प्रतिबंध लागू करें',
    'Ban Type:': 'प्रतिबंध प्रकार:',
    'Reason:': 'कारण:',
    'Duration:': 'अवधि:',
    'days': 'दिन',
    'IP Banned:': 'आईपी प्रतिबंधित:',
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