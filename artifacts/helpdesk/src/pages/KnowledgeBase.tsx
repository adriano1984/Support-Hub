import { useState } from "react";
import { Search, BookOpen, Printer, Smartphone, Monitor, Wifi, FileText, HardDrive, ChevronRight, HelpCircle, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Article {
  id: number;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  content: string[];
}

const ARTICLES: Article[] = [
  {
    id: 1,
    title: "Como abrir um chamado via WhatsApp",
    summary: "Passo a passo para que o usuário abra um chamado de TI pelo WhatsApp.",
    category: "SHEEPS (WhatsApp)",
    tags: ["whatsapp", "chamado", "abertura"],
    content: [
      "Envie uma mensagem para o número do suporte de TI.",
      "Quando o bot responder, digite '1' para abrir um chamado.",
      "Informe sua filial quando solicitado.",
      "Escolha o departamento e a categoria do problema.",
      "Descreva o problema brevemente.",
      "Anote o número do chamado que será gerado — é com ele que você acompanha o status.",
    ],
  },
  {
    id: 2,
    title: "Problemas comuns com impressoras e scanners",
    summary: "Soluções rápidas para os problemas mais frequentes com impressoras.",
    category: "IMPRESSORA/SCANNERS",
    tags: ["impressora", "scanner", "papel", "toner"],
    content: [
      "Impressora offline: verifique o cabo USB/rede e reinicie o equipamento.",
      "Papel preso: abra a tampa traseira e remova o papel com cuidado, puxando no sentido do caminho do papel.",
      "Qualidade ruim de impressão: substitua o toner ou cartucho.",
      "Scanner não reconhecido: reinstale o driver pelo site do fabricante.",
      "Erro 'Fila de impressão travada': acesse Serviços do Windows > Spooler de Impressão > Reiniciar.",
    ],
  },
  {
    id: 3,
    title: "Computador lento — primeiros passos",
    summary: "Dicas básicas para resolver lentidão no computador.",
    category: "COMPUTADOR",
    tags: ["computador", "lentidão", "desempenho"],
    content: [
      "Reinicie o computador (não apenas deixe hibernar).",
      "Verifique o uso de CPU/memória pelo Gerenciador de Tarefas (Ctrl+Shift+Esc).",
      "Feche programas desnecessários na inicialização (Gerenciador de Tarefas > Inicializar).",
      "Execute a limpeza de disco (Windows + R > cleanmgr).",
      "Verifique se há atualizações do Windows pendentes.",
      "Se o problema persistir, abra um chamado de TI informando os sintomas.",
    ],
  },
  {
    id: 4,
    title: "Erro ao emitir nota fiscal (SEFAZ)",
    summary: "O que fazer quando surge erro de comunicação com a SEFAZ.",
    category: "SEFAZ (erro ao faturar)",
    tags: ["sefaz", "nfe", "faturamento", "nota fiscal"],
    content: [
      "Verifique se a internet está funcionando normalmente.",
      "Confirme se o certificado digital está válido (não expirado).",
      "Acesse o painel da SEFAZ do seu estado para verificar se há instabilidade.",
      "Se o erro for de código/rejeição específica (ex: código 539, 204), anote o código e abra um chamado de TI com essa informação.",
      "Não tente reenviar repetidamente sem entender o erro — pode gerar duplicidade.",
    ],
  },
  {
    id: 5,
    title: "Configuração de telefone NINES (VoIP)",
    summary: "Como configurar e resolver problemas com o telefone VoIP.",
    category: "NINES (telefone)",
    tags: ["telefone", "voip", "ramal", "nines"],
    content: [
      "Verifique se o cabo de rede está conectado ao telefone.",
      "O telefone precisa estar na rede correta (VLAN de voz quando aplicável).",
      "Se o telefone mostrar 'Sem serviço' ou 'Registrando', aguarde 2 minutos após conectar.",
      "Para reiniciar: pressione Menu > Status > Reiniciar.",
      "Se o ramal não aparecer, abra chamado de TI informando o número do ramal e a filial.",
    ],
  },
  {
    id: 6,
    title: "Periféricos — mouse, teclado e fones",
    summary: "Dicas para resolver problemas com periféricos do dia a dia.",
    category: "PERIFÉRICOS (fone, mouse, teclados e outros)",
    tags: ["mouse", "teclado", "fone", "periférico", "USB"],
    content: [
      "Tente desconectar e reconectar o USB em outra porta.",
      "Mouse sem fio: troque as pilhas e verifique o receptor USB.",
      "Teclado digitando errado: verifique o layout (PT-BR vs EN-US) pelo canto inferior direito do Windows.",
      "Fone sem áudio: verifique se o áudio padrão está configurado (barra de tarefas > ícone de som > Dispositivos de reprodução).",
      "Se nenhuma dessas soluções funcionar, troque por outro equipamento e abra chamado de TI.",
    ],
  },
  {
    id: 7,
    title: "Acessando o sistema EORBIS",
    summary: "Problemas comuns de acesso e login no EORBIS.",
    category: "EORBIS",
    tags: ["eorbis", "sistema", "login", "acesso"],
    content: [
      "Se não conseguir login: verifique caps lock e tente redefinir a senha no sistema.",
      "Tela em branco ao abrir: limpe o cache do navegador (Ctrl+Shift+Delete).",
      "Lentidão no sistema: verifique sua conexão com a internet e tente outro navegador.",
      "Erro de sessão expirada: feche o navegador completamente e abra novamente.",
      "Para solicitação de novo acesso, abra um chamado com o nome completo do usuário e filial.",
    ],
  },
  {
    id: 8,
    title: "Software — instalação e atualização",
    summary: "Procedimentos para instalação e atualização de softwares.",
    category: "SOFTWARE",
    tags: ["software", "instalação", "atualização", "licença"],
    content: [
      "Instalações de software precisam de autorização do TI — abra um chamado especificando o software e a finalidade.",
      "Nunca instale softwares de fontes desconhecidas.",
      "Para atualizações do Windows, o TI pode gerenciar remotamente para evitar interrupções no horário de trabalho.",
      "Se um software travar ou não abrir, tente: fechar pelo Gerenciador de Tarefas e reabrir.",
      "Problemas de licença ou expiração: abra chamado urgente com foto da mensagem de erro.",
    ],
  },
];

const CATEGORIES = [...new Set(ARTICLES.map(a => a.category))];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "SHEEPS (WhatsApp)": Smartphone,
  "IMPRESSORA/SCANNERS": Printer,
  "COMPUTADOR": Monitor,
  "SEFAZ (erro ao faturar)": FileText,
  "NINES (telefone)": Wifi,
  "PERIFÉRICOS (fone, mouse, teclados e outros)": HardDrive,
  "EORBIS": Monitor,
  "SOFTWARE": HardDrive,
};

