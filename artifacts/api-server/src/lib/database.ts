import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { hashPassword } from "./crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "helpdesk.db");

export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA cache_size = -65536");
db.exec("PRAGMA temp_store = MEMORY");
db.exec("PRAGMA mmap_size = 268435456");
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA foreign_keys = ON");

const SEED_VERSION = 5;

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'attendant',
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auto_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL UNIQUE,
      whatsapp_phone TEXT NOT NULL,
      client_name TEXT,
      branch_id INTEGER REFERENCES branches(id),
      department_id INTEGER REFERENCES departments(id),
      category_id INTEGER REFERENCES categories(id),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_message_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      direction TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      media_url TEXT,
      sender_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pre_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'inbound',
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      sender_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS canned_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'Geral',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '{}',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id INTEGER,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      client_name TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES supplier_conversations(id),
      direction TEXT NOT NULL DEFAULT 'inbound',
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      sender_name TEXT,
      media_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrações seguras — não afetam dados existentes
  const addCol = (sql: string) => { try { db.exec(sql); } catch { /* coluna já existe */ } };
  addCol("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  addCol("ALTER TABLE tickets ADD COLUMN assigned_to INTEGER REFERENCES users(id)");
  addCol("ALTER TABLE tickets ADD COLUMN assignee_name TEXT");
  addCol("ALTER TABLE tickets ADD COLUMN first_response_at TEXT");
  addCol("ALTER TABLE tickets ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0");
  addCol("ALTER TABLE tickets ADD COLUMN bot_mode TEXT NOT NULL DEFAULT 'bot'");
  addCol("ALTER TABLE messages ADD COLUMN media_mime TEXT");

  // Configurações persistentes
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('ticket_counter', '9')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('inactivity_minutes', '30')").run();

  // Seed de dados de referência
  const row = db.prepare("SELECT value FROM settings WHERE key = 'seed_version'").get() as { value: string } | undefined;
  const currentVersion = row ? parseInt(row.value) : 0;

  if (currentVersion < SEED_VERSION) {
    seedDefaults();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seed_version', ?)").run(String(SEED_VERSION));
    logger.info({ version: SEED_VERSION }, "Database seeded");
  }

  // Seed roles default (safe — INSERT OR IGNORE)
  seedRoles();

  // Seed canned responses (safe — INSERT OR IGNORE)
  seedCannedResponses();

  // Criar admin padrão se nenhum usuário existir
  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (userCount === 0) {
    db.prepare(
      "INSERT OR IGNORE INTO users (name, role, password_hash) VALUES ('Admin', 'admin', ?)"
    ).run(hashPassword("96281800"));
    logger.info("Default admin user created (Admin / 96281800)");
  }
  // Sempre sincroniza a hash do Admin com o SESSION_SECRET atual para evitar falha de login após restart
  db.prepare(
    "UPDATE users SET password_hash = ? WHERE name = 'Admin' AND role = 'admin'"
  ).run(hashPassword("96281800"));

  // Migração segura: adicionar {saudacao} na mensagem de boas-vindas (só se não foi customizada)
  try {
    const wr = db.prepare("SELECT content FROM auto_messages WHERE trigger = 'welcome'").get() as { content: string } | undefined;
    if (wr?.content?.startsWith("Olá, {nome}!")) {
      db.prepare("UPDATE auto_messages SET content = ? WHERE trigger = 'welcome'")
        .run("{saudacao}, {nome}! Bem-vindo ao suporte de TI.\n\nDigite:\n\n1️⃣ PARA ABRIR CHAMADO\n2️⃣ PARA FORNECEDOR (⚠️ exclusivo para fornecedores ⚠️)");
      logger.info("Auto-message 'welcome' migrated to use {saudacao} placeholder");
    }
  } catch { /* não crítico */ }

  // Migração segura: atualizar resposta pronta "Assumindo chamado" para o novo formato
  try {
    const cr = db.prepare("SELECT id, content FROM canned_responses WHERE title = 'Assumindo chamado'").get() as { id: number; content: string } | undefined;
    if (cr && cr.content.includes("{nome_cliente}")) {
      db.prepare("UPDATE canned_responses SET content = ? WHERE id = ?")
        .run(
          "Olá, {saudacao}!\n\nSou {nome_atendente}, analista responsável pelo seu chamado.\n\nA partir deste momento acompanharei seu atendimento e darei continuidade à tratativa da sua solicitação.",
          cr.id
        );
      logger.info("Canned response 'Assumindo chamado' atualizada para novo formato");
    }
  } catch { /* não crítico */ }

  logger.info("Database initialized");
}

