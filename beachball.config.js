/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @type {import("beachball").BeachballConfig } */
module.exports = {
  bumpDeps: false,
  access: "public",
  tag: "latest",
  ignorePatterns: [
    ".nycrc",
    "eslint.config.js",
    "tsconfig.*",
    ".*ignore",
    ".github/**",
    ".vscode/**",
    "pnpm-lock.yaml",
    "**/integration-test*/**",
    "**/test/**",
  ],
  changehint: "Run 'pnpm change' to generate a change file",
};