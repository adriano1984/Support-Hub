import { db } from "../lib/database";

interface SimilarTicket {
  id: number;
  ticket_number: string;
  description: string;
  category_name: string;
  score: number;
  resolution: string | null;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2)
  );
}

function cosineSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const tok of a) { if (b.has(tok)) inter++; }
  return inter / Math.sqrt(a.size * b.size);
}

function findSimilarTickets(description: string, excludeId?: number, limit = 5): SimilarTicket[] {
  const queryTokens = tokenize(description);
  if (!queryTokens.size) return [];

  const candidates = db.prepare(`
    SELECT t.id, t.ticket_number, t.description, c.name AS category_name,
      (SELECT m.content FROM messages m
       WHERE m.ticket_id = t.id AND m.direction = 'outbound' AND m.type = 'text'
       ORDER BY m.created_at DESC LIMIT 1) AS resolution
    FROM tickets t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.status IN ('closed', 'resolved')
      AND t.description IS NOT NULL
      AND t.description != ''
      ${excludeId ? "AND t.id != " + excludeId : ""}
    ORDER BY t.created_at DESC
    LIMIT 200
  `).all() as any[];

  return candidates
    .map(t => ({
      ...t,
      score: cosineSimilarity(queryTokens, tokenize(t.description ?? "")),
    }))
    .filter(t => t.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "com", "que", "para", "não", "por", "uma", "como", "mais", "mas",
    "sei", "ela", "ele", "nos", "são", "das", "dos", "nas", "nos",
    "sem", "foi", "quando", "muito", "está", "esse", "essa", "isso",
    "tem", "ter", "ser", "sua", "seu", "meu", "minha", "você", "eles",
  ]);
  return [...tokenize(text)].filter(t => !stopWords.has(t)).slice(0, 8);
}

function detectUrgency(text: string): "low" | "medium" | "high" {
  const lc = text.toLowerCase();
  const highSignals = ["urgente", "parado", "travado", "não funciona", "quebrou", "crash", "erro crítico", "caiu", "fora do ar"];
  const medSignals = ["lento", "problema", "falhou", "dificuldade", "precisando", "demora"];
  if (highSignals.some(s => lc.includes(s))) return "high";
  if (medSignals.some(s => lc.includes(s))) return "medium";
  return "low";
}

function generateSuggestion(
  description: string,
  context: string,
  similar: SimilarTicket[],
  categoryName: string | null
): string {
  const urgency = detectUrgency(description + " " + context);
  const keywords = extractKeywords(description);

  const lines: string[] = [];

  if (similar.length > 0) {
    const best = similar[0];
    if (best.resolution) {
      lines.push(`Baseado em chamados similares resolvidos (${best.ticket_number}), uma resposta adequada seria:`);
      lines.push("");
      lines.push(best.resolution.slice(0, 400));

      if (similar.length > 1) {
        const others = similar.slice(1, 3).map(s => s.ticket_number).join(", ");
        lines.push("");
        lines.push(`📋 Chamados de referência similares: ${others}`);
      }
    } else {
      lines.push(`Encontrei ${similar.length} chamado(s) similar(es) na base de histórico.`);
      lines.push("");
      const bestDesc = best.description?.slice(0, 200) ?? "";
      lines.push(`O chamado mais próximo (${best.ticket_number}) descrevia: "${bestDesc}..."`);
      lines.push("");
      lines.push("Recomendo verificar como foi resolvido anteriormente e aplicar a mesma solução.");
    }
  } else {
    lines.push(buildGenericSuggestion(description, context, categoryName, urgency, keywords));
  }

  return lines.join("\n");
}

