module.exports = {
  "pipeline": {
    "build": [
      "^build"
    ],
    "clean": [],
    "docs": [],
    "lint": [],
    "lint:fix": [],
    "test": [
      "build"
    ],
    "test:integration": [],
    "cover": ["build"]
  },
  "npmClient": "pnpm"
};