/** Gera próximo número de ticket sequencial (10, 11, 12...) */
export function nextTicketNumber(): string {
  db.exec("UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'ticket_counter'");
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ticket_counter'").get() as { value: string };
  return row.value;
}

/** Retorna o tempo de inatividade configurado em minutos */
export function getInactivityMinutes(): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'inactivity_minutes'").get() as { value: string } | undefined;
  return row ? parseInt(row.value) : 30;
}

/** Salva uma mensagem pré-ticket (antes da criação do chamado) */
export function savePreTicketMessage(phone: string, direction: string, type: string, content: string, senderName?: string) {
  try {
    db.prepare(
      "INSERT INTO pre_ticket_messages (phone, direction, type, content, sender_name) VALUES (?, ?, ?, ?, ?)"
    ).run(phone, direction, type, content, senderName ?? null);
  } catch { /* não crítico */ }
}

/** Obtém ou cria conversa de fornecedor em aberto para o telefone */
export function getOrCreateSupplierConversation(phone: string, clientName?: string | null): number {
  const existing = db.prepare(
    "SELECT id FROM supplier_conversations WHERE phone = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 1"
  ).get(phone) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(
    "INSERT INTO supplier_conversations (phone, client_name) VALUES (?, ?)"
  ).run(phone, clientName ?? null);
  return result.lastInsertRowid as number;
}

