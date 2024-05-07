const iTwinPlugin = require("@itwin/eslint-plugin");

module.exports = [
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...iTwinPlugin.configs.jsdocConfig,
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-duplicate-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
