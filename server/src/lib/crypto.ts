/**
 * Password hashing and provider-token encryption.
 *
 * Both use Node's built-in crypto rather than a native dependency: nothing to
 * compile, nothing to break on a different deploy target.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './env.js';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEY_LENGTH = 64;

/** Returns `scrypt$<salt hex>$<hash hex>`; the salt is unique per password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time verification; returns false rather than throwing on bad input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// --- Provider token encryption -------------------------------------------

const ENCRYPTION_KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
const IV_LENGTH = 12; // GCM standard nonce length.

/**
 * AES-256-GCM. Output is `v1.<iv>.<authTag>.<ciphertext>`, all base64url, with
 * the version prefix so the key or algorithm can be rotated later.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Throws if the payload was tampered with — GCM authentication is the point. */
export function decryptToken(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
    throw new Error('Malformed encrypted token payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Opaque refresh token; only its SHA-256 hash is stored. */
export function generateOpaqueToken(): string {
  return `${randomUUID().replaceAll('-', '')}${randomBytes(24).toString('hex')}`;
}
