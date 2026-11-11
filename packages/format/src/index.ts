/**
 * Formatação pt-BR e mapeamento de tipos para a tela.
 *
 * Nada aqui calcula pontos, valores, cota ou saldo: só transforma o que o
 * servidor mandou em texto. Datas sempre no fuso de Boa Vista.
 */
import type {
  Direcao,
  Material,
  Quantidade,
  SituacaoLuz,
  SituacaoPix,
  TipoLancamento,
  Valor,
} from "@ecoponto/contracts";

export const FUSO = "America/Boa_Vista";

/** Sinal de menos tipográfico (U+2212), não hífen. */
export const MENOS = "−";
/** Espaço sem quebra, para "R$ 86,40" não quebrar no meio. */
export const NBSP = " ";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/**
 * 1250 → "1.250". Agrupa à mão porque o ICU em pt-BR não separa números de
 * 4 dígitos ("1250"), e a especificação pede "1.250 pontos".
 */
export function formatInteiro(n: number): string {
  if (!Number.isFinite(n)) return "";
  const agrupado = String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? MENOS : "") + agrupado;
}

/** 12.5 → "12,5"; 1234.5 → "1.234,5"; até 3 casas. */
export function formatDecimal(n: number): string {
  const [int = "0", frac] = Math.abs(n).toFixed(3).replace(/0+$/, "").replace(/\.$/, "").split(".");
  return (n < 0 ? MENOS : "") + formatInteiro(Number(int)) + (frac ? `,${frac}` : "");
}

/** 1250 → "1.250 pontos"; 1 → "1 ponto". */
export function formatPontos(pontos: number): string {
  return `${formatInteiro(pontos)} ${Math.abs(pontos) === 1 ? "ponto" : "pontos"}`;
}

