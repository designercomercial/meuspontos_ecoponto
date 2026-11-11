import { describe, expect, it } from "vitest";
import { DIRECAO_POR_TIPO, GRUPO_POR_TIPO, Lancamento, TipoLancamento } from "@ecoponto/contracts";
import {
  DIRECOES,
  MENOS,
  NBSP,
  TIPOS,
  chaveMes,
  formatData,
  formatDataHora,
  formatDecimal,
  formatDiaDoMes,
  formatDiaHora,
  formatInteiro,
  formatMesAno,
  formatPontos,
  formatQuantidade,
  formatReais,
  formatValorComSinal,
} from "./index.ts";

describe("números", () => {
  it("agrupa milhares com ponto, inclusive com 4 dígitos", () => {
    expect(formatInteiro(0)).toBe("0");
    expect(formatInteiro(999)).toBe("999");
    expect(formatInteiro(1250)).toBe("1.250");
    expect(formatInteiro(1234567)).toBe("1.234.567");
  });

  it("formata pontos com singular e plural", () => {
    expect(formatPontos(1250)).toBe("1.250 pontos");
    expect(formatPontos(1)).toBe("1 ponto");
    expect(formatPontos(0)).toBe("0 pontos");
  });

  it("formata reais a partir de centavos inteiros", () => {
    expect(formatReais(8640)).toBe(`R$${NBSP}86,40`);
    expect(formatReais(1250)).toBe(`R$${NBSP}12,50`);
    expect(formatReais(5)).toBe(`R$${NBSP}0,05`);
    expect(formatReais(123456)).toBe(`R$${NBSP}1.234,56`);
  });

  it("formata decimais com vírgula", () => {
    expect(formatDecimal(12.5)).toBe("12,5");
    expect(formatDecimal(3)).toBe("3");
    expect(formatDecimal(1234.25)).toBe("1.234,25");
    expect(formatDecimal(0.1 + 0.2)).toBe("0,3");
  });

  it("formata quantidade em kg ou litros", () => {
    expect(formatQuantidade({ valor: 12.5, unidade: "kg" })).toBe("12,5 kg");
    expect(formatQuantidade({ valor: 2, unidade: "litro" })).toBe("2 litros");
    expect(formatQuantidade({ valor: 1, unidade: "litro" })).toBe("1 litro");
    expect(formatQuantidade({ valor: 1.5, unidade: "litro" })).toBe("1,5 litros");
  });

  it("põe sinal + no crédito e − (U+2212) no débito", () => {
    expect(formatValorComSinal({ unidade: "pontos", pontos: 120 }, "credito")).toBe("+120 pontos");
    expect(formatValorComSinal({ unidade: "pontos", pontos: 300 }, "debito")).toBe(`${MENOS}300 pontos`);
    expect(MENOS).toBe("−");
  });

  it("não põe sinal em reais (catador), como pede a especificação", () => {
    expect(formatValorComSinal({ unidade: "reais", centavos: 1250 }, "credito")).toBe(`R$${NBSP}12,50`);
  });
});

describe("datas no fuso de Boa Vista (UTC−4)", () => {
  // 02:30 UTC do dia 1º ainda é dia 31 em Boa Vista.
  const virada = "2026-11-01T02:30:00Z";

  it("converte para o fuso de Boa Vista", () => {
    expect(formatData(virada)).toBe("31/10/2026");
    expect(formatDataHora("2026-11-08T18:32:00Z")).toBe("08/11/2026 às 14:32");
    expect(formatDiaHora("2026-11-08T18:32:00Z")).toBe("08/11 às 14:32");
  });

  it("agrupa por mês no fuso de Boa Vista", () => {
    expect(chaveMes(virada)).toBe("2026-10");
    expect(chaveMes("2026-11-01T04:00:00Z")).toBe("2026-11");
  });

  it("escreve mês por extenso em sentence case", () => {
    expect(formatMesAno("2026-11")).toBe("Novembro de 2026");
    expect(formatMesAno("2026-03")).toBe("Março de 2026");
  });

  it("usa ordinal no dia 1º", () => {
    expect(formatDiaDoMes("2026-12-01")).toBe("1º de dezembro");
    expect(formatDiaDoMes("2026-12-05")).toBe("5 de dezembro");
  });
});

describe("mapeamento de tipos", () => {
  it("cobre todos os tipos de lançamento", () => {
    for (const tipo of TipoLancamento.options) {
      expect(TIPOS[tipo].rotulo).toBeTruthy();
      expect(TIPOS[tipo].icone).toBeTruthy();
      expect(GRUPO_POR_TIPO[tipo]).toBeTruthy();
    }
  });

  it("estorno e crédito de luz devolvido são créditos", () => {
    expect(DIRECAO_POR_TIPO.estorno).toBe("credito");
    expect(DIRECAO_POR_TIPO.credito_luz_devolvido).toBe("credito");
  });

  it("resgate, doação e envio para a luz são débitos", () => {
    expect(DIRECAO_POR_TIPO.resgate).toBe("debito");
    expect(DIRECAO_POR_TIPO.doacao).toBe("debito");
    expect(DIRECAO_POR_TIPO.credito_luz_enviado).toBe("debito");
  });

  it("crédito e débito têm ícones e rótulos diferentes (não só cor)", () => {
    expect(DIRECOES.credito.icone).not.toBe(DIRECOES.debito.icone);
    expect(DIRECOES.credito.rotulo).not.toBe(DIRECOES.debito.rotulo);
  });

  it("agrupa nos filtros do histórico", () => {
    expect(GRUPO_POR_TIPO.entrega).toBe("entregas");
    expect(GRUPO_POR_TIPO.pix_entrega).toBe("entregas");
    expect(GRUPO_POR_TIPO.resgate).toBe("premios");
    expect(GRUPO_POR_TIPO.estorno).toBe("premios");
    expect(GRUPO_POR_TIPO.credito_luz_devolvido).toBe("outros");
  });

  it("o contrato rejeita um estorno marcado como débito", () => {
    const r = Lancamento.safeParse({
      id: "x",
      tipo: "estorno",
      direcao: "debito",
      descricao: "Vale cancelado",
      ocorridoEm: "2026-11-01T10:00:00-04:00",
      valor: { unidade: "pontos", pontos: 200 },
      reciboCodigo: null,
      situacaoPix: null,
    });
    expect(r.success).toBe(false);
  });
});
