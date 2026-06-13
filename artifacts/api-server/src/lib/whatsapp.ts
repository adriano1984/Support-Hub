import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  downloadMediaMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import qrcode from "qrcode";
import { db, nextTicketNumber, getInactivityMinutes, savePreTicketMessage, getOrCreateSupplierConversation, saveSupplierMessage } from "./database";
import { logger } from "./logger";
import { processarCliente } from "../overlay";
import { broadcastEvent } from "./sse";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SESSION_DIR = path.join(DATA_DIR, "whatsapp-session");
const MEDIA_DIR = path.join(DATA_DIR, "media");

// ─── Media download ───────────────────────────────────────────────────────────

function getAudioExt(msg: any): string {
  const m = msg.message ?? {};
  const rawMime = (m.audioMessage?.mimetype ?? m.pttMessage?.mimetype ?? "audio/ogg; codecs=opus").toLowerCase();
  if (rawMime.includes("mp4") || rawMime.includes("m4a") || rawMime.includes("aac")) return ".m4a";
  if (rawMime.includes("mp3") || rawMime.includes("mpeg")) return ".mp3";
  return ".ogg";
}

function getMediaExt(msg: any): string | null {
  const m = msg.message ?? {};
  if (m.imageMessage) {
    const mime = (m.imageMessage.mimetype ?? "image/jpeg").split(";")[0].split("/")[1] ?? "jpeg";
    return mime === "png" ? ".png" : mime === "webp" ? ".webp" : ".jpg";
  }
  if (m.audioMessage || m.pttMessage) return getAudioExt(msg);
  if (m.videoMessage) return ".mp4";
  if (m.stickerMessage) return ".webp";
  if (m.documentMessage) return path.extname(m.documentMessage.fileName ?? "") || ".bin";
  if (m.documentWithCaptionMessage?.message?.documentMessage)
    return path.extname(m.documentWithCaptionMessage.message.documentMessage.fileName ?? "") || ".bin";
  return null;
}

function getMediaMime(msg: any): string | null {
  const m = msg.message ?? {};
  if (m.imageMessage) return (m.imageMessage.mimetype ?? "image/jpeg").split(";")[0].trim();
  if (m.audioMessage) {
    const raw = m.audioMessage.mimetype ?? "audio/ogg; codecs=opus";
    const lower = raw.toLowerCase();
    if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) return "audio/mp4";
    if (lower.includes("mp3") || lower.includes("mpeg")) return "audio/mpeg";
    return "audio/ogg; codecs=opus";
  }
  if (m.pttMessage) return "audio/ogg; codecs=opus";
  if (m.videoMessage) return (m.videoMessage.mimetype ?? "video/mp4").split(";")[0].trim();
  if (m.stickerMessage) return "image/webp";
  if (m.documentMessage) return (m.documentMessage.mimetype ?? "application/octet-stream").split(";")[0].trim();
  return null;
}

async function downloadAndSaveMedia(sock: WASocket, msg: any): Promise<{ url: string | null; mime: string | null }> {
  const ext = getMediaExt(msg);
  const mime = getMediaMime(msg);
  if (!ext) return { url: null, mime: null };
  try {
    if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const buffer = await downloadMediaMessage(msg, "buffer", {}, {
      logger: logger.child({ module: "media" }) as any,
      reuploadRequest: sock.updateMediaMessage,
    }) as Buffer;
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);
    return { url: `/api/media/${filename}`, mime };
  } catch (err) {
    logger.warn({ err }, "Failed to download media — storing text only");
    return { url: null, mime: null };
  }
}

export type WAStatus = "connected" | "disconnected" | "connecting" | "qr_ready";

interface WAState {
  status: WAStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  profileName: string | null;
  socket: WASocket | null;
}

const state: WAState = {
  status: "disconnected",
  qrCode: null,
  phoneNumber: null,
  profileName: null,
  socket: null,
};

let reconnectTimer: NodeJS.Timeout | null = null;

// ─── Deduplicação de mensagens ────────────────────────────────────────────────
const MAX_SEEN = 2000;
const seenMsgIds = new Set<string>();
function isSeenMsg(id: string): boolean {
  if (seenMsgIds.has(id)) return true;
  seenMsgIds.add(id);
  if (seenMsgIds.size > MAX_SEEN) {
    const first = seenMsgIds.values().next().value!;
    seenMsgIds.delete(first);
  }
  return false;
}

function clearReconnectTimer() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

export function getStatus() {
  return {
    connected: state.status === "connected",
    status: state.status,
    qrCode: state.qrCode,
    phoneNumber: state.phoneNumber,
    profileName: state.profileName,
  };
}

