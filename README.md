# iTwin.js Authorization clients

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

[iTwin.js](http://www.itwinjs.org) is an open source platform for creating, querying, modifying, and displaying Infrastructure Digital Twins.

If you have questions, or wish to contribute to iTwin.js, see our [Contributing guide](https://github.com/iTwin/itwinjs-core/blob/master/CONTRIBUTING.md).

## About this Repository

This repository contains a few OAuth 2.0 client libraries to assist in authenticating with the iTwin Platform in TypeScript/JavaScript.

There are 3 clients in the repository, each of them corresponding to one of the application types supported by the iTwin Platform. See the [authorization documentation](https://developer.bentley.com/apis/overview/authorization/) for more details on the Authorization workflows supported.

- [Browser/SPA](./packages/browser/README.md)
- [Desktop/Electron](./packages/electron/README.md)
- [Service](./packages/service/README.md)

In addition, the [OIDC Signin Tool](./packages/oidc-signin-tool/README.md) is a test helper package to automate the sign-in workflow to aid in writing integration tests.

There is also an [authorization client for command-line developer tools](./packages/node-cli/README.md).

## Prerequisites

- [Node](https://nodejs.org/en/): an installation of the latest security patch of Node 18. The Node installation also includes the **npm** package manager.
- [pnpm](https://pnpm.io/): [prefer installation via npm corepack](https://pnpm.io/installation#using-corepack)

## Build Instructions

1. Clone repository (first time) with `git clone` or pull updates to the repository (subsequent times) with `git pull`
2. Install dependencies: `pnpm update` or `pnpm install`
3. Build source: `pnpm build`
4. Run tests: `pnpm cover`

> Note: Sometimes lage's cache will become stale and it may refuse to build projects you've changed. If this or other odd behavior occurs on build, add the [`--reset-cache` flag](https://microsoft.github.io/lage/docs/Tutorial/cache/) to the `pnpm build` command.

## Extract Documentation

`pnpm run docs`
