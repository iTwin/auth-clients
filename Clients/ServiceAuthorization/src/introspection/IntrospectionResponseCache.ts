/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Introspection
 */

import { IntrospectionResponse } from "./IntrospectionResponse";

export interface IntrospectionResponseCache {
  /** Adds the given response to the cache. The response will be added if it has not yet expired.
   * @param key       A unique string to identify the response within the cache.
   * @param response  A response associated with the key.
   */
  add(key: string, response: IntrospectionResponse): Promise<void>;

  /** Gets the [[IntrospectionResponse]] for the given key.
   *
   * Note: Removes the response if it has already expired.
   *
   * @param key Key of the token entry.
   * @returns   If the key exists and has not yet expired, the IntrospectionResponse associated with the provided key.  Otherwise, undefined.
   */
  get(key: string): Promise<IntrospectionResponse | undefined>;
}
