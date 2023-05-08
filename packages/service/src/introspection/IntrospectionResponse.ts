/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @alpha */
export interface IntrospectionResponse {
  active: boolean;
  client_id?: string;
  exp?: number;
  iat?: number;
  sid?: string;
  iss?: string;
  jti?: string;
  username?: string;
  aud?: string | string[];
  scope: string;
  sub?: string;
  nbf?: number;
  token_type?: string;
}
