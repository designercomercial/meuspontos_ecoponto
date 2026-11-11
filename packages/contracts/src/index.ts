/**
 * Contratos da página "Meus Pontos".
 *
 * Compartilhados entre a API (valida o que sai) e a web (valida o que chega).
 * Todos os valores são calculados no servidor; a página só exibe.
 *
 * Usa zod/mini: mesma validação do Zod, com bundle bem menor na página
 * (meta T20: primeira tela em menos de 2 s num Android de entrada).
 */
import * as z from "zod/mini";

/** Qualquer esquema que valide e devolva T. */
export type Esquema<T> = {
  safeParse(dados: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; code: string }> } };
};

// ---------------------------------------------------------------------------
// Básicos
// ---------------------------------------------------------------------------

export const Perfil = z.enum(["cidadao", "catador"]);
export type Perfil = z.infer<typeof Perfil>;

/** Data e hora com fuso (ISO 8601). */
export const DataHora = z.iso.datetime({ offset: true });
/** Data sem hora, AAAA-MM-DD. */
export const Data = z.iso.date();
/** Mês, AAAA-MM. */
export const Mes = z.string().check(z.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use AAAA-MM"));

const Inteiro = z.int().check(z.nonnegative());
const Texto = z.string().check(z.minLength(1));

/** Pontos (cidadão). Sempre absoluto: o sinal vem de `direcao`. */
export const ValorPontos = z.object({ unidade: z.literal("pontos"), pontos: Inteiro });
/** Reais em centavos (catador). Sempre absoluto. */
export const ValorReais = z.object({ unidade: z.literal("reais"), centavos: Inteiro });
export const Valor = z.discriminatedUnion("unidade", [ValorPontos, ValorReais]);
export type Valor = z.infer<typeof Valor>;

export const Direcao = z.enum(["credito", "debito"]);
export type Direcao = z.infer<typeof Direcao>;

// ---------------------------------------------------------------------------
// Tipos de lançamento (T24)
// ---------------------------------------------------------------------------

export const TipoLancamento = z.enum([
  "entrega",
  "bonus_campanha",
  "resgate",
  "estorno",
  "doacao",
  "credito_luz_enviado",
  "credito_luz_devolvido",
  "pix_entrega",
]);
export type TipoLancamento = z.infer<typeof TipoLancamento>;

/**
 * Direção de cada tipo no livro-razão. O servidor manda `direcao` em cada
 * lançamento; este mapa só serve para rejeitar um lançamento incoerente
 * (por exemplo, um estorno marcado como débito).
 */
export const DIRECAO_POR_TIPO: Readonly<Record<TipoLancamento, Direcao>> = {
  entrega: "credito",
  bonus_campanha: "credito",
  resgate: "debito",
  estorno: "credito",
  doacao: "debito",
  credito_luz_enviado: "debito",
  credito_luz_devolvido: "credito",
  pix_entrega: "credito",
};

/** Filtro da aba Histórico. "todos" é a ausência de filtro. */
export const FiltroHistorico = z.enum(["todos", "entregas", "premios", "outros"]);
export type FiltroHistorico = z.infer<typeof FiltroHistorico>;

export const GRUPO_POR_TIPO: Readonly<Record<TipoLancamento, Exclude<FiltroHistorico, "todos">>> = {
  entrega: "entregas",
  pix_entrega: "entregas",
  resgate: "premios",
  estorno: "premios",
  bonus_campanha: "outros",
  doacao: "outros",
  credito_luz_enviado: "outros",
  credito_luz_devolvido: "outros",
};

export const SituacaoPix = z.enum(["enviado", "confirmado", "falhou"]);
export type SituacaoPix = z.infer<typeof SituacaoPix>;

export const SituacaoLuz = z.enum(["enviado", "confirmado", "devolvido"]);
export type SituacaoLuz = z.infer<typeof SituacaoLuz>;

export const Lancamento = z
  .object({
    id: Texto,
    tipo: TipoLancamento,
    direcao: Direcao,
    descricao: Texto,
    ocorridoEm: DataHora,
    valor: Valor,
    /** Entregas (e bônus ligados a uma entrega) abrem o recibo. */
    reciboCodigo: z.nullable(Texto),
    /** Só em pix_entrega. */
    situacaoPix: z.nullable(SituacaoPix),
  })
  .check(
    z.superRefine((l, ctx) => {
      if (DIRECAO_POR_TIPO[l.tipo] !== l.direcao) {
        ctx.addIssue({ code: "custom", path: ["direcao"], message: "Direção incoerente com o tipo", input: l.direcao });
      }
      const esperado = l.tipo === "pix_entrega" ? "reais" : "pontos";
      if (l.valor.unidade !== esperado) {
        ctx.addIssue({ code: "custom", path: ["valor"], message: "Unidade incoerente com o tipo", input: l.valor });
      }
      if ((l.tipo === "pix_entrega") !== (l.situacaoPix !== null)) {
        ctx.addIssue({ code: "custom", path: ["situacaoPix"], message: "Situação do Pix só em pix_entrega", input: l.situacaoPix });
      }
    }),
  );
export type Lancamento = z.infer<typeof Lancamento>;

// ---------------------------------------------------------------------------
// GET /api/cidadao/pontos/resumo
// ---------------------------------------------------------------------------

export const FormaDeReceber = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("pontos") }),
  z.object({
    tipo: z.literal("credito_luz"),
    proximoEnvioEm: Data,
    ultimoEnvio: z.nullable(z.object({ situacao: SituacaoLuz, em: DataHora, valor: ValorPontos })),
  }),
  z.object({
    tipo: z.literal("doacao"),
    beneficiario: Texto,
    doadoNoMes: ValorPontos,
  }),
]);
export type FormaDeReceber = z.infer<typeof FormaDeReceber>;

