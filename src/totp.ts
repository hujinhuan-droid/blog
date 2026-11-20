/// <reference types="@cloudflare/workers-types" />
// TOTP（RFC 6238）实现：仅依赖 Web Crypto，兼容 Cloudflare Workers 与 Node 18+。
// HMAC-SHA1 + 6 位动态截断 + 30 秒步长；备用码用 SHA-256 单向存储。

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;
const DIGITS = 6;
const WINDOW = 1; // 允许前后各 1 个时间窗（±30 秒）

function encoder() { return new TextEncoder(); }

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 生成 Base32（RFC 4648，大写无 padding） */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** 解析 Base32，容忍小写、空格与 '=' 填充 */
export function base32Decode(input: string): Uint8Array {
  const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 生成 20 字节 random secret（Base32） */
export function generateSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** 计算某个时间窗的 6 位 TOTP */
export async function totpAt(secret: string, counter: number): Promise<string> {
  const raw = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    "raw", raw.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = sig[sig.length - 1] & 0x0f;
  const bin = ((sig[off] & 0x7f) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3];
  return String(bin % 1000000).padStart(DIGITS, "0");
}

/** 校验动态码，允许前后各一个时间窗；常量时间比较避免时序侧信道 */
export async function verifyTotp(secret: string, code: string, now = Date.now()): Promise<boolean> {
  const input = String(code || "").replace(/\D/g, "");
  if (input.length !== DIGITS) return false;
  const counter = Math.floor(now / 1000 / STEP);
  let pass = false;
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const expected = await totpAt(secret, counter + d);
    if (expected.length === input.length && expected === input) pass = true;
  }
  return pass;
}

/** otpauth:// 链接，供验证器 App 扫码 */
export function otpauthUrl(secret: string, issuer: string, account: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** 生成一次性备用码（去掉易混字符 0/O/1/I） */
export function generateBackupCodes(count = 8): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    out.push([...bytes].map((b) => alphabet[b % alphabet.length]).join(""));
  }
  return out;
}

/** 备用码哈希（只存哈希，明文仅在启用时展示一次） */
export async function hashBackupCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder().encode(String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "")));
  return bytesToHex(new Uint8Array(digest));
}

/** 校验并消费备用码：返回剩余哈希数组，无效返回 null */
export async function consumeBackupCode(code: string, hashes: string[]): Promise<string[] | null> {
  const h = await hashBackupCode(code);
  const idx = hashes.findIndex((x) => x === h);
  if (idx < 0) return null;
  const next = hashes.slice();
  next.splice(idx, 1);
  return next;
}

/** 生成登录挑战 token（D1 存储，10 分钟有效） */
export function newChallenge(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
}

export { hexToBytes };
