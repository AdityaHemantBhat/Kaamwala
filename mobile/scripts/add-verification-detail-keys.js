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

// New keys for admin verification detail
const newKeys = {
  en: {
    'Document Unreadable': 'Document Unreadable',
    'Document Incomplete': 'Document Incomplete',
    'Wrong Document Type': 'Wrong Document Type',
    'Selfie Unclear': 'Selfie Unclear',
    'Information Could Not Be Reviewed': 'Information Could Not Be Reviewed',
    'Document Appears Invalid': 'Document Appears Invalid',
    'Reason': 'Reason',
    'Additional Note (Optional)': 'Additional Note (Optional)',
    'Provide more details to the worker...': 'Provide more details to the worker...',
    'Cancel': 'Cancel',
    'Confirm': 'Confirm',
  },
  hi: {
    'Document Unreadable': 'दस्तावेज़ अपठनीय',
    'Document Incomplete': 'दस्तावेज़ अधूरा',
    'Wrong Document Type': 'गलत दस्तावेज़ प्रकार',
    'Selfie Unclear': 'सेल्फी अस्पष्ट',
    'Information Could Not Be Reviewed': 'जानकारी की समीक्षा नहीं की जा सकी',
    'Document Appears Invalid': 'दस्तावेज़ अमान्य प्रतीत होता है',
    'Reason': 'कारण',
    'Additional Note (Optional)': 'अतिरिक्त नोट (वैकल्पिक)',
    'Provide more details to the worker...': 'कार्यकर्ता को अधिक विवरण प्रदान करें...',
    'Cancel': 'रद्द करें',
    'Confirm': 'पुष्टि करें',
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