function buildGenericSuggestion(
  description: string,
  context: string,
  categoryName: string | null,
  urgency: "low" | "medium" | "high",
  keywords: string[]
): string {
  const lc = (description + " " + context).toLowerCase();
  const parts: string[] = [];

  const urgencyMap = {
    high: "Entendo a urgência da situação.",
    medium: "Compreendo o problema relatado.",
    low: "Obrigado pelo contato.",
  };
  parts.push(urgencyMap[urgency]);
  parts.push("");

  if (lc.match(/senha|acesso|login|entrar|sistema/)) {
    parts.push("Para resolver o problema de acesso:");
    parts.push("1. Verifique se o Caps Lock está desativado");
    parts.push("2. Tente redefinir a senha pelo portal de TI");
    parts.push("3. Se o problema persistir, farei o desbloqueio manual");
  } else if (lc.match(/lento|devagar|travando|trava|desempenho/)) {
    parts.push("Para o problema de lentidão, recomendo:");
    parts.push("1. Reiniciar a máquina e verificar programas em execução");
    parts.push("2. Limpar arquivos temporários (Ctrl + Shift + Del)");
    parts.push("3. Verificar espaço em disco disponível");
  } else if (lc.match(/impressora|imprimir|impressão|papel/)) {
    parts.push("Para o problema com impressão:");
    parts.push("1. Verifique a fila de impressão e cancele trabalhos pendentes");
    parts.push("2. Reinicie o serviço de spooler (Serviços → Print Spooler)");
    parts.push("3. Confirme se o driver da impressora está atualizado");
  } else if (lc.match(/internet|rede|wi.?fi|conexão|conectar/)) {
    parts.push("Para o problema de conectividade:");
    parts.push("1. Reinicie o roteador/switch local");
    parts.push("2. Verifique as configurações de IP e DNS");
    parts.push("3. Teste com um cabo de rede diferente se possível");
  } else if (lc.match(/email|e-mail|outlook|correio/)) {
    parts.push("Para o problema com e-mail:");
    parts.push("1. Verifique se o Outlook está atualizado");
    parts.push("2. Repare o perfil do Outlook (Painel de Controle → Email)");
    parts.push("3. Tente acessar pelo webmail para isolar o problema");
  } else {
    const cat = categoryName ? ` de ${categoryName}` : "";
    parts.push(`Para resolver este chamado${cat}:`);
    parts.push("1. Coletarei mais informações sobre o ambiente");
    parts.push("2. Verificarei logs e configurações do sistema");
    parts.push("3. Retornarei com uma solução ou próximos passos");
  }

  if (keywords.length > 0) {
    parts.push("");
    parts.push(`Posso verificar itens relacionados: ${keywords.slice(0, 4).join(", ")}.`);
  }

  return parts.join("\n");
}

export interface AiAnalysis {
  suggestion: string;
  similarCount: number;
  urgency: "low" | "medium" | "high";
  keywords: string[];
  similarTickets: Array<{ id: number; ticketNumber: string; score: number }>;
  source: "history" | "rules";
}

export function analyzeTicketLocally(
  ticketId: number,
  description: string,
  messages: Array<{ direction: string; content: string; sender_name: string }>,
  categoryName: string | null
): AiAnalysis {
  const context = messages
    .filter(m => m.direction !== "internal")
    .slice(-6)
    .map(m => `[${m.direction === "inbound" ? "Cliente" : m.sender_name}]: ${m.content}`)
    .join("\n");

  const fullText = description + "\n" + context;
  const similar = findSimilarTickets(fullText, ticketId, 5);
  const urgency = detectUrgency(fullText);
  const keywords = extractKeywords(fullText);

  const suggestion = generateSuggestion(description, context, similar, categoryName);

  return {
    suggestion,
    similarCount: similar.length,
    urgency,
    keywords,
    similarTickets: similar.map(s => ({ id: s.id, ticketNumber: s.ticket_number, score: Math.round(s.score * 100) })),
    source: similar.length > 0 ? "history" : "rules",
  };
}

export function getSimilarResolved(description: string, limit = 5): SimilarTicket[] {
  return findSimilarTickets(description, undefined, limit);
}
