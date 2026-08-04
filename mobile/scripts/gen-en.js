/**
 * Generates src/translations/en.ts from the canonical key list.
 * Keys are grouped to mirror the existing hi.ts section order; new keys are
 * appended in a final sorted section. Values are identity (English === key).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const EN_KEYS = JSON.parse(fs.readFileSync(path.join(__dirname, 'en-keys.json'), 'utf8'));
const hi = fs.readFileSync(path.join(ROOT, 'src', 'translations', 'hi.ts'), 'utf8');

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Order existing keys by their appearance in hi.ts (preserves feature grouping)
const order = [];
const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
let m;
while ((m = re.exec(hi))) order.push(m[1].replace(/\\'/g, "'"));

const set = new Set(EN_KEYS);
const ordered = order.filter(k => set.has(k));
const appended = EN_KEYS.filter(k => !order.includes(k)).sort();

let body = "const en: Record<string, string> = {\n";
for (const k of ordered) {
  body += `  '${esc(k)}': '${esc(k)}',\n`;
}
if (appended.length) {
  body += "\n  // --- Additional keys ---\n";
  for (const k of appended) {
    body += `  '${esc(k)}': '${esc(k)}',\n`;
  }
}
body += "};\n\nexport default en;\n";

fs.writeFileSync(path.join(ROOT, 'src', 'translations', 'en.ts'), body);
console.log(`Wrote en.ts (${EN_KEYS.length} keys: ${ordered.length} existing-order, ${appended.length} appended)`);
