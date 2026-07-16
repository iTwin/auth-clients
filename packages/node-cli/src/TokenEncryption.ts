/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Authorization
 */

/**
 * Hook to let consumers provide their own encryption for the persisted refresh token cache,
 * e.g. Electron's `safeStorage` API (which is backed by the OS credential store).
 * When supplied, this is used instead of the built-in (file-based) cipher key.
 * @beta
 */
export interface TokenEncryption {
  encrypt(plaintext: string): Promise<Buffer>;
  /** @param ciphertext As produced by {@link TokenEncryption.encrypt}. */
  decrypt(ciphertext: Buffer): Promise<string>;
}