export async function startWhatsApp() {
  clearReconnectTimer();
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  state.status = "connecting";
  state.qrCode = null;

  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
      version,
      auth: authState,
      printQRInTerminal: false,
      logger: logger.child({ module: "baileys" }) as any,
      browser: ["SuportyHub", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    state.socket = sock;
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          state.qrCode = await qrcode.toDataURL(qr);
          state.status = "qr_ready";
          logger.info("QR code generated");
        } catch (err) { logger.error({ err }, "Failed to generate QR code"); }
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.info({ statusCode, shouldReconnect }, "Connection closed");
        state.status = "disconnected";
        state.socket = null;
        state.qrCode = null;
        state.phoneNumber = null;
        state.profileName = null;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          clearSessionFiles();
        }
        if (shouldReconnect) {
          reconnectTimer = setTimeout(() => startWhatsApp(), 5000);
        }
      }

      if (connection === "open") {
        state.status = "connected";
        state.qrCode = null;
        try {
          const jid = sock.user?.id;
          if (jid) state.phoneNumber = jid.split(":")[0].split("@")[0];
          state.profileName = sock.user?.name ?? null;
        } catch { /* ignore */ }
        logger.info({ phone: state.phoneNumber }, "WhatsApp connected");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        // ── Filtros de entrada (ordem importa: mais baratos primeiro) ──────────

        // 1. Sem conteúdo real
        if (!msg.message) continue;

        // 2. Mensagens enviadas por nós — separar bot de analista no celular
        if (msg.key.fromMe) {
          // Se o ID está na lista de enviados por nós (bot/sistema), ignorar — já foi salvo
          if (!msg.key.id || sentMessageIds.has(msg.key.id)) continue;
          // Senão: analista respondeu pelo celular — salvar como outbound no chamado ativo
          const mJid = msg.key.remoteJid ?? "";
          const mPhone = mJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
          if (mPhone) {
            const mTicket = db.prepare(
              "SELECT t.id, u.name as agent_name FROM tickets t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.whatsapp_phone = ? AND t.status NOT IN ('closed') ORDER BY t.updated_at DESC LIMIT 1"
            ).get(mPhone) as { id: number; agent_name: string | null } | undefined;
            if (mTicket) {
              const { type: mType, content: mContent } = detectMessage(msg);
              if (mContent) {
                const senderLabel = mTicket.agent_name ? `📱 ${mTicket.agent_name}` : "📱 Celular";
                db.prepare(
                  "INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'outbound', ?, ?, ?)"
                ).run(mTicket.id, mType, mContent, senderLabel);
                db.prepare("UPDATE tickets SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(mTicket.id);
                broadcastEvent("message:new", { ticketId: mTicket.id });
                logger.info({ phone: mPhone, ticketId: mTicket.id, sender: senderLabel }, "Mobile outbound message captured");
              }
            }
          }
          continue;
        }

        // 3. Deduplicação
        if (msg.key.id && isSeenMsg(msg.key.id)) continue;

        // 4. Broadcasts e listas de transmissão
        if (msg.broadcast) continue;
        if (isJidBroadcast(msg.key.remoteJid ?? "")) continue;

        // 5. Grupos
        if (isJidGroup(msg.key.remoteJid ?? "")) continue;

        // 6. Newsletters, canais de status e broadcasts do WA
        const remoteJid = msg.key.remoteJid ?? "";
        if (remoteJid.endsWith("@newsletter") || remoteJid === "status@broadcast") continue;

        // 7. Mensagens de protocolo/sistema do WhatsApp
        if (msg.message.protocolMessage) continue;

        // 8. Reações
        if (msg.message.reactionMessage) continue;

        // 9. Mensagens geradas automaticamente pelo WA Business API
        if (msg.key.id?.startsWith("BAE")) continue;

        // 10. View-once extension e outros pseudo-protocolos
        if (msg.message.viewOnceMessageV2Extension) continue;
        if (msg.message.viewOnceMessage) continue;

        // ── Processamento normal ───────────────────────────────────────────────
        const jid = msg.key.remoteJid ?? "";
        const phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        const pushName = msg.pushName ?? null;

        await handleIncomingMessage(sock, phone, pushName, msg);
      }
    });
  } catch (err) {
    logger.error({ err }, "Failed to start WhatsApp");
    state.status = "disconnected";
    reconnectTimer = setTimeout(() => startWhatsApp(), 10000);
  }
}

function clearSessionFiles() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  } catch (err) { logger.error({ err }, "Failed to clear session files"); }
}

export async function reconnect() {
  clearReconnectTimer();
  if (state.socket) { try { await state.socket.logout(); } catch { /* ignore */ } state.socket = null; }
  clearSessionFiles();
  await startWhatsApp();
}

export async function disconnect() {
  clearReconnectTimer();
  if (state.socket) { try { await state.socket.logout(); } catch { /* ignore */ } state.socket = null; }
  clearSessionFiles();
  state.status = "disconnected";
  state.qrCode = null;
  state.phoneNumber = null;
  state.profileName = null;
}

// IDs de mensagens que enviamos nós mesmos (bot/sistema), para distinguir de respostas do analista via celular
const sentMessageIds = new Set<string>();
function trackSentId(id: string) {
  sentMessageIds.add(id);
  if (sentMessageIds.size > 500) sentMessageIds.delete(sentMessageIds.values().next().value!);
}

export async function sendMessage(phone: string, text: string) {
  if (!state.socket || state.status !== "connected") {
    logger.warn("Cannot send message — WhatsApp not connected");
    return false;
  }
  try {
    const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
    const result = await state.socket.sendMessage(jid, { text });
    if (result?.key?.id) trackSentId(result.key.id);
    return true;
  } catch (err) {
    logger.error({ err, phone }, "Failed to send WhatsApp message");
    return false;
  }
}