export default function KnowledgeBase() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Article | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const filtered = ARTICLES.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || a.title.toLowerCase().includes(q)
      || a.summary.toLowerCase().includes(q)
      || a.tags.some(t => t.includes(q))
      || a.category.toLowerCase().includes(q);
    const matchCat = !categoryFilter || a.category === categoryFilter;
    return matchSearch && matchCat;
  });

  if (selected) {
    const Icon = CATEGORY_ICONS[selected.category] ?? BookOpen;
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Voltar à Base de Conhecimento
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <Badge variant="secondary" className="text-xs mb-1">{selected.category}</Badge>
            <h1 className="text-2xl font-bold">{selected.title}</h1>
          </div>
        </div>

        <p className="text-muted-foreground mb-6">{selected.summary}</p>

        <div className="bg-card border rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-4">Procedimento</h2>
          <ol className="space-y-3">
            {selected.content.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {selected.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
          ))}
        </div>

        <div className="mt-8 p-4 bg-muted/50 rounded-xl flex items-center gap-3">
          <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <div className="text-sm font-medium">Ainda com dúvidas?</div>
            <div className="text-xs text-muted-foreground">Abra um chamado pelo WhatsApp ou pela lista de chamados.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Base de Conhecimento</h1>
        </div>
        <p className="text-muted-foreground">
          Encontre respostas rápidas para os problemas mais comuns de TI.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Buscar artigos, problemas, categorias..."
          className="pl-11 h-11 text-base"
          value={search}
          onChange={e => { setSearch(e.target.value); setCategoryFilter(null); }}
        />
      </div>

      {/* Category pills */}
      {!search && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              !categoryFilter
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {CATEGORIES.map(cat => {
            const Icon = CATEGORY_ICONS[cat] ?? BookOpen;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <div className="font-medium">Nenhum artigo encontrado</div>
          <div className="text-sm mt-1">Tente outro termo ou abra um chamado de TI.</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(article => {
            const Icon = CATEGORY_ICONS[article.category] ?? BookOpen;
            return (
              <button
                key={article.id}
                onClick={() => setSelected(article)}
                className="text-left bg-card border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Badge variant="secondary" className="text-[10px] mb-1">{article.category}</Badge>
                    <h3 className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{article.summary}</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {article.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-10 p-5 bg-muted/50 border rounded-xl flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <HelpCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="font-medium text-sm">Não encontrou o que procurava?</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Nossa equipe está pronta para ajudar. Abra um chamado via WhatsApp ou pela lista de chamados.
          </div>
        </div>
      </div>
    </div>
  );
}
