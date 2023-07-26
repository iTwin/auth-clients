module.exports = {
  "pipeline": {
    "build": [
      "^build"
    ],
    "clean": [],
    "docs": [],
    "lint": [],
    "test": [
      "build"
    ],
    "test:integration": []
  },
  "npmClient": "pnpm"
};