export async function sendAudioMessage(phone: string, audioBuffer: Buffer): Promise<boolean> {
  if (!state.socket || state.status !== "connected") {
    logger.warn("Cannot send audio — WhatsApp not connected");
    return false;
  }
  try {
    const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
    const result = await state.socket.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
    });
    if (result?.key?.id) trackSentId(result.key.id);
    return true;
  } catch (err) {
    logger.error({ err, phone }, "Failed to send audio message");
    return false;
  }
}

// ─── Conversation state per phone ────────────────────────────────────────────

type ConvStep =
  | "idle"        // nunca falou antes
  | "menu"        // menu enviado, aguarda 1 ou 2
  | "ask_name"    // aguarda nome do cliente (se não identificado)
  | "branch"      // aguarda número da filial
  | "department"  // aguarda número do departamento
  | "category"    // aguarda número da categoria
  | "description" // aguarda descrição do problema
  | "active"      // chamado aberto, conversando
  | "supplier"    // modo fornecedor
  | "closed";     // chamado encerrado — aguarda próxima msg para mostrar menu

type ConvMode = "bot" | "human" | "supplier";

interface ConvState {
  step: ConvStep;
  mode: ConvMode;
  pushName: string | null;
  clientName: string | null;    // nome confirmado (digitado ou identificado)
  ticketId: number | null;
  supplierConvId: number | null; // ID da conversa de fornecedor ativa
  branchId: number | null;
  departmentId: number | null;
  categoryId: number | null;
  askNameBeforeMenu: boolean;   // true quando ask_name foi acionado antes do menu principal
}

const convStates = new Map<string, ConvState>();

// ─── Inatividade PRÉ-ticket: 2min aviso + 3min encerrar ──────────────────────
interface InactivityState {
  warnTimer: NodeJS.Timeout | null;
  closeTimer: NodeJS.Timeout | null;
}
const inactivityTimers = new Map<string, InactivityState>();

// Geração por telefone: incrementada toda vez que startPreTicketInactivity ou
// clearInactivityTimer é chamado. Os callbacks de aviso/fechamento guardam a
// geração no momento da criação e abortam se a geração atual for diferente
// (ou seja, o cliente respondeu e o timer foi reiniciado ou cancelado).
const inactivityGeneration = new Map<string, number>();

function getConvState(phone: string): ConvState {
  if (!convStates.has(phone)) {
    convStates.set(phone, { step: "idle", mode: "bot", pushName: null, clientName: null, ticketId: null, supplierConvId: null, branchId: null, departmentId: null, categoryId: null, askNameBeforeMenu: false });
  }
  return convStates.get(phone)!;
}

function resetConv(phone: string, toStep: ConvStep = "idle") {
  const conv = getConvState(phone);
  conv.step = toStep;
  conv.mode = "bot";
  conv.ticketId = null;
  conv.branchId = null;
  conv.departmentId = null;
  conv.categoryId = null;
  // clientName is kept across sessions so the user doesn't need to re-enter it
}

export function setConvMode(phone: string, mode: ConvMode) {
  const conv = getConvState(phone);
  conv.mode = mode;
  if (mode === "bot") conv.step = "idle";
  logger.info({ phone, mode }, "Conv mode changed");
}

export function getConvMode(phone: string): ConvMode {
  return getConvState(phone).mode;
}

// ─── Inatividade — 2min aviso + 3min encerrar (APENAS pré-ticket) ─────────────

function startPreTicketInactivity(phone: string) {
  clearInactivityTimer(phone);

  // Captura a geração atual APÓS clearInactivityTimer (que já a incrementou)
  const gen = inactivityGeneration.get(phone) ?? 0;

  const WARN_MS = 2 * 60 * 1000;   // 2 minutos para aviso
  const CLOSE_MS = 3 * 60 * 1000;  // mais 3 minutos para encerrar

  const timers: InactivityState = { warnTimer: null, closeTimer: null };

  timers.warnTimer = setTimeout(async () => {
    timers.warnTimer = null;

    // Se o cliente respondeu entre a criação deste timer e agora, a geração
    // foi incrementada — este callback está obsoleto, não fazer nada.
    if ((inactivityGeneration.get(phone) ?? 0) !== gen) return;

    const conv = getConvState(phone);
    if (conv.ticketId) { clearInactivityTimer(phone); return; }

    const warnMsg = getAutoMessage("inactivity_warning");
    if (warnMsg) await sendMessage(phone, warnMsg);
    savePreTicketMessage(phone, "outbound", "text", warnMsg || "Aviso de inatividade", "Sistema");

    timers.closeTimer = setTimeout(async () => {
      timers.closeTimer = null;

      // Verificação dupla: se o cliente respondeu após o aviso, a geração mudou
      if ((inactivityGeneration.get(phone) ?? 0) !== gen) return;

      inactivityTimers.delete(phone);
      const convAfter = getConvState(phone);
      if (convAfter.ticketId) return;

      const closeMsg = getAutoMessage("inactivity_closed");
      if (closeMsg) await sendMessage(phone, closeMsg);
      savePreTicketMessage(phone, "outbound", "text", closeMsg || "Encerrado por inatividade", "Sistema");

      resetConv(phone, "closed");
      logger.info({ phone }, "Pre-ticket inactivity timeout — session closed");
    }, CLOSE_MS);

  }, WARN_MS);

  inactivityTimers.set(phone, timers);
}

