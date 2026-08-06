// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const { node } = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Build/utility scripts run under Node (CommonJS or ESM), not the app
    // bundler — expose the Node globals (__dirname, Buffer, process, ...) so
    // eslint doesn't flag `'__dirname' is not defined` inside scripts.
    files: ['scripts/**/*.{js,mjs}', '*.{js,mjs}'],
    languageOptions: {
      globals: { ...node },
    },
  },
  {
    // React Compiler is NOT enabled in this project (no experiments.reactCompiler
    // in app.json), so these eslint-plugin-react-hooks v7 compiler diagnostics
    // don't reflect any runtime behavior here. They over-report patterns that are
    // correct at runtime in this app:
    //   - reanimated shared-value mutation (`value.value = X` is the SDK's API)
    //   - legacy RN Animated.Value refs read during render (its documented usage)
    //   - mount-time "reset + fetch" effects and effect-synced store state
    // Downgrade to warnings so they stay visible without blocking the build.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  }
]);
