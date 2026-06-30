import crypto from "crypto";

/**
 * Encrypts/decrypts secrets stored at rest in MongoDB (currently just
 * `RestaurantWhatsAppConfig.accessToken`) — unlike `JWT_SECRET`/`MERCADOPAGO_ACCESS_TOKEN`,
 * each restaurant's WhatsApp token is tenant-specific and lives in the database, not in an
 * env var, so it needs its own at-rest protection. AES-256-GCM with a random IV per call;
 * `ENCRYPTION_KEY` is a base64-encoded 32-byte key shared by the whole app (see `.env.example`).
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }
  const buffer = Buffer.from(key, "base64");
  if (buffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)");
  }
  return buffer;
}

/** Returns `iv.ciphertext.authTag`, all hex-encoded and dot-separated. */
export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}.${ciphertext.toString("hex")}.${authTag.toString("hex")}`;
}

/** @throws {Error} if `encrypted` is malformed or the auth tag doesn't match (tampered/wrong key). */
export function decryptToken(encrypted: string): string {
  const [ivHex, ciphertextHex, authTagHex] = encrypted.split(".");
  if (!ivHex || !ciphertextHex || !authTagHex) {
    throw new Error("Malformed encrypted token");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
