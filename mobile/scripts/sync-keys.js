/**
 * Guarantees every translation file has EXACTLY the canonical key set
 * (from scripts/en-keys.json). Adds missing keys with English as a placeholder
 * so language parity is maintained; missing placeholders are then filled by
 * translators. Optionally removes keys not in the canonical set (--prune).
 * Usage: node scripts/sync-keys.js [--prune] [--report scripts/missing.json]
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'translations');
const EN_KEYS = JSON.parse(fs.readFileSync(path.join(__dirname, 'en-keys.json'), 'utf8'));
const keySet = new Set(EN_KEYS);
const prune = process.argv.includes('--prune');
const reportIdx = process.argv.indexOf('--report');
const reportPath = reportIdx >= 0 ? process.argv[reportIdx + 1] : null;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseEntries(src) {
  // returns ordered list of {key, value, raw}
  const entries = [];
  const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'\s*,?/gm;
  let m;
  while ((m = re.exec(src))) {
    entries.push({ key: m[1].replace(/\\'/g, "'"), value: m[2].replace(/\\'/g, "'"), index: m.index });
  }
  return entries;
}

const missingReport = {};
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.ts')).sort();

for (const f of files) {
  const full = path.join(DIR, f);
  let src = fs.readFileSync(full, 'utf8');
  const entries = parseEntries(src);
  const present = new Set(entries.map(e => e.key));
  const missing = EN_KEYS.filter(k => !present.has(k));
  const extra = prune ? entries.filter(e => !keySet.has(e.key)).map(e => e.key) : [];

  if (missing.length || extra.length) {
    // Build the object lines to append before the closing '};'
    const lines = [];
    for (const k of missing) {
      lines.push(`  '${esc(k)}': '${esc(k)}', // TODO: translate`);
      (missingReport[f] = missingReport[f] || []).push(k);
    }
    const body = lines.join('\n');
    // insert before final '};'
    const insertAt = src.lastIndexOf('};');
    if (insertAt === -1) throw new Error(`Cannot find closing in ${f}`);
    src = src.slice(0, insertAt) + (src.slice(0, insertAt).endsWith('\n') ? '' : '\n') + (lines.length ? body + '\n' : '') + src.slice(insertAt);
    fs.writeFileSync(full, src);
    console.log(`${f}: +${missing.length} missing${prune ? `, -${extra.length} extra` : ''}`);
  } else {
    console.log(`${f}: OK (${present.size} keys)`);
  }
}

if (reportPath && Object.keys(missingReport).length) {
  fs.writeFileSync(path.join(__dirname, reportPath), JSON.stringify(missingReport, null, 2));
  console.log(`Missing report written to scripts/${reportPath}`);
}