function clearInactivityTimer(phone: string) {
  // Incrementar a geração invalida qualquer callback de aviso/fechamento pendente
  inactivityGeneration.set(phone, (inactivityGeneration.get(phone) ?? 0) + 1);
  const timers = inactivityTimers.get(phone);
  if (timers) {
    if (timers.warnTimer) clearTimeout(timers.warnTimer);
    if (timers.closeTimer) clearTimeout(timers.closeTimer);
    inactivityTimers.delete(phone);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brasiliaHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
    10
  );
}

function getAutoMessage(trigger: string): string {
  const row = db.prepare("SELECT content FROM auto_messages WHERE trigger = ? AND active = 1").get(trigger) as { content: string } | undefined;
  const content = row?.content ?? "";
  const hour = brasiliaHour();
  const saudacao = hour >= 6 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
  return content.replace(/{saudacao}/gi, saudacao);
}

const EMOJI_DIGITS: Record<number, string> = {
  0: "0️⃣", 1: "1️⃣", 2: "2️⃣", 3: "3️⃣", 4: "4️⃣",
  5: "5️⃣", 6: "6️⃣", 7: "7️⃣", 8: "8️⃣", 9: "9️⃣",
};

function emojiNumber(n: number): string {
  if (n === 10) return "🔟";
  return String(n).split("").map(d => EMOJI_DIGITS[parseInt(d)]).join("");
}

function buildNumberedList(items: Array<{ id: number; name: string }>): string {
  return items.map((item, i) => `${emojiNumber(i + 1)} *${item.name}*`).join("\n");
}

function formatListMessage(template: string, items: Array<{ id: number; name: string }>): string {
  const list = buildNumberedList(items);
  return template.replace("{branches}", list).replace("{departments}", list).replace("{categories}", list);
}

async function sendWelcomeMenu(phone: string, nome?: string | null) {
  let msg = getAutoMessage("welcome");
  if (!msg) return;
  if (nome) {
    msg = msg.replace("{nome}", nome);
  } else {
    // Remove gracefully when name is not known: ", {nome}" → "" or "{nome}" → ""
    msg = msg.replace(/,\s*\{nome\}/g, "").replace(/\{nome\}\s*/g, "");
  }
  await sendMessage(phone, msg);
  savePreTicketMessage(phone, "outbound", "text", msg, "Bot");
}

function detectMessage(msg: any): { type: string; content: string; text: string } {
  const m = msg.message ?? {};

  if (m.conversation) return { type: "text", content: m.conversation, text: m.conversation };
  if (m.extendedTextMessage?.text) return { type: "text", content: m.extendedTextMessage.text, text: m.extendedTextMessage.text };
  if (m.audioMessage) return { type: "audio", content: "🎵 Mensagem de áudio", text: "" };
  if (m.pttMessage) return { type: "audio", content: "🎤 Mensagem de voz", text: "" };
  if (m.imageMessage) return { type: "image", content: `🖼️ Imagem${m.imageMessage.caption ? ": " + m.imageMessage.caption : ""}`, text: m.imageMessage.caption ?? "" };
  if (m.videoMessage) return { type: "video", content: `🎥 Vídeo${m.videoMessage.caption ? ": " + m.videoMessage.caption : ""}`, text: m.videoMessage.caption ?? "" };
  if (m.documentMessage) return { type: "document", content: `📄 Documento: ${m.documentMessage.fileName ?? m.documentMessage.title ?? "arquivo"}`, text: "" };
  if (m.documentWithCaptionMessage) {
    const doc = m.documentWithCaptionMessage.message?.documentMessage;
    return { type: "document", content: `📄 Documento: ${doc?.fileName ?? "arquivo"}`, text: "" };
  }
  if (m.locationMessage) return { type: "text", content: `📍 Localização: lat ${m.locationMessage.degreesLatitude?.toFixed(5)}, lng ${m.locationMessage.degreesLongitude?.toFixed(5)}`, text: "" };
  if (m.liveLocationMessage) return { type: "text", content: "📍 Localização ao vivo", text: "" };
  if (m.contactMessage) return { type: "text", content: `👤 Contato: ${m.contactMessage.displayName ?? ""}`, text: "" };
  if (m.contactsArrayMessage) return { type: "text", content: `👥 Contatos (${m.contactsArrayMessage.contacts?.length ?? 0})`, text: "" };
  if (m.stickerMessage) return { type: "image", content: "🎭 Sticker", text: "" };
  if (m.reactionMessage) return { type: "text", content: "", text: "" };

  const keys = Object.keys(m).filter(k => !["messageContextInfo", "deviceSentMessage"].includes(k));
  return { type: "text", content: `📎 Mídia: ${keys[0] ?? "desconhecida"}`, text: "" };
}

// ─── Helper: save inbound message + download media ───────────────────────────

async function saveInboundMsg(sock: WASocket, ticketId: number, msgType: string, msgContent: string, senderName: string, msg: any): Promise<void> {
  const { url: mediaUrl, mime: mediaMime } = await downloadAndSaveMedia(sock, msg);
  db.prepare(
    "INSERT INTO messages (ticket_id, direction, type, content, sender_name, media_url, media_mime) VALUES (?, 'inbound', ?, ?, ?, ?, ?)"
  ).run(ticketId, msgType, msgContent, senderName, mediaUrl, mediaMime);
}

