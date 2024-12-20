/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */
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
  email?: string;
  aud?: string | string[];
  scope: string;
  sub?: string;
  org?: string;
  nbf?: number;
  token_type?: string;
}
/* eslint-enable @typescript-eslint/naming-convention */
