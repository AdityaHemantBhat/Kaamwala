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

// Read hi.ts as the source of truth (most complete)
const hiObj = readModule(path.join(dir, 'hi.ts'));
console.log('Source hi.ts keys:', Object.keys(hiObj).length);

// Read all language files
const langFiles = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'hi.ts');

langFiles.forEach(file => {
  const langCode = path.basename(file, '.ts');
  const filePath = path.join(dir, file);
  const obj = readModule(filePath);

  let added = 0;
  Object.keys(hiObj).forEach(key => {
    if (!obj[key]) {
      obj[key] = hiObj[key]; // Use Hindi as fallback for now
      added++;
    }
  });

  if (added > 0) {
    writeModule(filePath, langCode, obj);
    console.log(`✅ ${file}: added ${added} keys (total: ${Object.keys(obj).length})`);
  } else {
    console.log(`⏭ ${file}: already complete (${Object.keys(obj).length} keys)`);
  }
});

console.log('\n🎉 All translation files synchronized with hi.ts keys!');