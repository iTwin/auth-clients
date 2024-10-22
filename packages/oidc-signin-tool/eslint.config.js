const iTwinPlugin = require("@itwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/test-integration/**", "**/test/**"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/test-integration/**", "**/test/**"],
    ...iTwinPlugin.configs.jsdocConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/test-integration/**", "**/test/**"],
    rules: {
      "no-duplicate-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
