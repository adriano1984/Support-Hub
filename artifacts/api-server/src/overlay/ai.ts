import { logger } from "../lib/logger";

export async function gerarIA(mensagem: string, usuario: string, contexto?: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY não configurada");
  }

  const systemPrompt = [
    "Você é um técnico de suporte de TI de uma empresa brasileira.",
    "Responda de forma curta, direta e profissional em português.",
    "Nunca mencione que você é uma IA ou assistente virtual.",
    "Se não souber a resposta, sugira verificar junto ao usuário.",
  ].join(" ");

  const userPrompt = contexto
    ? `Histórico recente do chamado:\n${contexto}\n\nÚltima mensagem do cliente:\n${mensagem}\n\nSugira uma resposta profissional para o analista ${usuario} enviar:`
    : `Mensagem do cliente: ${mensagem}\n\nSugira uma resposta profissional para o analista ${usuario} enviar:`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    const text: string = data.choices?.[0]?.message?.content ?? "";
    return text.trim();
  } catch (err) {
    logger.warn({ err }, "Groq AI request failed");
    throw err;
  }
}
