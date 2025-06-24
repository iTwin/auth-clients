const iTwinPlugin = require("@itwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.jsdocConfig,
    ignores: ["src/integration-test/**/*", "src/test/**/*"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-duplicate-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
