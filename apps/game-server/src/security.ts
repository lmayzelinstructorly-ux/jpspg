import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = token();
  return `${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  try {
    const [salt, key] = stored.split(":");
    return timingSafeEqual(
      await derive(password, salt),
      Buffer.from(key, "hex"),
    );
  } catch {
    return false;
  }
}
export function ticket(session: string, secret: string) {
  const payload = Buffer.from(
    JSON.stringify({ session, exp: Date.now() + 10 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function readTicket(raw: string, secret: string): string | undefined {
  try {
    const [body, sig] = raw.split(".");
    const expected = createHmac("sha256", secret).update(body).digest();
    if (!timingSafeEqual(expected, Buffer.from(sig, "base64url"))) return;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (data.exp < Date.now()) return;
    return data.session;
  } catch {
    return;
  }
}
