module.exports = {
  "pipeline": {
    "build": {
      "dependsOn": [
        "^build"
      ],
      "outputs": [
        "lib/**/*",
        "dist/**/*"
      ]
    },
    "clean": {
      "cache": false
    },
    "docs": {
      "cache": false
    },
    "lint": {
      "cache": false
    },
    "lint:fix": {
      "cache": false
    },
    "test": {
      "dependsOn": [
        "build"
      ],
      "cache": false
    },
    "test:integration": {
      "cache": false
    },
    "cover": {
      "dependsOn": [
        "build"
      ],
      "cache": false
    }
  },
  "npmClient": "pnpm"
};
