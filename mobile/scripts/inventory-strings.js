/**
 * Inventory user-facing strings across the mobile app.
 * Extracts JSX text nodes and common string-bearing props, then compares
 * against existing translation keys to find the gap.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = [];

// ---- Extract existing keys ----
const hi = fs.readFileSync(path.join(SRC, 'translations', 'hi.ts'), 'utf8');
const existingKeys = new Set();
const keyRe = /^\s*'((?:[^'\\]|\\.)*)'\s*:/gm;
let m;
while ((m = keyRe.exec(hi))) existingKeys.add(m[1].replace(/\\'/g, "'"));

// ---- Walk tsx files ----
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.tsx')) collect(p);
  }
}

// props that carry user-facing text
const TEXT_PROPS = new Set([
  'placeholder', 'title', 'message', 'label', 'helperText', 'hint',
  'text', 'header', 'description', 'submitLabel', 'cancelLabel', 'confirmLabel',
  'prefix', 'emptyText', 'loadingText', 'errorText', 'toastMessage',
  'screenTitle', 'buttonText', 'validationMessage', 'successMessage',
]);

function collect(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const lines = src.split('\n');

  lines.forEach((line, idx) => {
    // JSX text node: > Some text <
    // match text with letters, not starting with { or <
    const textRe = />\s*([A-Za-z][^<>{}]{1,120}?)\s*</g;
    let tm;
    while ((tm = textRe.exec(line))) {
      const s = tm[1].trim();
      if (s.length >= 2 && !existingKeys.has(s)) {
        OUT.push({ file: rel, line: idx + 1, kind: 'jsx', s });
      }
    }

    // props with string values: prop="..."
    const propRe = new RegExp(
      `\\b(?:${[...TEXT_PROPS].join('|')})="([^"]{1,160})"`, 'g'
    );
    let pm;
    while ((pm = propRe.exec(line))) {
      const s = pm[1].trim();
      if (s.length >= 2 && !existingKeys.has(s)) {
        OUT.push({ file: rel, line: idx + 1, kind: 'prop', s });
      }
    }

    // string literals in calls we know carry text: t-adjacent or common UI calls
    // Alert.alert('title', 'msg'), Toast, setError('...'), throw new Error('...')
    const litRe = /\b(?:Alert\.alert|toast|setError|setMessage|throw new Error|snackbar|showToast)\(\s*'((?:[^'\\]|\\.){2,140})'/g;
    let lm;
    while ((lm = litRe.exec(line))) {
      const s = lm[1].replace(/\\'/g, "'").trim();
      if (!existingKeys.has(s)) {
        OUT.push({ file: rel, line: idx + 1, kind: 'call', s });
      }
    }
  });
}

walk(path.join(SRC, 'app'));
walk(path.join(SRC, 'components'));

// ---- Report ----
const byFile = {};
for (const o of OUT) {
  (byFile[o.file] = byFile[o.file] || []).push(o);
}
let total = 0;
for (const f of Object.keys(byFile).sort()) {
  const items = byFile[f];
  total += items.length;
  console.log(`\n===== ${f} (${items.length}) =====`);
  for (const it of items) {
    console.log(`  L${it.line} [${it.kind}] ${it.s}`);
  }
}
console.log(`\n\nTOTAL candidate strings: ${total}`);
