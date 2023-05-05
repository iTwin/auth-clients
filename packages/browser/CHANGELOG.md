# Change Log - @itwin/browser-authorization

This log was last generated on Fri, 05 May 2023 18:56:53 GMT and should not be manually modified.

## 1.0.0
Fri, 05 May 2023 18:56:53 GMT

### Breaking changes

- add core-common as direct dep (types); 1.0 release

### Patches

- Update peer deps to use >= for core-bentley

## 0.9.0
Fri, 14 Apr 2023 21:44:37 GMT

### Minor changes

- Add static BrowserAuthorizationClient.handleSigninCallback method for configless callback

## 0.8.0
Wed, 22 Mar 2023 18:23:21 GMT

### Minor changes

- Consolidate BrowserAuthCallbackHandler into BrowserAuthorizationClient

## 0.7.0
Tue, 14 Mar 2023 20:05:10 GMT

### Minor changes

- Drop support for Node 12, Node 14 and Node 16.

## 0.6.2
Tue, 28 Feb 2023 18:25:46 GMT

### Patches

- fix the fix for passing browser auth redirect state

## 0.6.1
Tue, 28 Feb 2023 16:16:08 GMT

### Patches

- fix broken final redirect

## 0.6.0
Fri, 27 Jan 2023 18:50:06 GMT

### Minor changes

- Update to oidc-client-ts\nAdd new required properties to BrowserAuthorizationCallbackHandlerConfiguration

## 0.5.1
Tue, 25 Jan 2022 15:34:41 GMT

### Patches

- Update core dependencies

## 0.5.0
Mon, 24 Jan 2022 19:35:01 GMT

### Minor changes

- Update to use iTwin.js 3.0 official release

## 0.4.0
Wed, 15 Dec 2021 20:20:04 GMT

### Minor changes

- pin deps to core rc

## 0.3.2
Mon, 29 Nov 2021 22:10:32 GMT

### Patches

- Direct errors within browser callback handling to UnexpectedErrors

## 0.3.1
Mon, 29 Nov 2021 15:30:19 GMT

_Initial release_