// ─── Saudação dinâmica por horário ────────────────────────────────────────────

function getGreeting(): string {
  const hour = brasiliaHour();
  if (hour >= 6 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

// ─── Bot/automation message filter — MELHORADO ───────────────────────────────
// Detecta mensagens de: ChatGPT, Gemini, Claude, Copilot, bots internos, webhooks

const BOT_PATTERNS = [
  // Automação genérica
  /mensagem\s+autom[aá]tica/i,
  /resposta\s+autom[aá]tica/i,
  /auto[- ]?reply/i,
  /chatbot/i,
  /atendimento\s+eletr[oô]nico/i,
  /mensagem\s+gerada\s+automaticamente/i,
  /sistema\s+autom[aá]tico/i,
  /automa[çc][aã]o\s+de\s+mensagens?/i,
  /\bbot\s+responde/i,
  /resposta\s+de\s+bot/i,
  // Frases típicas de bots/auto-atendimento
  /n[aã]o\s+[eé]\s+poss[ií]vel\s+responder\s+a\s+esta\s+mensagem/i,
  /este\s+n[uú]mero\s+n[aã]o\s+recebe\s+mensagens/i,
  /contato\s+autom[aá]tico/i,
  /sou\s+um\s+robô/i,
  /sou\s+um\s+assistente\s+virtual/i,
  /estou\s+fora\s+do\s+escrit[oó]rio/i,
  /out\s+of\s+office/i,
  /fora\s+do\s+expediente.*autom[aá]tico/i,
  /n[aã]o\s+monitoramos\s+este\s+canal/i,
  /canal\s+exclusivo\s+de\s+envio/i,
  // WhatsApp Business auto-resposta
  /atendimento\s+autom[aá]tico/i,
  /bot\s+de\s+atendimento/i,
  /\bvoicebot\b/i,
  /powered\s+by\s+(chatgpt|openai|gemini|claude|gpt)/i,
  // Assistentes de IA específicos
  /\bchatgpt\b/i,
  /\bgemini\b/i,
  /\bclaude\b/i,
  /\bcopilot\b/i,
  /\bgpt[-\s]?[34o]/i,
  /\bopenai\b/i,
  /\bmeta\s+ai\b/i,
  /sou\s+um\s+assistente\s+(de\s+ia|artificial|virtual)/i,
  /sou\s+uma\s+(ia|intelig[eê]ncia\s+artificial)\b/i,
  /como\s+(assistente|modelo)\s+de\s+linguagem/i,
  /large\s+language\s+model/i,
  /\bllm\b/i,
  // Webhooks e integrações automáticas
  /webhook\s+autom[aá]tico/i,
  /notifica[çc][aã]o\s+autom[aá]tica/i,
  /este\s+[eé]\s+um\s+aviso\s+autom[aá]tico/i,
  // Indicadores adicionais de automação
  /n[aã]o\s+responda\s+(a\s+)?este\s+(e-?mail|mensagem|n[uú]mero)/i,
  /este\s+n[uú]mero\s+[eé]\s+exclusivo\s+para\s+envio/i,
  /sistema\s+de\s+notifica[çc][aã]o/i,
  /mensagem\s+enviada\s+automaticamente/i,
  /por\s+favor[\s,]+n[aã]o\s+respond/i,
  /rob[oô]\s+de\s+atendimento/i,
  /\bdo\s+not\s+reply\b/i,
  /\bnoreply\b/i,
  /atendente\s+virtual/i,
  /este\s+canal\s+[eé]\s+exclusivo/i,
];

function isBotMessage(content: string): boolean {
  if (!content) return false;
  return BOT_PATTERNS.some(p => p.test(content));
}

// ─── Message handler ─────────────────────────────────────────────────────────

async function handleIncomingMessage(sock: WASocket, phone: string, pushName: string | null, msg: any) {
  const conv = getConvState(phone);
  if (pushName) conv.pushName = pushName;

  // Restaurar nome do cliente a partir de chamados anteriores (suporta reinício do servidor)
  if (!conv.clientName) {
    const prevTicket = db.prepare(
      "SELECT client_name FROM tickets WHERE whatsapp_phone = ? AND client_name IS NOT NULL AND client_name != '' ORDER BY created_at DESC LIMIT 1"
    ).get(phone) as { client_name: string } | undefined;
    if (prevTicket?.client_name) conv.clientName = prevTicket.client_name;
  }

  const nome = conv.clientName ?? conv.pushName ?? pushName ?? "";

  const { type: msgType, content: msgContent, text } = detectMessage(msg);
  const trimmed = text.trim();

  if (msg.message?.reactionMessage) return;

  // ── BOT FILTER — ignora mensagens de bots/automações (inclui IA) ──────────
  if (isBotMessage(msgContent) || isBotMessage(text)) {
    logger.info({ phone }, "Bot/automation message detected — ignoring");
    return;
  }

  // ── MODE: HUMAN — só armazena ─────────────────────────────────────────────
  if (conv.mode === "human") {
    if (conv.ticketId) {
      await saveInboundMsg(sock, conv.ticketId, msgType, msgContent, nome, msg);
      db.prepare("UPDATE tickets SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(conv.ticketId);
      broadcastEvent("message:new", { ticketId: conv.ticketId });
      // Overlay: reset SLA timer when client responds
      processarCliente(conv.ticketId);
    }
    return;
  }

  // ── MODE/STEP: SUPPLIER ───────────────────────────────────────────────────
  // Supplier mode = canal de conversa livre. Mensagens salvas no DB.
  // Nenhum chamado é gerado. Gestores/admins visualizam pelo painel.
  if (conv.mode === "supplier" || conv.step === "supplier") {
    const supConvId = conv.supplierConvId ?? getOrCreateSupplierConversation(phone, nome || null);
    if (!conv.supplierConvId) conv.supplierConvId = supConvId;
    const { url: mediaUrl } = await downloadAndSaveMedia(sock, msg);
    saveSupplierMessage(supConvId, "inbound", msgType, msgContent, nome || "Fornecedor", mediaUrl);
    broadcastEvent("supplier:message", { conversationId: supConvId });
    return;
  }

  // ── STEP: IDLE — primeira mensagem ───────────────────────────────────────
  if (conv.step === "idle") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");

    // Se não temos nome, perguntar antes de mostrar o menu principal
    if (!nome) {
      conv.step = "ask_name";
      conv.askNameBeforeMenu = true;
      const askMsg = getAutoMessage("ask_name") || "Olá! Para melhor atendê-lo(a), por favor informe seu *nome completo*.";
      await sendMessage(phone, askMsg);
      savePreTicketMessage(phone, "outbound", "text", askMsg, "Bot");
      startPreTicketInactivity(phone);
      return;
    }

    conv.step = "menu";
    await sendWelcomeMenu(phone, nome);
    startPreTicketInactivity(phone);
    return;
  }

  // ── STEP: CLOSED — reabre automaticamente após encerramento ──────────────
  if (conv.step === "closed") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");
    conv.step = "menu";
    await sendWelcomeMenu(phone, nome);
    startPreTicketInactivity(phone);
    return;
  }

  // ── STEP: MENU ─────────────────────────────────────────────────────────────
  if (conv.step === "menu") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");
    if (trimmed === "1") {
      conv.branchId = null; conv.departmentId = null; conv.categoryId = null; conv.ticketId = null;

      // Verificar se nome já identificado
      const hasName = !!(conv.clientName || conv.pushName);
      if (!hasName) {
        conv.step = "ask_name";
        const askNameMsg = getAutoMessage("ask_name") || "Olá! Não consegui identificar seu nome. Por favor, informe seu nome completo para prosseguirmos.";
        await sendMessage(phone, askNameMsg);
        savePreTicketMessage(phone, "outbound", "text", askNameMsg, "Bot");
        startPreTicketInactivity(phone);
      } else {
        // ── Verificar se cliente já tem chamado anterior (cliente recorrente) ──
        const lastTicket = db.prepare(
          "SELECT branch_id, department_id, category_id FROM tickets WHERE whatsapp_phone = ? AND branch_id IS NOT NULL AND department_id IS NOT NULL AND category_id IS NOT NULL ORDER BY created_at DESC LIMIT 1"
        ).get(phone) as { branch_id: number; department_id: number; category_id: number } | undefined;

        if (lastTicket) {
          conv.branchId = lastTicket.branch_id;
          conv.departmentId = lastTicket.department_id;
          conv.categoryId = lastTicket.category_id;
          conv.step = "description";

          const branchRow = db.prepare("SELECT name FROM branches WHERE id = ?").get(lastTicket.branch_id) as { name: string } | undefined;
          const deptRow = db.prepare("SELECT name FROM departments WHERE id = ?").get(lastTicket.department_id) as { name: string } | undefined;
          const catRow = db.prepare("SELECT name FROM categories WHERE id = ?").get(lastTicket.category_id) as { name: string } | undefined;

          const skipMsg = `Olá, ${nome}! 👋\n\nIdentifiquei seu cadastro. Manteremos as mesmas informações do seu último chamado:\n\n📍 *Filial:* ${branchRow?.name ?? "—"}\n🏢 *Departamento:* ${deptRow?.name ?? "—"}\n🏷️ *Categoria:* ${catRow?.name ?? "—"}\n\nPor favor, descreva o problema ou solicitação:`;
          await sendMessage(phone, skipMsg);
          savePreTicketMessage(phone, "outbound", "text", skipMsg, "Bot");
          startPreTicketInactivity(phone);
        } else {
          conv.step = "branch";
          const branches = db.prepare("SELECT id, name FROM branches WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
          const branchMsg = formatListMessage(getAutoMessage("ask_branch"), branches);
          await sendMessage(phone, branchMsg);
          savePreTicketMessage(phone, "outbound", "text", branchMsg, "Bot");
          startPreTicketInactivity(phone);
        }
      }
    } else if (trimmed === "2") {
      clearInactivityTimer(phone);
      conv.step = "supplier";
      conv.mode = "supplier";
      conv.ticketId = null;
      const supConvId = getOrCreateSupplierConversation(phone, nome || null);
      conv.supplierConvId = supConvId;
      const welcomeMsg = getAutoMessage("supplier_welcome");
      if (welcomeMsg) {
        await sendMessage(phone, welcomeMsg);
        saveSupplierMessage(supConvId, "outbound", "text", welcomeMsg, "Bot");
      }
      broadcastEvent("supplier:new", { conversationId: supConvId });
    } else {
      const invalidMsg = getAutoMessage("invalid_menu");
      if (invalidMsg) await sendMessage(phone, invalidMsg);
      savePreTicketMessage(phone, "outbound", "text", invalidMsg || "Opção inválida", "Bot");
      startPreTicketInactivity(phone);
    }
    return;
  }

  // ── STEP: ASK_NAME — solicitar nome do cliente ────────────────────────────
  if (conv.step === "ask_name") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, "Cliente");
    const nameInput = text.trim();
    if (!nameInput || nameInput.length < 2) {
      const retry = "Por favor, informe um nome válido para prosseguir.";
      await sendMessage(phone, retry);
      savePreTicketMessage(phone, "outbound", "text", retry, "Bot");
      startPreTicketInactivity(phone);
      return;
    }

    conv.clientName = nameInput;

    // Se pedimos o nome antes do menu (primeiro contato sem pushName), mostrar menu agora
    if (conv.askNameBeforeMenu) {
      conv.askNameBeforeMenu = false;
      conv.step = "menu";
      await sendWelcomeMenu(phone, nameInput);
      startPreTicketInactivity(phone);
      return;
    }

    // Caso contrário: nome pedido após pressionar "1" — seguir para seleção de filial
    conv.step = "branch";
    const branches = db.prepare("SELECT id, name FROM branches WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
    const branchMsg = formatListMessage(getAutoMessage("ask_branch"), branches);
    await sendMessage(phone, branchMsg);
    savePreTicketMessage(phone, "outbound", "text", branchMsg, "Bot");
    startPreTicketInactivity(phone);
    return;
  }

  // ── STEP: BRANCH ───────────────────────────────────────────────────────────
  if (conv.step === "branch") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");
    const branches = db.prepare("SELECT id, name FROM branches WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
    const idx = parseInt(trimmed) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < branches.length) {
      conv.branchId = branches[idx].id;
      conv.step = "department";
      const departments = db.prepare("SELECT id, name FROM departments WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
      const deptMsg = formatListMessage(getAutoMessage("ask_department"), departments);
      await sendMessage(phone, deptMsg);
      savePreTicketMessage(phone, "outbound", "text", deptMsg, "Bot");
      startPreTicketInactivity(phone);
    } else {
      const errMsg = `${getAutoMessage("invalid_option")}\n\n${formatListMessage(getAutoMessage("ask_branch"), branches)}`;
      await sendMessage(phone, errMsg);
      savePreTicketMessage(phone, "outbound", "text", errMsg, "Bot");
      startPreTicketInactivity(phone);
    }
    return;
  }

  // ── STEP: DEPARTMENT ───────────────────────────────────────────────────────
  if (conv.step === "department") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");
    const departments = db.prepare("SELECT id, name FROM departments WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
    const idx = parseInt(trimmed) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < departments.length) {
      conv.departmentId = departments[idx].id;
      conv.step = "category";
      const categories = db.prepare("SELECT id, name FROM categories WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
      const catMsg = formatListMessage(getAutoMessage("ask_category"), categories);
      await sendMessage(phone, catMsg);
      savePreTicketMessage(phone, "outbound", "text", catMsg, "Bot");
      startPreTicketInactivity(phone);
    } else {
      const errMsg = `${getAutoMessage("invalid_option")}\n\n${formatListMessage(getAutoMessage("ask_department"), departments)}`;
      await sendMessage(phone, errMsg);
      savePreTicketMessage(phone, "outbound", "text", errMsg, "Bot");
      startPreTicketInactivity(phone);
    }
    return;
  }

  // ── STEP: CATEGORY ─────────────────────────────────────────────────────────
  if (conv.step === "category") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");
    const categories = db.prepare("SELECT id, name FROM categories WHERE active = 1 ORDER BY id").all() as Array<{ id: number; name: string }>;
    const idx = parseInt(trimmed) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < categories.length) {
      conv.categoryId = categories[idx].id;
      conv.step = "description";
      const descMsg = getAutoMessage("ask_description");
      await sendMessage(phone, descMsg);
      savePreTicketMessage(phone, "outbound", "text", descMsg, "Bot");
      startPreTicketInactivity(phone);
    } else {
      const errMsg = `${getAutoMessage("invalid_option")}\n\n${formatListMessage(getAutoMessage("ask_category"), categories)}`;
      await sendMessage(phone, errMsg);
      savePreTicketMessage(phone, "outbound", "text", errMsg, "Bot");
      startPreTicketInactivity(phone);
    }
    return;
  }

  // ── STEP: DESCRIPTION → criar chamado ─────────────────────────────────────
  if (conv.step === "description") {
    savePreTicketMessage(phone, "inbound", msgType, msgContent, nome || "Cliente");
    const descContent = msgContent.trim() || text.trim();
    if (!descContent) {
      const retry = "Por favor, descreva o problema para prosseguir.";
      await sendMessage(phone, retry);
      savePreTicketMessage(phone, "outbound", "text", retry, "Bot");
      startPreTicketInactivity(phone);
      return;
    }

    // Ticket criado — cancela inatividade pré-ticket definitivamente
    clearInactivityTimer(phone);

    const clientName = conv.clientName || conv.pushName || pushName || nome;
    const ticketNumber = nextTicketNumber();
    const result = db.prepare(
      `INSERT INTO tickets (ticket_number, whatsapp_phone, client_name, branch_id, department_id, category_id, description, status, last_message_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))`
    ).run(ticketNumber, phone, clientName, conv.branchId, conv.departmentId, conv.categoryId, descContent);

    const ticketId = result.lastInsertRowid as number;
    conv.ticketId = ticketId;
    conv.step = "active";

    // Importar mensagens pré-ticket para o histórico do chamado
    const preMsgs = db.prepare(
      "SELECT * FROM pre_ticket_messages WHERE phone = ? ORDER BY created_at ASC"
    ).all(phone) as any[];

    for (const pm of preMsgs) {
      db.prepare(
        "INSERT INTO messages (ticket_id, direction, type, content, sender_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(ticketId, pm.direction, pm.type, pm.content, pm.sender_name ?? null, pm.created_at);
    }

    // Limpar pré-ticket messages deste telefone após importação
    db.prepare("DELETE FROM pre_ticket_messages WHERE phone = ?").run(phone);

    await saveInboundMsg(sock, ticketId, msgType, msgContent, clientName ?? "", msg);
    db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'ticket_opened', 'Chamado aberto pelo cliente via WhatsApp')").run(ticketId);

    const confirmMsg = getAutoMessage("ticket_opened").replace("{ticketNumber}", ticketNumber);
    await sendMessage(phone, confirmMsg);
    db.prepare("INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'outbound', 'text', ?, 'Bot')").run(ticketId, confirmMsg);
    broadcastEvent("ticket:new", { ticketId });
    return;
  }

  // ── STEP: ACTIVE — chamado aberto, armazena mensagens. SEM inatividade ─────
  if (conv.step === "active" && conv.ticketId) {
    // Se o chamado estava "closed" e o cliente respondeu, reabrir automaticamente
    const currentTicket = db.prepare("SELECT status FROM tickets WHERE id = ?").get(conv.ticketId) as { status: string } | undefined;
    if (currentTicket?.status === "closed") {
      db.prepare("UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(conv.ticketId);
      db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'status_changed', ?)").run(
        conv.ticketId, "Chamado reaberto automaticamente — cliente enviou nova mensagem"
      );
    }
    await saveInboundMsg(sock, conv.ticketId, msgType, msgContent, nome, msg);
    db.prepare("UPDATE tickets SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(conv.ticketId);
    broadcastEvent("message:new", { ticketId: conv.ticketId });
    // Cancelar encerramento automático por SLA quando o cliente responde
    processarCliente(conv.ticketId);
    return;
  }

  // Fallback
  conv.step = "menu";
  await sendWelcomeMenu(phone, nome);
  startPreTicketInactivity(phone);
}

