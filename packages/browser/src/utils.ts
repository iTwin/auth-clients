/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * Returns the IMS authority URL.
 * A prefix will be prepended based on the value of the IMJS_URL_PREFIX environment variable.
 * The prefix "dev-" will automatically be converted to "qa-".
 * @param authorityUrl
 * @returns
 */
export function getImsAuthority(): string {

  let prefix = process.env.IMJS_URL_PREFIX ?? "";

  // "dev-ims.bentley.com" doesn't exist, so convert prefix to "qa-"
  if (prefix === "dev-")
    prefix = "qa-";

  return `https://${prefix}ims.bentley.com`
}
