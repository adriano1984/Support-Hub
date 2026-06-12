import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET ?? "helpdesk-ti-secret";

export function hashPassword(password: string): string {
  return crypto.createHmac("sha256", SECRET).update(password).digest("hex");
}

export function checkPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
