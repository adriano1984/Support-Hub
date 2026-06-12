import crypto from "crypto";
import { checkPassword } from "./crypto";
import { db } from "./database";

export interface SessionUser {
  userId: number;
  name: string;
  role: string;
}

interface TokenPayload extends SessionUser {
  iat: number;
  jti: string;
}

const SECRET = process.env.SESSION_SECRET || "helpdesk-dev-secret";

const revoked = new Set<string>();

function signToken(user: SessionUser): string {
  const payload: TokenPayload = {
    ...user,
    iat: Date.now(),
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): SessionUser | null {
  if (revoked.has(token)) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as TokenPayload;
    return { userId: payload.userId, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

export function createSession(user: SessionUser): string {
  return signToken(user);
}

export function getSession(token: string): SessionUser | null {
  return verifyToken(token);
}

export function deleteSession(token: string): void {
  revoked.add(token);
}

export function parseAuthHeader(authHeader: string | undefined): SessionUser | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return getSession(authHeader.slice(7));
}

export function loginUser(name: string, password: string): { token: string; user: SessionUser } | null {
  const row = db.prepare("SELECT * FROM users WHERE name = ? AND active = 1").get(name) as any;
  if (!row) return null;
  if (!checkPassword(password, row.password_hash)) return null;

  const user: SessionUser = { userId: row.id, name: row.name, role: row.role };
  const token = createSession(user);
  return { token, user };
}
