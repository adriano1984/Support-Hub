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

export function saudacao(nome: string): string {
  const hora = brasiliaHour();
  let texto = "Bom dia";
  if (hora >= 12 && hora < 18) texto = "Boa tarde";
  if (hora >= 18) texto = "Boa noite";
  return `👤 *${nome}:* ${texto}!`;
}

export const GATILHOS_SLA = [
  // Espera de resposta / confirmação
  "verifica",
  "confirma",
  "confirme",
  "pode confirmar",
  "me confirme",
  "aguardo retorno",
  "aguardando retorno",
  "aguardo sua resposta",
  "aguardando resposta",
  "aguardando confirmação",
  "aguardando confirmacao",
  "aguardo confirmação",
  "aguardo confirmacao",
  "aguardando o cliente",
  "aguardando você",
  "aguardando voce",

  // Solicitação de envio
  "me envie",
  "me manda",
  "me encaminhe",
  "favor enviar",
  "por favor envie",
  "pode me passar",
  "consegue me enviar",
  "pode informar",
  "me informe",
  "me passe",

  // AnyDesk e acesso remoto
  "anydesk",
  "teamviewer",
  "id do anydesk",
  "código anydesk",
  "codigo anydesk",
  "id anydesk",
  "acesso remoto",
  "me passe o id",
  "me passe o código",
  "me passe o codigo",

  // Teste e verificação
  "teste",
  "pode testar",
  "tente novamente",
  "tenta novamente",
  "tente acessar",
  "pode acessar",
  "verifique",

  // Outros atributos de espera
  "quando puder",
  "quando tiver",
  "assim que",
  "me retorne",
  "retorne assim que",
];

export function detectaGatilho(mensagem: string): boolean {
  const lower = mensagem.toLowerCase();
  return GATILHOS_SLA.some(g => lower.includes(g));
}
