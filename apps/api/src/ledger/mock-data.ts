/**
 * Dados de exemplo (mock). Substituem o livro-razão (T24) e o cálculo da
 * entrega (T16), que ainda não existem. Os valores de cada item já vêm
 * "calculados", como viriam do T16, com a versão da tabela usada (T29).
 *
 * Pessoas:
 *  - cidadao-luz      4 meses de histórico, recebe em crédito na conta de luz
 *  - cidadao-doacao   doa para uma escola, cota do mês atingida
 *  - cidadao-novo     forma "pontos", sem nenhuma movimentação
 *  - catador          10 entregas pagas em Pix, 1 com falha
 */
import type { Material, Perfil, SituacaoLuz, SituacaoPix } from "@ecoponto/contracts";

export const TABELAS = {
  v2: { versao: "v2", vigenteDesde: "2026-03-01" },
  v3: { versao: "v3", vigenteDesde: "2026-10-01" },
} as const;

/** [material, quantidade (kg ou litros para óleo), valor (pontos ou centavos)] */
export type ItemFx = readonly [Material, number, number];

export type EntregaFx = {
  codigo: string;
  em: string;
  ecoponto: string;
  tabela: keyof typeof TABELAS;
  itens: readonly ItemFx[];
  pesoManual?: boolean;
  bonus?: { campanha: string; pontos: number; em: string };
  /** Só catador. */
  pix?: SituacaoPix;
};

export type OutroFx = {
  id: string;
  tipo: "resgate" | "estorno" | "doacao" | "credito_luz_enviado" | "credito_luz_devolvido";
  em: string;
  descricao: string;
  pontos: number;
  situacaoLuz?: SituacaoLuz;
};

export type FormaFx =
  | { tipo: "pontos" }
  | { tipo: "credito_luz" }
  | { tipo: "doacao"; beneficiario: string };

export type UsuarioFx = {
  id: string;
  perfil: Perfil;
  forma?: FormaFx;
  cotaLimite?: number;
  /** Só aparece se os pontos tiverem validade (pendente de definição). */
  pontosAVencer?: { pontos: number; ate: string };
  /** Chave completa: o servidor mascara antes de responder. */
  chavePix?: string;
  entregas: readonly EntregaFx[];
  outros: readonly OutroFx[];
};

/** Data de referência dos mocks (Boa Vista, UTC−4). */
export const AGORA_MOCK = "2026-11-11T10:00:00-04:00";

