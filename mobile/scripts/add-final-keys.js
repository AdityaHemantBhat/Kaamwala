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

// New keys for various screens
const newKeys = {
  en: {
    'Approve': 'Approve',
    'Reject': 'Reject',
    'Verifications': 'Verifications',
    'Withdrawals': 'Withdrawals',
    'No workers found': 'No workers found',
    'Workers Verification': 'Workers Verification',
    'Market Pricing': 'Market Pricing',
    'Pending Review': 'Pending Review',
    'Reject Submission': 'Reject Submission',
    'Request Resubmission': 'Request Resubmission',
    'Consent Provided': 'Consent Provided',
    'Worker Information': 'Worker Information',
    'Location': 'Location',
    'Joined': 'Joined',
    'Consent Date': 'Consent Date',
    'Previous Submissions': 'Previous Submissions',
    'Documents': 'Documents',
    'Submitted on': 'Submitted on',
    'Image unavailable': 'Image unavailable',
  },
  hi: {
    'Approve': 'स्वीकृत करें',
    'Reject': 'अस्वीकार करें',
    'Verifications': 'सत्यापन',
    'Withdrawals': 'निकासी',
    'No workers found': 'कोई कर्मचारी नहीं मिला',
    'Workers Verification': 'कर्मचारी सत्यापन',
    'Market Pricing': 'बाजार मूल्य निर्धारण',
    'Pending Review': 'समीक्षा लंबित',
    'Reject Submission': 'प्रस्तुति अस्वीकार करें',
    'Request Resubmission': 'पुनः प्रस्तुति का अनुरोध',
    'Consent Provided': 'सहमति दी गई',
    'Worker Information': 'कर्मचारी जानकारी',
    'Location': 'स्थान',
    'Joined': 'शामिल हुए',
    'Consent Date': 'सहमति तिथि',
    'Previous Submissions': 'पिछली प्रस्तुतियाँ',
    'Documents': 'दस्तावेज़',
    'Submitted on': 'जमा किया गया',
    'Image unavailable': 'छवि अनुपलब्ध',
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