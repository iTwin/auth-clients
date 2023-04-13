import type { MarkRequired } from "@itwin/core-bentley";
/** @packageDocumentation
 * @module Authorization
 */

/**
 * Contains information related to the previous application state, as specified in the original auth request.
 * Information about this state is only particularly useful when dealing with authentication via redirection because it must destroy that application state to function.
 * Recovering from other authentication via other methods involving iframes or popup windows is simpler they instead preserve the original application state.
 * @internal
 */
export interface BrowserAuthorizationClientRedirectState {
  successRedirectUrl: string;
}

/**
 * @internal
 * The internal configuration used by BrowserAuthorizationClient.
 */
export type BrowserAuthorizationClientConfigurationOptions = MarkRequired<BrowserAuthorizationClientConfiguration, "authority">;
/**
 * @beta
 */
export interface BrowserAuthorizationClientConfiguration
  extends BrowserAuthorizationClientRequestOptions {
  /** The URL of the OIDC/OAuth2 provider. If left undefined, the Bentley auth authority will be used by default. */
  readonly authority?: string;
  /** The unique client id registered through the issuing authority. Required to obtain authorization from the user. */
  readonly clientId: string;
  /**
   * The URL passed in the authorization request, to which the authority will redirect the browser after the user grants/denies access
   * The redirect URL must be registered against the clientId through the issuing authority to be considered valid.
   */
  readonly redirectUri: string;
  /**
   * The URL passed in the signout request, to which the authority will redirect the browser after the user has been signed out.
   * The signout URL must be registered against the clientId through the issuing authority to be considered valid.
   */
  readonly postSignoutRedirectUri?: string;
  /** A space-delimited collection of individual access claims specified by the authority. The user must consent to all specified scopes in order to grant authorization */
  readonly scope: string;
  /** The mechanism (or authentication flow) used to acquire auth information from the user through the authority */
  readonly responseType?:
  | "code"
  | "id_token"
  | "id_token token"
  | "code id_token"
  | "code token"
  | "code id_token token"
  | string;
  /** if true, do NOT attempt a silent signIn on startup of the application */
  readonly noSilentSignInOnAppStartup?: boolean;
  /** The redirect URL used for silent sign in and renew. If not provided, will default to redirectUri. */
  readonly silentRedirectUri?: string;
  readonly responseMode?: "query" | "fragment";
}

/**
 * Interface describing per-request configuration options for authorization requests
 * see: https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
 * @public
 */
export interface BrowserAuthorizationClientRequestOptions {
  /** The required action demanded of the user before the authentication request can succeed */
  prompt?: "none" | "login" | "consent" | "select_account" | string;
}

export interface SettingsInStorage {
  id: string; // nonce/state
  authority: string;
  client_id: string;
  code_verifier: string;
  created: number;
  data: { successRedirectUrl: string };
  redirect_uri: string;
  request_type: string;
  response_mode: string;
  scope: string;
}