export const Cota = z.object({
  unidade: z.literal("pontos"),
  limite: Inteiro,
  usado: Inteiro,
  restante: Inteiro,
  /** 0 a 100, já calculado no servidor. */
  percentualUsado: z.number().check(z.gte(0), z.lte(100)),
  atingida: z.boolean(),
  /** Próximo dia 1º no fuso America/Boa_Vista. */
  renovaEm: Data,
});
export type Cota = z.infer<typeof Cota>;

const ResumoBase = {
  /** Identificador opaco do usuário, só para separar o cache no aparelho. */
  usuarioRef: z.string().check(z.minLength(8)),
  atualizadoEm: DataHora,
  ultimasMovimentacoes: z.array(Lancamento).check(z.maxLength(3)),
};

export const ResumoCidadao = z.object({
  perfil: z.literal("cidadao"),
  ...ResumoBase,
  /** Soma do livro-razão (T24). Nunca negativo. */
  saldo: ValorPontos,
  formaDeReceber: FormaDeReceber,
  cota: Cota,
  /** Só vem se os pontos tiverem validade (pendente de definição). */
  pontosAVencer: z.optional(z.nullable(z.object({ valor: ValorPontos, ate: Data }))),
});
export type ResumoCidadao = z.infer<typeof ResumoCidadao>;

export const ResumoCatador = z.object({
  perfil: z.literal("catador"),
  ...ResumoBase,
  recebidoNoMes: ValorReais,
  ultimoPix: z.nullable(z.object({ situacao: SituacaoPix, em: DataHora, valor: ValorReais })),
  chavePixMascarada: Texto,
});
export type ResumoCatador = z.infer<typeof ResumoCatador>;

export const Resumo = z.discriminatedUnion("perfil", [ResumoCidadao, ResumoCatador]);
export type Resumo = z.infer<typeof Resumo>;

// ---------------------------------------------------------------------------
// GET /api/cidadao/pontos/lancamentos
// ---------------------------------------------------------------------------

export const LancamentosQuery = z.object({
  mes: z.optional(Mes),
  tipo: z.optional(FiltroHistorico),
  cursor: z.optional(z.string().check(z.maxLength(200))),
  limite: z.optional(z.coerce.number().check(z.gte(1), z.lte(50), z.refine(Number.isInteger, "Inteiro"))),
});
export type LancamentosQuery = z.infer<typeof LancamentosQuery>;

export const PaginaLancamentos = z.object({
  itens: z.array(Lancamento),
  proximoCursor: z.nullable(z.string()),
});
export type PaginaLancamentos = z.infer<typeof PaginaLancamentos>;

// ---------------------------------------------------------------------------
// GET /api/cidadao/pontos/recibos/{codigo}  (T17)
// ---------------------------------------------------------------------------

export const Material = z.enum(["plastico", "papel", "metal", "vidro", "oleo"]);
export type Material = z.infer<typeof Material>;

export const Quantidade = z.object({
  valor: z.number().check(z.positive()),
  unidade: z.enum(["kg", "litro"]),
});
export type Quantidade = z.infer<typeof Quantidade>;

export const ItemRecibo = z.object({
  material: Material,
  quantidade: Quantidade,
  valor: Valor,
});
export type ItemRecibo = z.infer<typeof ItemRecibo>;

export const CodigoRecibo = z.string().check(z.regex(/^[A-Z0-9-]{4,32}$/));

export const Recibo = z.object({
  codigo: CodigoRecibo,
  perfil: Perfil,
  registradoEm: DataHora,
  ecoponto: z.object({ nome: Texto }),
  itens: z.array(ItemRecibo).check(z.minLength(1)),
  bonus: z.nullable(z.object({ campanha: Texto, valor: ValorPontos })),
  total: Valor,
  /** Só cidadão. */
  cotaRestanteApos: z.nullable(ValorPontos),
  /** Versão da tabela de valores usada nesta entrega (T29). */
  tabela: z.object({ versao: Texto, vigenteDesde: Data }),
  /** Peso digitado à mão no tablet. */
  pesoManual: z.boolean(),
  /** Só catador. */
  situacaoPix: z.nullable(SituacaoPix),
});
export type Recibo = z.infer<typeof Recibo>;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export const CodigoErro = z.enum([
  "nao_autenticado",
  "recibo_nao_encontrado",
  "parametro_invalido",
  "erro_interno",
]);
export type CodigoErro = z.infer<typeof CodigoErro>;

export const RespostaErro = z.object({ erro: CodigoErro });
export type RespostaErro = z.infer<typeof RespostaErro>;