/** Salva mensagem numa conversa de fornecedor */
export function saveSupplierMessage(
  conversationId: number,
  direction: string,
  type: string,
  content: string,
  senderName?: string | null,
  mediaUrl?: string | null
): void {
  try {
    db.prepare(
      "INSERT INTO supplier_messages (conversation_id, direction, type, content, sender_name, media_url) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(conversationId, direction, type, content, senderName ?? null, mediaUrl ?? null);
    db.prepare("UPDATE supplier_conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
  } catch { /* não crítico */ }
}

/** Registra evento no auditoria do sistema */
export function addAuditLog(opts: {
  userId?: number | null;
  userName?: string | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  detail?: string | null;
  ip?: string | null;
}) {
  try {
    db.prepare(
      "INSERT INTO system_audit (user_id, user_name, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(opts.userId ?? null, opts.userName ?? null, opts.action, opts.entity ?? null, opts.entityId ?? null, opts.detail ?? null, opts.ip ?? null);
  } catch { /* não crítico */ }
}

function seedRoles() {
  const defaultPermissions = {
    admin: {
      users: { create: true, edit: true, delete: true, block: true, resetPassword: true },
      tickets: { view: true, create: true, edit: true, assign: true, transfer: true, close: true, reopen: true, delete: true },
      conversations: { viewHistory: true, viewInternal: true, addNotes: true },
      reports: { view: true, exportPdf: true, exportExcel: true },
      settings: { view: true, edit: true },
      scope: "all",
    },
    manager: {
      users: { create: true, edit: true, delete: false, block: true, resetPassword: true },
      tickets: { view: true, create: true, edit: true, assign: true, transfer: true, close: true, reopen: true, delete: false },
      conversations: { viewHistory: true, viewInternal: true, addNotes: true },
      reports: { view: true, exportPdf: true, exportExcel: true },
      settings: { view: true, edit: false },
      scope: "all",
    },
    supervisor: {
      users: { create: false, edit: false, delete: false, block: false, resetPassword: false },
      tickets: { view: true, create: true, edit: true, assign: true, transfer: true, close: true, reopen: true, delete: false },
      conversations: { viewHistory: true, viewInternal: true, addNotes: true },
      reports: { view: true, exportPdf: true, exportExcel: false },
      settings: { view: true, edit: false },
      scope: "sector",
    },
    technician: {
      users: { create: false, edit: false, delete: false, block: false, resetPassword: false },
      tickets: { view: true, create: true, edit: true, assign: false, transfer: true, close: true, reopen: false, delete: false },
      conversations: { viewHistory: true, viewInternal: true, addNotes: true },
      reports: { view: true, exportPdf: false, exportExcel: false },
      settings: { view: false, edit: false },
      scope: "team",
    },
    attendant: {
      users: { create: false, edit: false, delete: false, block: false, resetPassword: false },
      tickets: { view: true, create: true, edit: true, assign: false, transfer: false, close: true, reopen: false, delete: false },
      conversations: { viewHistory: true, viewInternal: false, addNotes: true },
      reports: { view: false, exportPdf: false, exportExcel: false },
      settings: { view: false, edit: false },
      scope: "own",
    },
  };

  const roles = [
    { name: "admin", label: "Administrador", is_system: 1 },
    { name: "manager", label: "Gestor", is_system: 1 },
    { name: "supervisor", label: "Supervisor", is_system: 1 },
    { name: "technician", label: "Técnico", is_system: 1 },
    { name: "attendant", label: "Atendente", is_system: 1 },
  ];

  for (const r of roles) {
    const perms = (defaultPermissions as any)[r.name] ?? {};
    db.prepare(
      "INSERT OR IGNORE INTO roles_config (name, label, permissions, is_system) VALUES (?, ?, ?, ?)"
    ).run(r.name, r.label, JSON.stringify(perms), r.is_system);
  }
}

function seedCannedResponses() {
  const count = (db.prepare("SELECT COUNT(*) as c FROM canned_responses").get() as { c: number }).c;
  if (count > 0) return;

  const responses = [
    { category: "Saudação", title: "Boas-vindas", content: "Olá, {nome_cliente}! Sou {nome_atendente} e estou aqui para ajudá-lo. Como posso auxiliar você hoje?" },
    { category: "Atendimento", title: "Assumindo chamado", content: "Olá, {saudacao}!\n\nSou {nome_atendente}, analista responsável pelo seu chamado.\n\nA partir deste momento acompanharei seu atendimento e darei continuidade à tratativa da sua solicitação." },
    { category: "Atendimento", title: "Aguardando informações", content: "Olá, {nome_cliente}! Para darmos continuidade ao seu chamado *{numero_chamado}*, precisamos de mais informações. Poderia nos fornecer os detalhes solicitados?" },
    { category: "Suporte Técnico", title: "Verificando problema", content: "Prezado(a) {nome_cliente}, estou verificando o problema relatado no chamado *{numero_chamado}*. Em breve retornarei com uma solução." },
    { category: "Suporte Técnico", title: "Solução aplicada", content: "Prezado(a) {nome_cliente}, aplicamos a solução para o problema do chamado *{numero_chamado}*. Por favor, verifique se o problema foi resolvido e nos confirme." },
    { category: "Financeiro", title: "Encaminhando para financeiro", content: "Olá, {nome_cliente}! Sua solicitação no chamado *{numero_chamado}* foi encaminhada para o departamento *{departamento}*. Em breve entrarão em contato." },
    { category: "Encerramento", title: "Encerrando chamado", content: "Prezado(a) {nome_cliente}, o seu chamado *{numero_chamado}* foi concluído com sucesso em {data}. Caso precise de mais suporte, abra um novo chamado. Obrigado!" },
    { category: "Encerramento", title: "Pesquisa de satisfação", content: "Olá, {nome_cliente}! O chamado *{numero_chamado}* foi encerrado. Como você avalia o atendimento prestado? Sua opinião é muito importante para nós." },
  ];

  const ins = db.prepare("INSERT INTO canned_responses (category, title, content) VALUES (?, ?, ?)");
  for (const r of responses) {
    ins.run(r.category, r.title, r.content);
  }
}

function seedDefaults() {
  db.exec("PRAGMA foreign_keys = OFF");

  db.exec("DELETE FROM branches");
  db.exec("DELETE FROM sqlite_sequence WHERE name='branches'");
  const insBranch = db.prepare("INSERT INTO branches (name) VALUES (?)");
  [
    "FILIAL 1 - APGYN",
    "FILIAL 2 - SPL",
    "FILIAL 3 - CRM",
    "FILIAL 4 - MARKETPLACE",
    "FILIAL 5 - NOROESTE",
    "FILIAL 6 - CD MOTRIX",
    "FILIAL 7 - CANEDO",
    "FILIAL 8 - ANÁPOLIS",
  ].forEach(n => insBranch.run(n));

  db.exec("DELETE FROM departments");
  db.exec("DELETE FROM sqlite_sequence WHERE name='departments'");
  const insDept = db.prepare("INSERT INTO departments (name) VALUES (?)");
  [
    "FINANCEIRO", "COMPRAS", "ESTOQUE", "EXPEDIÇÃO RETIRA",
    "VENDAS", "RH", "CAIXA", "CONTABILIDADE",
    "EXPEDIÇÃO MOTOQUEIRO", "MERCADO LIVRE", "OUTROS",
  ].forEach(n => insDept.run(n));

  db.exec("DELETE FROM categories");
  db.exec("DELETE FROM sqlite_sequence WHERE name='categories'");
  const insCat = db.prepare("INSERT INTO categories (name) VALUES (?)");
  [
    "COMPUTADOR", "IMPRESSORA/SCANNERS", "NINES (telefone)",
    "SHEEPS (WhatsApp)", "EORBIS", "PERIFÉRICOS (fone, mouse, teclados e outros)",
    "CATÁLOGOS", "SOFTWARE", "SEFAZ (erro ao faturar)", "OUTROS",
  ].forEach(n => insCat.run(n));

  db.exec("DELETE FROM auto_messages");
  db.exec("DELETE FROM sqlite_sequence WHERE name='auto_messages'");
  const insMsg = db.prepare("INSERT INTO auto_messages (trigger, content) VALUES (?, ?)");
  const defaults: [string, string][] = [
    ["welcome", "{saudacao}, {nome}! 👋\n\nPara continuar, escolha uma das opções:\n\n*1️⃣ - Abrir chamado de suporte*\n*2️⃣ - Atendimento para fornecedores* ⚠️\n\n_Digite o número da opção desejada._"],
    ["invalid_menu", "Opção inválida. Por favor, responda *1* ou *2*:\n\n*1️⃣ - Abrir chamado de suporte*\n*2️⃣ - Atendimento para fornecedores* ⚠️"],
    ["ask_name", "Olá! Não consegui identificar seu nome. Por favor, informe seu nome completo para prosseguirmos com a abertura do chamado."],
    ["ask_branch", "Por favor, informe o número da sua filial:\n\n{branches}"],
    ["ask_department", "Qual é o seu departamento?\n\n{departments}"],
    ["ask_category", "Selecione a categoria do problema:\n\n{categories}"],
    ["ask_description", "Descreva brevemente o problema que está enfrentando:"],
    ["ticket_opened", "Seu chamado foi aberto com sucesso!\n\n*Número do chamado:* {ticketNumber}\n\nO time de TI irá atendê-lo em breve."],
    ["status_in_progress", "Seu chamado *{ticketNumber}* está sendo atendido pelo time de TI."],
    ["status_resolved", "Seu chamado *{ticketNumber}* foi resolvido. Caso o problema persista, entre em contato novamente."],
    ["inactivity_closed", "Atendimento encerrado por inatividade."],
    ["inactivity_warning", "Estamos aguardando sua resposta para continuar a abertura do chamado. Caso não haja retorno, esta solicitação será encerrada automaticamente em 3 minutos."],
    ["supplier_welcome", "Olá! Você está no canal exclusivo para fornecedores.\n\nUm de nossos atendentes irá verificar sua mensagem em breve. Por favor, aguarde."],
    ["invalid_option", "Opção inválida. Por favor, escolha um número da lista."],
  ];
  defaults.forEach(([trigger, content]) => insMsg.run(trigger, content));

  db.exec("PRAGMA foreign_keys = ON");
}
