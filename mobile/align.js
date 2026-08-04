const fs = require('fs');

const expected = {
  "@react-native-async-storage/async-storage": "2.2.0",
  "babel-preset-expo": "~57.0.0",
  "expo": "~57.0.9",
  "expo-blur": "~57.0.2",
  "expo-camera": "~57.0.3",
  "expo-constants": "~57.0.8",
  "expo-dev-client": "~57.0.10",
  "expo-font": "~57.0.1",
  "expo-haptics": "~57.0.1",
  "expo-image-picker": "~57.0.7",
  "expo-linking": "~57.0.4",
  "expo-location": "~57.0.7",
  "expo-notifications": "~57.0.8",
  "expo-router": "~57.0.9",
  "expo-secure-store": "~57.0.1",
  "expo-status-bar": "~57.0.1",
  "react": "19.2.3",
  "react-native": "0.86.2",
  "react-native-gesture-handler": "~2.32.0",
  "react-native-maps": "1.27.2",
  "react-native-reanimated": "4.5.1",
  "react-native-safe-area-context": "~5.7.0",
  "react-native-screens": "~4.26.0",
  "react-native-svg": "15.15.4",
  "react-native-worklets": "0.10.1",
  "expo-image": "~57.0.1",
  "expo-web-browser": "~57.0.2"
};

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

for (const [key, val] of Object.entries(expected)) {
  if (pkg.dependencies && pkg.dependencies[key]) {
    pkg.dependencies[key] = val;
  }
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated package.json');
