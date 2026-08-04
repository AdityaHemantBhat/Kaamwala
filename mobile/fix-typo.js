const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/(customer)/post-request.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Step 1: Fix the corrupted monoBold first
content = content.replace(/"SpaceMono_400Regular"Bold/g, '"SpaceMono_700Bold"');

// Step 2: Replace all Typography spreads with explicit fontFamily
// Order matters: more specific patterns first
const replacements = [
  ['...Typography.monoBold', 'fontFamily: "SpaceMono_700Bold"'],
  ['...Typography.mono', 'fontFamily: "SpaceMono_400Regular"'],
  ['...Typography.bodyBold', 'fontFamily: "Inter_700Bold"'],
  ['...Typography.bodyMed', 'fontFamily: "Inter_500Medium"'],
  ['...Typography.body', 'fontFamily: "Inter_400Regular"'],
  ['...Typography.heading', 'fontFamily: "Poppins_700Bold", letterSpacing: 1, textTransform: "uppercase"'],
  ['...Typography.display', 'fontFamily: "Poppins_800ExtraBold", letterSpacing: -1'],
  ['...Typography.subhead', 'fontFamily: "Poppins_600SemiBold", letterSpacing: 0.3'],
  ['...Typography.label', 'fontFamily: "Poppins_500Medium", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 11'],
];

let count = 0;
for (const [from, to] of replacements) {
  let idx = content.indexOf(from);
  while (idx !== -1) {
    content = content.substring(0, idx) + to + content.substring(idx + from.length);
    count++;
    idx = content.indexOf(from);
  }
}

fs.writeFileSync(filePath, content);
console.log(`Replaced ${count} Typography spreads`);

// Verify
if (content.includes('"SpaceMono_400Regular"Bold')) {
  console.log('ERROR: Still has corrupted monoBold!');
} else if (content.includes('...Typography.')) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('...Typography.')) {
      console.log(`Remaining at line ${i + 1}: ${lines[i].trim()}`);
    }
  }
  console.log('ERROR: Some Typography spreads remain!');
} else {
  console.log('OK: All clean');
}
