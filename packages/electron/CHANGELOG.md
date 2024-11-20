# Change Log - @itwin/electron-authorization

This log was last generated on Wed, 20 Nov 2024 18:34:06 GMT and should not be manually modified.

<!-- Start content -->

## 0.19.7

Wed, 20 Nov 2024 18:34:06 GMT

### Patches

- Update to username v7.0.0 (33036725+wgoehrig@users.noreply.github.com)

## 0.19.6

Tue, 29 Oct 2024 21:49:00 GMT

### Patches

- Add support for Electron 33 (GytisCepk@users.noreply.github.com)
- Add support for Electron 32 (GytisCepk@users.noreply.github.com)

## 0.19.5

Tue, 02 Jul 2024 22:24:53 GMT

### Patches

- Add support for Electron 31 (GytisCepk@users.noreply.github.com)
- Add missing CJS and ESM support for subpath imports (50554904+hl662@users.noreply.github.com)

## 0.19.4

Tue, 18 Jun 2024 19:11:49 GMT

### Patches

- fix latest sec vulnerabilities; run audit during ci (ben-polinsky@users.noreply.github.com)

## 0.19.3

Tue, 11 Jun 2024 21:25:12 GMT

### Patches

- Only listen on hostname and port provided in redirectUris. Previously, we would listen on any local interface with the selected port. (ben-polinsky@users.noreply.github.com)

## 0.19.2

Wed, 08 May 2024 21:11:26 GMT

### Patches

- clean up `this` usage (ben-polinsky@users.noreply.github.com)
- Add support for Electron 30 (GytisCepk@users.noreply.github.com)

## 0.19.1

Thu, 28 Mar 2024 13:12:45 GMT

### Patches

- defaultExpiryBufferInSeconds should be internal (ben-polinsky@users.noreply.github.com)

## 0.19.0

Thu, 28 Mar 2024 09:11:38 GMT

### Minor changes

- Unify expiry buffer accross electron auth clients - added ability to set expiryBuffer for ElectronRendererAuthorization, defaulting to 10 min - added defaultExpiryBufferInSeconds to be reused in both electron auth clients - added ElectronRendererAuthorization._tokenRequest to be returned instead of Promise.reject() to short-circuit any recursive use of ElectronRendererAuthorization.getAccessToken (17436829+GintV@users.noreply.github.com)

## 0.18.5

Thu, 14 Mar 2024 15:38:52 GMT

### Patches

- Add support for Electron 29 (GytisCepk@users.noreply.github.com)

## 0.18.4

Wed, 21 Feb 2024 19:26:31 GMT

### Patches

- Handle decryptRefreshToken failure (17436829+GintV@users.noreply.github.com)

## 0.18.3

Thu, 08 Feb 2024 15:38:07 GMT

### Patches

- Anticipate safeStorage to be polyfilled with async functions (17436829+GintV@users.noreply.github.com)

## 0.18.2

Wed, 17 Jan 2024 15:40:23 GMT

### Patches

- Add support for Electron 28 (GytisCepk@users.noreply.github.com)

## 0.18.1

Thu, 14 Dec 2023 15:21:31 GMT

### Patches

- Publish static HTML loopback files. (19596966+johnnyd710@users.noreply.github.com)

## 0.18.0

Thu, 14 Dec 2023 00:10:26 GMT

### Minor changes

- Resolve ElectronRendererAuthorization signIn when sign in has completed and reject if an error occurs. (19596966+johnnyd710@users.noreply.github.com)

## 0.17.0

Mon, 13 Nov 2023 15:21:13 GMT

### Minor changes

- Add support for Electron 25 & 26 (GytisCepk@users.noreply.github.com)
- Added package.json export field and export ElectronMain cjs and ElectronRenderer esm subpath (AnDuong249@users.noreply.github.com)
-  (Jake-Screen@users.noreply.github.com)
- Add support for Electron 27 (GytisCepk@users.noreply.github.com)

### Patches

