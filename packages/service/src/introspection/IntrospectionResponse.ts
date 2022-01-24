/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Introspection
 */
import type { IntrospectionResponse as OpenIdIntrospectionResponse } from "openid-client";

export interface IntrospectionResponse extends OpenIdIntrospectionResponse {
  active: boolean;
}
