# Change Log - @itwin/oidc-signin-tool

<!-- This log was last generated on Mon, 27 Oct 2025 12:14:12 GMT and should not be manually modified. -->

<!-- Start content -->

## 5.0.2

Mon, 27 Oct 2025 12:14:12 GMT

### Patches

- Bump `@playwright/test` dependency version to `~1.56.1`. (35135765+grigasp@users.noreply.github.com)

## 5.0.1

Mon, 23 Jun 2025 14:20:52 GMT

### Patches

- log signin retries (66480813+paulius-valiunas@users.noreply.github.com)

## 5.0.0

Wed, 04 Jun 2025 20:44:05 GMT

### Major changes

- Drop support for core v3 and v4 and bump oidc-client-ts to latest major (pankhur94@users.noreply.github.com)

## 4.4.1

Mon, 17 Feb 2025 21:20:34 GMT

### Patches

- bump vite, drop crypto-browserify to address cve (50554904+hl662@users.noreply.github.com)

## 4.4.0

Thu, 21 Nov 2024 16:05:10 GMT

### Minor changes

- a new backend function that uses the ServiceAuthorizationClient to get an access token (Frank.Li@bentley.com)

## 4.3.8

Wed, 20 Nov 2024 18:34:06 GMT

### Patches

- Update to @playwright/test 1.48.2 (33036725+wgoehrig@users.noreply.github.com)

## 4.3.7

Tue, 29 Oct 2024 21:49:00 GMT

### Patches

- Remove discouraged 'networkidle' (108895074+MichaelSwigerAtBentley@users.noreply.github.com)

## 4.3.6

Tue, 18 Jun 2024 19:11:49 GMT

### Patches

- fix latest sec vulnerabilities; run audit during ci (ben-polinsky@users.noreply.github.com)

## 4.3.5

Wed, 08 May 2024 21:11:26 GMT

### Patches

- upgrade docs build tools, typescript, and eslint (ben-polinsky@users.noreply.github.com)

## 4.3.4

Mon, 18 Mar 2024 17:02:58 GMT

### Patches

- Fix EU cookie consent banner selector (jsnaras@users.noreply.github.com)

## 4.3.3

Mon, 18 Mar 2024 08:59:46 GMT

### Patches

- Add EU cookie banner handling to OIDC sign-in tool (jsnaras@users.noreply.github.com)

## 4.3.2

Tue, 12 Dec 2023 20:38:56 GMT

### Patches

- Refactor login form handling in SignInAutomation.ts to use .fill (19596966+johnnyd710@users.noreply.github.com)

## 4.3.1

Mon, 04 Dec 2023 15:17:25 GMT

### Patches

- add section to README indiciating how to ignore the leak (michael.belousov98@gmail.com)

## 4.3.0

Thu, 30 Nov 2023 18:33:38 GMT

### Minor changes

- export reusable browser automation for desktop and electron (michael.belousov98@gmail.com)

## 4.2.0

Mon, 13 Nov 2023 15:21:13 GMT

### Minor changes

-  (Jake-Screen@users.noreply.github.com)

## 4.1.2
Wed, 16 Aug 2023 15:07:40 GMT

_Version update only_

## 4.1.1
Tue, 25 Jul 2023 15:42:36 GMT

_Version update only_

## 4.1.0
Tue, 25 Jul 2023 14:33:09 GMT

### Minor changes

- Upgrade @playwright/test to 1.35.1 and remove installScript.js file

### Patches

- fix dependency version ranges

## 4.0.1
Fri, 09 Jun 2023 17:20:04 GMT

### Patches

- Fix issue with OIDC signin tool not working without fetch API

## 4.0.0
Wed, 17 May 2023 20:26:35 GMT

### Breaking changes

- Remove AzureAD and Authing support

## 3.7.2
Fri, 05 May 2023 18:56:53 GMT

### Patches

- add core-common as direct dep (types);
- Update peer deps to use >= for core-bentley

## 3.7.1
Thu, 16 Mar 2023 01:23:39 GMT

### Patches

- add postInstall script hook to install playwright/chromium

## 3.7.0
Tue, 14 Mar 2023 20:05:10 GMT

### Minor changes

- Move from puppeteer to playwright
- Drop support for Node 12, Node 14 and Node 16.

## 3.6.1
Fri, 27 Jan 2023 18:50:06 GMT

### Patches

- remove old OIDC Authing test

## 3.6.0
Tue, 03 Jan 2023 21:06:26 GMT

### Minor changes

- Update minimum iTwin.js version to 3.3.0

## 3.5.0
Thu, 22 Sep 2022 14:49:41 GMT

### Minor changes

- Change getAccessTokenFromBackend() client cache to include more parameters besides email

## 3.4.1
Tue, 03 May 2022 00:43:48 GMT

### Patches

- Fix error message.

## 3.4.0
Wed, 06 Apr 2022 21:17:06 GMT

### Minor changes

- Upgrade puppeteer to 13.5.2

## 3.3.0
Mon, 21 Mar 2022 12:23:06 GMT

### Minor changes

- Add support for AzureAD and Authing OAuth providers.

### Patches

- Update callback handling to not require an id_token present. The 'openid' scope is now no longer required.

## 3.2.2
Thu, 27 Jan 2022 14:10:00 GMT

### Patches

- Update itwin/certa to be a direct dependency

## 3.2.1
Tue, 25 Jan 2022 15:34:41 GMT

### Patches

- Update core dependencies

## 3.2.0
Mon, 24 Jan 2022 19:35:01 GMT

### Minor changes

- Update to use iTwin.js 3.0 official release

## 3.1.0
Wed, 15 Dec 2021 20:20:04 GMT

### Minor changes

- pin deps to core rc

## 3.0.0
Thu, 02 Dec 2021 18:07:16 GMT

_Initial release_
