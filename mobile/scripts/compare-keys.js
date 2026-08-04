const fs = require('fs');
const path = require('path');
// Use absolute path from current working directory
const dir = path.join(process.cwd(), 'mobile', 'src', 'translations');

function readModule(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  // Remove TypeScript type annotation and export
  let code = src
    .replace(/const \w+: Record<string, string> = /, '')
    .replace(/export default \w+;?\s*$/, '');

  // Use Function to evaluate the object
  const fn = new Function('return ' + code + ';');
  return fn();
}

const hiObj = readModule(path.join(dir, 'hi.ts'));
console.log('hi.ts keys:', Object.keys(hiObj).length);

const enObj = readModule(path.join(dir, 'en.ts'));
console.log('en.ts keys:', Object.keys(enObj).length);

const missingInEn = Object.keys(hiObj).filter(k => !enObj[k]);
console.log('\nMissing in en.ts:', missingInEn.length);
missingInEn.slice(0, 50).forEach(k => console.log('  - ' + k));