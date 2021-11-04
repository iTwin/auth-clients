# iTwin.js

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

[iTwin.js](http://www.itwinjs.org) is an open source platform for creating, querying, modifying, and displaying Infrastructure Digital Twins.

If you have questions, or wish to contribute to iTwin.js, see our [Contributing guide](https://github.com/iTwin/itwinjs-core/blob/master/CONTRIBUTING.md).

## About this Repository

This repository contains a few OAuth 2.0 client libraries to assist in authenticating with the iTwin Platform in TypeScript/JavaScript.

There are 3 clients in the repository to the common workflows. Each one covers one of the workflows in the iTwin Platform [authorization documentation](https://developer.bentley.com/apis/overview/authorization/).

- [Browser/SPA](./packages/browser/README.md)
- [Desktop/Electron](./packages/electron/README.md)
- [Service](./packages/service/README.md) in order to handle the .

In addition, the [OIDC Signin Tool](./packages/oidc-signin-tool/README.md) is a test helper package to automate the sign-in workflow to aid writing integration tests.