/** 8640 → "R$ 86,40". Recebe centavos inteiros para não errar arredondamento. */
export function formatReais(centavos: number): string {
  const abs = Math.abs(Math.trunc(centavos));
  const reais = Math.trunc(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${centavos < 0 ? MENOS : ""}R$${NBSP}${formatInteiro(reais)},${cents}`;
}

/** { 12.5, kg } → "12,5 kg"; { 2, litro } → "2 litros". */
export function formatQuantidade(q: Quantidade): string {
  if (q.unidade === "kg") return `${formatDecimal(q.valor)} kg`;
  return `${formatDecimal(q.valor)} ${q.valor === 1 ? "litro" : "litros"}`;
}

/** Valor sem sinal: "120 pontos" ou "R$ 12,50". */
export function formatValor(v: Valor): string {
  return v.unidade === "pontos" ? formatPontos(v.pontos) : formatReais(v.centavos);
}

/**
 * Valor com sinal para o histórico.
 * Pontos: "+120 pontos" / "−300 pontos". Reais (catador): "R$ 12,50", sem sinal,
 * como pede a especificação; ali o ícone e o texto de apoio dizem a direção.
 */
export function formatValorComSinal(v: Valor, direcao: Direcao): string {
  const base = formatValor(v);
  if (v.unidade === "reais") return base;
  return (direcao === "credito" ? "+" : MENOS) + base;
}

// ---------------------------------------------------------------------------
// Datas (fuso de Boa Vista)
// ---------------------------------------------------------------------------

type Partes = { ano: string; mes: string; dia: string; hora: string; minuto: string };

const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partes(iso: string): Partes {
  const p: Record<string, string> = {};
  for (const { type, value } of partesFmt.formatToParts(new Date(iso))) p[type] = value;
  return { ano: p.year ?? "", mes: p.month ?? "", dia: p.day ?? "", hora: p.hour ?? "", minuto: p.minute ?? "" };
}

/** "2026-11-08T18:32:00Z" → "08/11/2026" (em Boa Vista). */
export function formatData(iso: string): string {
  const p = partes(iso);
  return `${p.dia}/${p.mes}/${p.ano}`;
}

/** → "08/11/2026 às 14:32". */
export function formatDataHora(iso: string): string {
  const p = partes(iso);
  return `${p.dia}/${p.mes}/${p.ano} às ${p.hora}:${p.minuto}`;
}

/** → "08/11 às 14:32". Usado no aviso de offline. */
export function formatDiaHora(iso: string): string {
  const p = partes(iso);
  return `${p.dia}/${p.mes} às ${p.hora}:${p.minuto}`;
}

/** → "2026-11". Chave para agrupar o histórico por mês. */
export function chaveMes(iso: string): string {
  const p = partes(iso);
  return `${p.ano}-${p.mes}`;
}

/** "2026-11" → "Novembro de 2026". */
export function formatMesAno(chave: string): string {
  const [ano, mes] = chave.split("-");
  const nome = MESES[Number(mes) - 1] ?? "";
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

/** Data sem hora "2026-12-01" → "1º de dezembro"; "2026-12-05" → "5 de dezembro". */
export function formatDiaDoMes(data: string): string {
  const [, mes, dia] = data.split("-");
  const d = Number(dia);
  return `${d === 1 ? "1º" : d} de ${MESES[Number(mes) - 1] ?? ""}`;
}

/** Data sem hora "2026-12-05" → "05/12/2026", sem conversão de fuso. */
export function formatDataSimples(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ---------------------------------------------------------------------------
// Mapeamento de tipos para a tela
// ---------------------------------------------------------------------------

/** Nomes de ícones Lucide usados pela página (a web mapeia nome → SVG). */
export type NomeIcone =
  | "recycle"
  | "sparkles"
  | "gift"
  | "undo-2"
  | "heart-handshake"
  | "zap"
  | "zap-off"
  | "banknote"
  | "arrow-down-left"
  | "arrow-up-right"
  | "circle-check"
  | "send"
  | "triangle-alert"
  | "rotate-ccw";

export type InfoTipo = { rotulo: string; icone: NomeIcone };

export const TIPOS: Readonly<Record<TipoLancamento, InfoTipo>> = {
  entrega: { rotulo: "Entrega", icone: "recycle" },
  bonus_campanha: { rotulo: "Bônus de campanha", icone: "sparkles" },
  resgate: { rotulo: "Troca de prêmio", icone: "gift" },
  estorno: { rotulo: "Vale cancelado", icone: "undo-2" },
  doacao: { rotulo: "Doação", icone: "heart-handshake" },
  credito_luz_enviado: { rotulo: "Enviado para a conta de luz", icone: "zap" },
  credito_luz_devolvido: { rotulo: "Crédito de luz devolvido", icone: "zap-off" },
  pix_entrega: { rotulo: "Pix da entrega", icone: "banknote" },
};

export type InfoDirecao = { rotulo: string; icone: NomeIcone };

/** Crédito = ícone de entrada; débito = ícone de saída. Nunca só cor. */
export const DIRECOES: Readonly<Record<Direcao, InfoDirecao>> = {
  credito: { rotulo: "Crédito", icone: "arrow-down-left" },
  debito: { rotulo: "Débito", icone: "arrow-up-right" },
};

export type Tom = "sucesso" | "info" | "aviso";
export type InfoSituacao = { rotulo: string; icone: NomeIcone; tom: Tom; detalhe?: string };

export const SITUACOES_PIX: Readonly<Record<SituacaoPix, InfoSituacao>> = {
  enviado: { rotulo: "Pix enviado", icone: "send", tom: "info", detalhe: "Aguardando confirmação do banco." },
  confirmado: { rotulo: "Pix confirmado", icone: "circle-check", tom: "sucesso" },
  falhou: {
    rotulo: "Pix falhou",
    icone: "triangle-alert",
    tom: "aviso",
    detalhe: "Uma nova tentativa será feita automaticamente.",
  },
};

export const SITUACOES_LUZ: Readonly<Record<SituacaoLuz, InfoSituacao>> = {
  enviado: {
    rotulo: "Enviado",
    icone: "send",
    tom: "info",
    detalhe: "Aguardando a confirmação da distribuidora.",
  },
  confirmado: { rotulo: "Confirmado", icone: "circle-check", tom: "sucesso" },
  devolvido: {
    rotulo: "Devolvido",
    icone: "rotate-ccw",
    tom: "aviso",
    detalhe: "A distribuidora não aceitou o crédito. Os pontos voltaram para o seu saldo.",
  },
};

export const MATERIAIS: Readonly<Record<Material, string>> = {
  plastico: "Plástico",
  papel: "Papel",
  metal: "Metal",
  vidro: "Vidro",
  oleo: "Óleo de cozinha",
};
