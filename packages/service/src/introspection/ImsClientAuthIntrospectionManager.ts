/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Introspection
 */

import type { ImsIntrospectionResponse } from "./ImsIntrospectionResponse";

/**
 * @internal
 */
export class ImsClientAuthDetail {
  /** Client ID obtained by introspecting the client's authorization token */
  public readonly clientAuthClientId?: string;
  /** User ID obtained by introspecting the client's authorization token */
  public readonly clientAuthUserId?: string;

  public readonly clientAuthOrgId?: string;
  public readonly clientAuthOrgName?: string;
  public readonly clientAuthUltimateSite?: string;
  public readonly clientAuthEmail?: string;

  public constructor(response: ImsIntrospectionResponse) {
    this.clientAuthClientId = response.client_id;
    this.clientAuthUserId = response.sub;
    this.clientAuthOrgId = response.org;
    this.clientAuthOrgName = response.org_name;
    this.clientAuthUltimateSite = response.ultimate_site;
    this.clientAuthEmail = response.email;
  }

  /**
   * Returns all known properties as a new object
   */
  public getProperties(): { [key: string]: any } {
    const properties: { [key: string]: any } = {
      clientAuthClientId: this.clientAuthClientId,
      clientAuthUserId: this.clientAuthUserId,
      clientAuthOrgId: this.clientAuthOrgId,
      clientAuthOrgName: this.clientAuthOrgName,
      clientAuthUltimateSite: this.clientAuthUltimateSite,
      clientAuthEmail: this.clientAuthEmail,
    };

    return properties;
  }
}
