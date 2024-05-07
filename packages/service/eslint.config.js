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
  {
    files: ["src/test/Introspection.test.ts"],
    rules: {
      "@typescript-eslint/dot-notation": [
        "error",
        {
          allowPrivateClassPropertyAccess: true,
        },
      ],
      "dot-notation": "off",
    },
  },
];