const CIDADAO_LUZ: UsuarioFx = {
  id: "usr_c_7f3a91",
  perfil: "cidadao",
  forma: { tipo: "credito_luz" },
  cotaLimite: 1000,
  pontosAVencer: { pontos: 69, ate: "2026-12-05" },
  entregas: [
    // Agosto – tabela v2
    { codigo: "BV-R-8K2M4Q", em: "2026-08-05T09:12:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v2",
      itens: [["plastico", 4.2, 84], ["papel", 6, 60]] },
    { codigo: "BV-R-3N7P1T", em: "2026-08-19T16:40:00-04:00", ecoponto: "Ecoponto Asa Branca", tabela: "v2",
      itens: [["metal", 2.5, 100], ["vidro", 5, 25]] },
    // Setembro – tabela v2
    { codigo: "BV-R-5D9H2W", em: "2026-09-09T08:05:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v2",
      itens: [["oleo", 2, 40], ["plastico", 3.1, 62]] },
    { codigo: "BV-R-1Q6Z8B", em: "2026-09-22T17:21:00-04:00", ecoponto: "Ecoponto Cidade Satélite", tabela: "v2",
      itens: [["papel", 8.4, 84], ["vidro", 6, 30]] },
    // Outubro – tabela v3 (nova versão; entregas antigas não mudam)
    { codigo: "BV-R-7C4X6J", em: "2026-10-07T10:30:00-04:00", ecoponto: "Ecoponto Asa Branca", tabela: "v3",
      itens: [["metal", 1.8, 81], ["plastico", 5, 110]] },
    { codigo: "BV-R-2V8L5R", em: "2026-10-15T15:02:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["vidro", 10, 60], ["papel", 5, 55]],
      bonus: { campanha: "Vidro Vale Mais", pontos: 50, em: "2026-10-15T15:02:30-04:00" } },
    { codigo: "BV-R-9F1K3M", em: "2026-10-29T11:47:00-04:00", ecoponto: "Ecoponto Cidade Satélite", tabela: "v3",
      itens: [["plastico", 2.5, 55], ["oleo", 2, 50]], pesoManual: true },
    // Novembro – tabela v3
    { codigo: "BV-R-4T6Y9P", em: "2026-11-04T09:18:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["plastico", 6, 132], ["metal", 3, 135], ["vidro", 8, 48]] },
    { codigo: "BV-R-6W3S7D", em: "2026-11-10T16:55:00-04:00", ecoponto: "Ecoponto Asa Branca", tabela: "v3",
      itens: [["papel", 12, 132], ["oleo", 3, 75], ["plastico", 4, 88]] },
  ],
  outros: [
    { id: "lan_c1_resg", tipo: "resgate", em: "2026-08-28T14:10:00-04:00",
      descricao: "Troca por kit de utensílios", pontos: 200 },
    { id: "lan_c1_estr", tipo: "estorno", em: "2026-09-03T10:00:00-04:00",
      descricao: "Vale do kit de utensílios cancelado", pontos: 200 },
    { id: "lan_c1_luz1", tipo: "credito_luz_enviado", em: "2026-11-01T06:00:00-04:00",
      descricao: "Pontos de outubro enviados para a conta de luz", pontos: 461, situacaoLuz: "enviado" },
    { id: "lan_c1_luz2", tipo: "credito_luz_devolvido", em: "2026-11-06T13:25:00-04:00",
      descricao: "Crédito de luz devolvido pela distribuidora", pontos: 461 },
  ],
};

const CIDADAO_DOACAO: UsuarioFx = {
  id: "usr_c_2b8e40",
  perfil: "cidadao",
  forma: { tipo: "doacao", beneficiario: "Escola Municipal Sol Nascente" },
  cotaLimite: 1000,
  entregas: [
    { codigo: "BV-R-0A1B2C", em: "2026-10-20T09:00:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["papel", 20, 220], ["vidro", 13.5, 81]] },
    { codigo: "BV-R-3D4E5F", em: "2026-11-03T08:30:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["metal", 8, 360], ["plastico", 11, 242]] },
    { codigo: "BV-R-6G7H8J", em: "2026-11-09T10:15:00-04:00", ecoponto: "Ecoponto Asa Branca", tabela: "v3",
      itens: [["papel", 18, 198], ["plastico", 9, 198], ["oleo", 0.2, 2]] },
  ],
  outros: [
    { id: "lan_c2_doa1", tipo: "doacao", em: "2026-10-20T09:00:30-04:00",
      descricao: "Doação para Escola Municipal Sol Nascente", pontos: 301 },
    { id: "lan_c2_doa2", tipo: "doacao", em: "2026-11-03T08:30:30-04:00",
      descricao: "Doação para Escola Municipal Sol Nascente", pontos: 602 },
    { id: "lan_c2_doa3", tipo: "doacao", em: "2026-11-09T10:15:30-04:00",
      descricao: "Doação para Escola Municipal Sol Nascente", pontos: 398 },
  ],
};

const CIDADAO_NOVO: UsuarioFx = {
  id: "usr_c_9d0c12",
  perfil: "cidadao",
  forma: { tipo: "pontos" },
  cotaLimite: 1000,
  entregas: [],
  outros: [],
};

const CATADOR: UsuarioFx = {
  id: "usr_k_51aa07",
  perfil: "catador",
  chavePix: "123.456.789-09",
  entregas: [
    // Outubro
    { codigo: "BV-R-K1A2B3", em: "2026-10-03T07:40:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["plastico", 8, 1040], ["papel", 15, 900]], pix: "confirmado" },
    { codigo: "BV-R-K4C5D6", em: "2026-10-09T08:15:00-04:00", ecoponto: "Ecoponto Asa Branca", tabela: "v3",
      itens: [["metal", 4, 2000], ["vidro", 12, 300]], pix: "confirmado", pesoManual: true },
    { codigo: "BV-R-K7E8F9", em: "2026-10-16T09:02:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["papel", 20, 1200], ["plastico", 3, 390]], pix: "confirmado" },
    { codigo: "BV-R-K0G1H2", em: "2026-10-23T07:55:00-04:00", ecoponto: "Ecoponto Cidade Satélite", tabela: "v3",
      itens: [["metal", 3.5, 1750], ["plastico", 7, 910]], pix: "confirmado" },
    { codigo: "BV-R-K3J4K5", em: "2026-10-30T08:20:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["plastico", 10, 1300], ["vidro", 20, 500]], pix: "confirmado" },
    // Novembro (confirmados somam R$ 86,40)
    { codigo: "BV-R-K6L7M8", em: "2026-11-02T07:30:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["metal", 3, 1500], ["plastico", 5, 650]], pix: "confirmado" },
    { codigo: "BV-R-K9N0P1", em: "2026-11-04T08:45:00-04:00", ecoponto: "Ecoponto Asa Branca", tabela: "v3",
      itens: [["papel", 18, 1080], ["metal", 1.5, 750], ["vidro", 2.4, 60]], pix: "confirmado" },
    { codigo: "BV-R-K2Q3R4", em: "2026-11-06T07:50:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["metal", 2.5, 1250], ["plastico", 7.5, 975], ["papel", 4, 240]], pix: "confirmado" },
    { codigo: "BV-R-K5S6T7", em: "2026-11-09T09:10:00-04:00", ecoponto: "Ecoponto Cidade Satélite", tabela: "v3",
      itens: [["plastico", 9.5, 1235], ["papel", 15, 900]], pix: "confirmado" },
    { codigo: "BV-R-K8U9V0", em: "2026-11-10T08:05:00-04:00", ecoponto: "Ecoponto Centro", tabela: "v3",
      itens: [["plastico", 5, 650], ["papel", 10, 600]], pix: "falhou" },
  ],
  outros: [],
};

export const USUARIOS: readonly UsuarioFx[] = [CIDADAO_LUZ, CIDADAO_DOACAO, CIDADAO_NOVO, CATADOR];

/** Tokens de desenvolvimento → usuário. Nunca usar em produção. */
export const TOKENS_DEV: Readonly<Record<string, string>> = {
  "dev-cidadao-luz": CIDADAO_LUZ.id,
  "dev-cidadao-doacao": CIDADAO_DOACAO.id,
  "dev-cidadao-novo": CIDADAO_NOVO.id,
  "dev-catador": CATADOR.id,
};