- add styled html loopback pages (ben-polinsky@users.noreply.github.com)

## 0.15.0
Wed, 16 Aug 2023 15:07:40 GMT

### Minor changes

- move away from node-keytar to SafeStorage

## 0.14.1
Tue, 25 Jul 2023 14:33:09 GMT

### Patches

- Upgrade @playwright/test to 1.35.1 and remove playwright as dependency
- fix dependency version ranges

## 0.14.0
Wed, 17 May 2023 20:26:35 GMT

### Minor changes

- Add support for Electron 24.
- Add ability to initiate silentSignIn from ElectronRendererAuthorization

### Patches

- add core-common as direct dep (types); 1.0 release
- logout now triggers endsession url in system browser; switch to shell.openExternal to ensure urls open on macso; 

## 0.13.0
Wed, 29 Mar 2023 09:49:21 GMT

### Minor changes

- ### Breaking changes:
- Changes to `ElectronMainAuthorizationConfiguration`:
  - Property `scope` renamed to `scopes`
  - Property `redirectUri: string | undefined` changed to `redirectUris: string[]`
- Parameter `prompt=consent` is no longer unconditionally added to all OIDC Authentication requests
- Parameter `access_type=offline` is no longer added to OIDC Authentication requests (should have no effect on behavior)
- `TokenStore` is no longer exposed from `ElectronMainAuthorization`
- `ElectronRendererAuthorization` constructor now accepts `ElectronRendererAuthorizationConfiguration` with a required `clientId` parameter.

## 0.12.0
Tue, 14 Mar 2023 20:05:10 GMT

### Minor changes

- Drop support for Node 12, Node 14 and Node 16.

### Patches

- Replace npm open package for electron.shell.openPath

## 0.11.0
Thu, 23 Feb 2023 22:01:20 GMT

### Minor changes

- Drop support for Electron 14, 15, 16, 17, 22. Start supporting Electron 23.

## 0.10.1
Tue, 10 Jan 2023 15:45:09 GMT

### Patches

- Enabled linux usage for tokenstore

## 0.10.0
Tue, 03 Jan 2023 21:06:26 GMT

### Minor changes

- Update minimum iTwin.js version to 3.3.0

## 0.9.0
Fri, 23 Dec 2022 16:03:26 GMT

### Minor changes

- Add Electron 22 as supported Electron version.

### Patches

- fix for minor documentation inconsistencies

## 0.8.5
Thu, 25 Aug 2022 13:58:56 GMT

### Patches

- Add Electron as peer dependency.

## 0.8.4
Tue, 03 May 2022 00:43:48 GMT

### Patches

- Include issuerUrl in Electron client TokenStore key

## 0.8.3
Wed, 02 Feb 2022 20:20:14 GMT

### Patches

- update keytar version

## 0.8.2
Tue, 01 Feb 2022 18:01:38 GMT

### Patches

- Update invalid "this" reference

## 0.8.1
Tue, 25 Jan 2022 15:34:41 GMT

### Patches

- update core dependencies

## 0.8.0
Mon, 24 Jan 2022 19:35:01 GMT

### Minor changes

- Update to use iTwin.js 3.0 official release

## 0.7.0
Fri, 17 Dec 2021 19:52:59 GMT

### Minor changes

- Replaced initialize with silent signin

## 0.6.0
Wed, 15 Dec 2021 20:20:04 GMT

### Minor changes

- pin deps to core rc

## 0.5.1
Thu, 02 Dec 2021 18:07:16 GMT

### Patches

- Automatically adds offline_access scope if not already included

## 0.5.0
Mon, 29 Nov 2021 22:10:32 GMT

### Minor changes

- Renaming barrel files to match electron naming scheme

## 0.4.0
Mon, 29 Nov 2021 15:30:19 GMT

### Minor changes

- Changed ElectronAuthorizationBackend name to ElectronAuthorizationMain and ElectronAppAuthorization to ElectronAuthorizationRenderer