// ─── Notificações de status ───────────────────────────────────────────────────

export async function notifyStatusChange(
  ticketId: number,
  newStatus: string,
  previousStatus: string = "",
  attendantName: string = ""
) {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as any;
  if (!ticket) return;

  // ── TRANSIÇÃO PARA EM ATENDIMENTO: apresentação do atendente ───────────────
  if (newStatus === "in_progress" && previousStatus !== "in_progress") {
    const nome = attendantName || "Atendente";
    const msg =
      `Olá, ${getGreeting()}!\n\n` +
      `Sou ${nome}, analista responsável pelo seu chamado.\n\n` +
      `A partir deste momento acompanharei seu atendimento e darei continuidade à tratativa da sua solicitação.`;
    await sendMessage(ticket.whatsapp_phone, msg);
    return;
  }

  // ── FECHAR CHAMADO: mensagem de encerramento + reset da conversa ───────────
  if (newStatus === "closed") {
    clearInactivityTimer(ticket.whatsapp_phone);

    const conv = getConvState(ticket.whatsapp_phone);
    if (conv.mode !== "human") {
      const template = getAutoMessage("status_resolved");
      if (template) {
        const message = template.replace("{ticketNumber}", ticket.ticket_number);
        await sendMessage(ticket.whatsapp_phone, message);
      }
      resetConv(ticket.whatsapp_phone, "closed");
    }
    return;
  }
}

// ─── Envio de mensagem para fornecedor (chamado pela rota de API) ──────────────

export async function sendSupplierMessage(
  phone: string,
  text: string,
  agentName: string,
  conversationId?: number
): Promise<boolean> {
  const conv = getConvState(phone);
  const convId = conversationId ?? conv.supplierConvId ?? getOrCreateSupplierConversation(phone, conv.clientName ?? conv.pushName);
  if (!conv.supplierConvId) conv.supplierConvId = convId;
  const sent = await sendMessage(phone, text);
  if (sent) {
    saveSupplierMessage(convId, "outbound", "text", text, agentName);
    broadcastEvent("supplier:message", { conversationId: convId });
  }
  return sent;
}
