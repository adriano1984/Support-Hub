export { gerarIA } from "./ai";
export { analyzeTicketLocally } from "./ai-local";
export { ativarSLA, resetarSLA, hasSla } from "./sla";
export { formatarAnalista } from "./format";
export { saudacao, detectaGatilho } from "./rules";

import { ativarSLA } from "./sla";
import { detectaGatilho } from "./rules";
import { resetarSLA } from "./sla";

type SendFn = (phone: string, text: string) => Promise<boolean>;

export function processarAnalista(
  chamadoId: number,
  ticketNumber: string,
  mensagem: string,
  phone?: string,
  sendFn?: SendFn
): void {
  if (detectaGatilho(mensagem)) {
    ativarSLA(chamadoId, ticketNumber, phone, sendFn);
  }
}

export function processarCliente(chamadoId: number): void {
  resetarSLA(chamadoId);
}
