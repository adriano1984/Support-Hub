import { logger } from "../lib/logger";
import { db } from "../lib/database";

type SendFn = (phone: string, text: string) => Promise<boolean>;

interface SlaState {
  ativo: boolean;
  t1: NodeJS.Timeout | null;
  t2: NodeJS.Timeout | null;
  phone?: string;
  sendFn?: SendFn;
}

const chamados = new Map<number, SlaState>();

export function ativarSLA(
  chamadoId: number,
  ticketNumber: string,
  phone?: string,
  sendFn?: SendFn
): void {
  const existing = chamados.get(chamadoId);
  if (existing) {
    if (existing.t1) clearTimeout(existing.t1);
    if (existing.t2) clearTimeout(existing.t2);
  }

  const state: SlaState = { ativo: true, t1: null, t2: null, phone, sendFn };
  chamados.set(chamadoId, state);

  logger.info({ chamadoId, phone: !!phone }, "SLA overlay: aguardando resposta do cliente");

  // ── Enviar aviso imediato ao cliente via WhatsApp ──────────────────────────
  const avisoMsg =
    `Olá! Estamos aguardando sua resposta para continuar o atendimento do chamado *${ticketNumber}*. ` +
    `Caso não haja retorno, esta solicitação será encerrada automaticamente em *5 minutos*.`;

  if (phone && sendFn) {
    sendFn(phone, avisoMsg).catch(err =>
      logger.warn({ err, chamadoId }, "SLA overlay: falha ao enviar aviso ao cliente")
    );
    try {
      db.prepare(
        "INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'outbound', 'text', ?, 'Sistema')"
      ).run(chamadoId, avisoMsg);
      db.prepare("UPDATE tickets SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(chamadoId);
      db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'sla_warning', '⏳ Aviso de inatividade enviado ao cliente via WhatsApp')").run(chamadoId);
    } catch (err) {
      logger.warn({ err, chamadoId }, "SLA overlay: falha ao registrar aviso");
    }
  }

  // 3 minutos — nota interna de alerta
  state.t1 = setTimeout(() => {
    state.t1 = null;
    if (!state.ativo) return;

    try {
      db.prepare(
        "INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'internal', 'note', ?, 'Sistema')"
      ).run(chamadoId, "⚠️ SLA: Analista aguarda retorno do cliente há 3 minutos. Encerramento automático em 2 minutos.");
      db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(chamadoId);
      db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'sla_warning', '⚠️ SLA: 3 min aguardando resposta do cliente')").run(chamadoId);
      logger.info({ chamadoId }, "SLA overlay: aviso 3min inserido");
    } catch (err) {
      logger.warn({ err, chamadoId }, "SLA overlay: falha ao inserir aviso");
    }
  }, 3 * 60 * 1000);

  // 5 minutos — encerramento automático + mensagem final ao cliente
  state.t2 = setTimeout(() => {
    state.t2 = null;
    if (!state.ativo) return;
    state.ativo = false;
    chamados.delete(chamadoId);

    const encerramentoMsg =
      `Chamado *${ticketNumber}* encerrado automaticamente — cliente não respondeu em 5 minutos.`;

    // Enviar mensagem de encerramento ao cliente via WhatsApp
    if (state.phone && state.sendFn) {
      state.sendFn(state.phone, encerramentoMsg).catch(err =>
        logger.warn({ err, chamadoId }, "SLA overlay: falha ao enviar mensagem de encerramento ao cliente")
      );
    }

    try {
      db.prepare(
        "INSERT INTO messages (ticket_id, direction, type, content, sender_name) VALUES (?, 'outbound', 'text', ?, 'Sistema')"
      ).run(chamadoId, encerramentoMsg);
      db.prepare("UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND status IN ('open','in_progress')").run(chamadoId);
      db.prepare("INSERT INTO activity_log (ticket_id, action, detail) VALUES (?, 'sla_closed', '🔒 SLA: Chamado encerrado por inatividade do cliente (5 min)')").run(chamadoId);
      logger.info({ chamadoId }, "SLA overlay: chamado encerrado por inatividade do cliente (5 min)");
    } catch (err) {
      logger.warn({ err, chamadoId }, "SLA overlay: falha ao encerrar chamado");
    }
  }, 5 * 60 * 1000);
}

export function resetarSLA(chamadoId: number): void {
  const state = chamados.get(chamadoId);
  if (!state) return;

  if (state.t1) clearTimeout(state.t1);
  if (state.t2) clearTimeout(state.t2);
  state.ativo = false;
  chamados.delete(chamadoId);
  logger.info({ chamadoId }, "SLA overlay: timer resetado (cliente respondeu)");
}

export function hasSla(chamadoId: number): boolean {
  return chamados.has(chamadoId) && (chamados.get(chamadoId)?.ativo ?? false);
}
