import { Router } from "express";
import { loginUser, parseAuthHeader, deleteSession } from "../lib/auth";
import { addAuditLog, db } from "../lib/database";
import { hashPassword, checkPassword } from "../lib/crypto";

const router = Router();

router.post("/auth/login", (req, res): void => {
  const { name, password } = req.body;
  const ip = req.ip ?? req.socket.remoteAddress ?? null;

  if (!name || !password) {
    res.status(400).json({ error: "Nome e senha são obrigatórios" }); return;
  }

  const result = loginUser(name, password);
  if (!result) {
    addAuditLog({ action: "login_failed", detail: `Tentativa de login com nome: ${name}`, ip });
    res.status(401).json({ error: "Nome ou senha inválidos" }); return;
  }

  const dbUser = db.prepare("SELECT must_change_password FROM users WHERE id = ?").get(result.user.userId) as any;
  const mustChangePassword = (dbUser?.must_change_password ?? 0) === 1;

  addAuditLog({ userId: result.user.userId, userName: result.user.name, action: "login", entity: "user", entityId: result.user.userId, detail: "Login bem-sucedido", ip });
  res.json({ token: result.token, user: { ...result.user, mustChangePassword } });
});

router.post("/auth/logout", (req, res) => {
  const auth = req.headers.authorization;
  const user = parseAuthHeader(auth);
  if (auth?.startsWith("Bearer ")) {
    deleteSession(auth.slice(7));
  }
  if (user) {
    const ip = req.ip ?? req.socket.remoteAddress ?? null;
    addAuditLog({ userId: user.userId, userName: user.name, action: "logout", entity: "user", entityId: user.userId, detail: "Logout", ip });
  }
  res.json({ success: true });
});

router.get("/auth/me", (req, res): void => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }
  res.json(user);
});

router.post("/auth/change-password", (req, res): void => {
  const user = parseAuthHeader(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }

  const { currentPassword, newPassword } = req.body;
  if (!newPassword) {
    res.status(400).json({ error: "Nova senha é obrigatória" }); return;
  }
  if ((newPassword as string).trim().length < 4) {
    res.status(400).json({ error: "A nova senha deve ter pelo menos 4 caracteres" }); return;
  }

  const dbUser = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(user.userId) as any;
  if (!dbUser) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  // Skip current-password check on forced first-time change
  if (dbUser.must_change_password !== 1) {
    if (!currentPassword || !checkPassword(currentPassword, dbUser.password_hash)) {
      res.status(401).json({ error: "Senha atual incorreta" }); return;
    }
  }

  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
    .run(hashPassword(newPassword), user.userId);

  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  addAuditLog({
    userId: user.userId,
    userName: user.name,
    action: "password_changed",
    entity: "user",
    entityId: user.userId,
    detail: "Usuário alterou sua própria senha",
    ip,
  });

  res.json({ success: true });
});

export default router;
