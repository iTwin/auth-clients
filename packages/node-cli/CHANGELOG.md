# Change Log - @itwin/node-cli-authorization

This log was last generated on Wed, 20 Nov 2024 18:34:06 GMT and should not be manually modified.

<!-- Start content -->

## 2.0.4

Wed, 20 Nov 2024 18:34:06 GMT

### Patches

- Update to username v7.0.0 (33036725+wgoehrig@users.noreply.github.com)

## 2.0.3

Tue, 18 Jun 2024 19:11:49 GMT

### Patches

- fix latest sec vulnerabilities; run audit during ci (ben-polinsky@users.noreply.github.com)

## 2.0.2

Wed, 08 May 2024 21:11:26 GMT

### Patches

- upgrade docs build tools, typescript, and eslint (ben-polinsky@users.noreply.github.com)

## 2.0.1

Thu, 14 Dec 2023 15:21:31 GMT

### Patches

- Publish static HTML loopback files. (19596966+johnnyd710@users.noreply.github.com)

## 2.0.0

Mon, 13 Nov 2023 15:21:13 GMT

### Major changes

- Migrate from node-keytar to crypto (50554904+hl662@users.noreply.github.com)

### Minor changes

-  (Jake-Screen@users.noreply.github.com)
- Sometime refresh token expires and user must go an manually delete setting from window network password otherwise app will not login or get new token. This PR add ability to forget refresh token if signIn() fail to refresh token. This PR also add method to explicitly signOut() and forget persisted token so new sign can take place. (khanaffan@gmail.com)

### Patches

- add styled html loopback pages (ben-polinsky@users.noreply.github.com)

## 1.0.1
Tue, 25 Jul 2023 14:33:09 GMT

### Patches

- fix dependency version ranges

## 1.0.0
Wed, 17 May 2023 20:26:35 GMT

### Breaking changes

- Release v1.0

### Patches

- add core-common as direct dep (types)
- Update peer deps to use >= for core-bentley

## 0.11.0
Tue, 14 Mar 2023 20:05:10 GMT

### Minor changes

- Drop support for Node 12, Node 14 and Node 16.

## 0.10.0
Tue, 03 Jan 2023 21:06:26 GMT

### Minor changes

- Update minimum iTwin.js version to 3.3.0

## 0.9.2
Thu, 23 Jun 2022 19:15:13 GMT

### Patches

- Ensure only credentials with matching scopes are reused from cache.

## 0.9.1
Tue, 03 May 2022 00:43:48 GMT

### Patches

- Include issuerUrl in TokenStore key to avoid conflicts

## 0.9.0
Wed, 06 Apr 2022 21:17:06 GMT

### Minor changes

- Initial version
