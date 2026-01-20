/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { randomUUID } from "node:crypto";
import { NodeRequestor } from "@openid/appauth/built/node_support";

/**
 * A Node.js HTTP client that automatically adds x-correlation-id header to all requests.
 * @internal
 */
export class CorrelationIdRequestor extends NodeRequestor {
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  public override xhr<T>(settings: JQueryAjaxSettings): Promise<T> {
    // Add x-correlation-id header to all requests to IMS
    const enhancedSettings = {
      ...settings,
      headers: {
        ...settings.headers,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "x-correlation-id": randomUUID(),
      },
    };
    return super.xhr<T>(enhancedSettings);
  }
}
