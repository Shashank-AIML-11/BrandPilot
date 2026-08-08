/** AES-GCM helpers for channel tokens and OAuth state. Server-only. */

const enc = new TextEncoder();
const dec = new TextDecoder();

async function keyFor(secretName: string): Promise<CryptoKey> {
  const raw = process.env[secretName];
  if (!raw) throw new Error(`${secretName} is not configured`);
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

async function seal(secretName: string, plain: string): Promise<string> {
  if (!plain) return "";
  const key = await keyFor(secretName);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)),
  );
  return `${toB64(iv)}.${toB64(cipher)}`;
}

async function open(secretName: string, packed: string): Promise<string> {
  if (!packed) return "";
  const [ivPart, dataPart] = packed.split(".");
  if (!ivPart || !dataPart) return "";
  const key = await keyFor(secretName);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivPart) },
    key,
    fromB64(dataPart),
  );
  return dec.decode(plain);
}

export const encryptToken = (value: string) => seal("CHANNEL_TOKEN_KEY", value);
export const decryptToken = (value: string) => open("CHANNEL_TOKEN_KEY", value);

export interface OAuthState {
  userId: string;
  channel: string;
  origin: string;
  verifier?: string;
  exp: number;
}

export async function packState(state: OAuthState): Promise<string> {
  return seal("OAUTH_STATE_SECRET", JSON.stringify(state));
}

export async function unpackState(value: string): Promise<OAuthState | null> {
  try {
    const parsed = JSON.parse(await open("OAUTH_STATE_SECRET", value)) as OAuthState;
    if (!parsed?.userId || !parsed.channel || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** PKCE pair for providers that require it (X). */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = toB64(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
  return { verifier, challenge: toB64(digest) };
}
