const iTwinPlugin = require("@itwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/test-integration/**"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/test-integration/**"],
    ...iTwinPlugin.configs.jsdocConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/test-integration/**"],
    rules: {
      "no-duplicate-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
