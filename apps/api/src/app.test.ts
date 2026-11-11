import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PaginaLancamentos, Recibo, Resumo, type Lancamento } from "@ecoponto/contracts";
import { buildAppMock, codificarCursor, mascararChavePix } from "./index.ts";

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildAppMock();
});
afterAll(() => app.close());

const get = (url: string, token?: string) =>
  app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function todos(token: string, filtro = ""): Promise<Lancamento[]> {
  const itens: Lancamento[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ limite: "4" });
    if (filtro) q.set("tipo", filtro);
    if (cursor) q.set("cursor", cursor);
    const r = await get(`/api/cidadao/pontos/lancamentos?${q}`, token);
    expect(r.statusCode).toBe(200);
    const p = PaginaLancamentos.parse(r.json());
    itens.push(...p.itens);
    cursor = p.proximoCursor;
  } while (cursor);
  return itens;
}

describe("autenticação e acesso", () => {
  it("sem sessão responde 401", async () => {
    expect((await get("/api/cidadao/pontos/resumo")).statusCode).toBe(401);
    expect((await get("/api/cidadao/pontos/lancamentos")).statusCode).toBe(401);
    expect((await get("/api/cidadao/pontos/recibos/BV-R-8K2M4Q")).statusCode).toBe(401);
  });

  it("token desconhecido responde 401", async () => {
    expect((await get("/api/cidadao/pontos/resumo", "inventado")).statusCode).toBe(401);
  });

  it("aceita a sessão por cookie", async () => {
    const r = await app.inject({ method: "GET", url: "/api/cidadao/pontos/resumo", cookies: { eco_sessao: "dev-catador" } });
    expect(r.statusCode).toBe(200);
  });

  it("o dono abre o próprio recibo", async () => {
    const r = await get("/api/cidadao/pontos/recibos/BV-R-8K2M4Q", "dev-cidadao-luz");
    expect(r.statusCode).toBe(200);
    expect(Recibo.parse(r.json()).codigo).toBe("BV-R-8K2M4Q");
  });

  it("um cidadão NÃO abre o recibo de outro: mesma resposta de recibo inexistente", async () => {
    const deOutro = await get("/api/cidadao/pontos/recibos/BV-R-8K2M4Q", "dev-cidadao-doacao");
    const inexistente = await get("/api/cidadao/pontos/recibos/BV-R-ZZZZZZ", "dev-cidadao-doacao");
    expect(deOutro.statusCode).toBe(404);
    expect(deOutro.json()).toEqual({ erro: "recibo_nao_encontrado" });
    expect(inexistente.statusCode).toBe(404);
    expect(deOutro.body).toBe(inexistente.body);
  });

  it("o catador não abre recibo de cidadão e vice-versa", async () => {
    expect((await get("/api/cidadao/pontos/recibos/BV-R-8K2M4Q", "dev-catador")).statusCode).toBe(404);
    expect((await get("/api/cidadao/pontos/recibos/BV-R-K1A2B3", "dev-cidadao-luz")).statusCode).toBe(404);
  });

  it("código malformado dá 404, sem vazar detalhe", async () => {
    const r = await get("/api/cidadao/pontos/recibos/..%2F..%2Fetc", "dev-cidadao-luz");
    expect(r.statusCode).toBe(404);
  });

  it("lançamentos são sempre só do usuário da sessão", async () => {
    const meus = await todos("dev-cidadao-doacao");
    const ids = new Set(meus.map((l) => l.id));
    const deOutro = await todos("dev-cidadao-luz");
    expect(deOutro.some((l) => ids.has(l.id))).toBe(false);
  });

  it("um cursor não troca de usuário: só posiciona na lista da sessão", async () => {
    const cursor = codificarCursor({ em: "2026-12-31T00:00:00-04:00", id: "lan_BV-R-8K2M4Q" });
    const r = await get(`/api/cidadao/pontos/lancamentos?cursor=${cursor}`, "dev-cidadao-doacao");
    const p = PaginaLancamentos.parse(r.json());
    expect(p.itens.every((l) => !l.id.includes("8K2M4Q"))).toBe(true);
  });

  it("parâmetro inválido dá 400", async () => {
    expect((await get("/api/cidadao/pontos/lancamentos?mes=2026-13", "dev-cidadao-luz")).statusCode).toBe(400);
    expect((await get("/api/cidadao/pontos/lancamentos?tipo=xyz", "dev-cidadao-luz")).statusCode).toBe(400);
    expect((await get("/api/cidadao/pontos/lancamentos?cursor=lixo", "dev-cidadao-luz")).statusCode).toBe(400);
  });

  it("não deixa proxies guardarem dados pessoais", async () => {
    const r = await get("/api/cidadao/pontos/resumo", "dev-cidadao-luz");
    expect(r.headers["cache-control"]).toBe("private, no-cache");
  });
});

describe("resumo do cidadão (mocks)", () => {
  it("saldo é a soma do livro-razão e não é negativo", async () => {
    const r = Resumo.parse((await get("/api/cidadao/pontos/resumo", "dev-cidadao-luz")).json());
    if (r.perfil !== "cidadao") throw new Error("perfil errado");
    const lancs = await todos("dev-cidadao-luz");
    const soma = lancs.reduce((a, l) => a + (l.valor.unidade === "pontos" ? (l.direcao === "credito" ? 1 : -1) * l.valor.pontos : 0), 0);
    expect(r.saldo.pontos).toBe(soma);
    expect(r.saldo.pontos).toBe(1556);
    expect(r.saldo.pontos).toBeGreaterThanOrEqual(0);
  });

  it("cota do mês em pontos, renovando no dia 1º", async () => {
    const r = Resumo.parse((await get("/api/cidadao/pontos/resumo", "dev-cidadao-luz")).json());
    if (r.perfil !== "cidadao") throw new Error("perfil errado");
    expect(r.cota).toEqual({
      unidade: "pontos",
      limite: 1000,
      usado: 610,
      restante: 390,
      percentualUsado: 61,
      atingida: false,
      renovaEm: "2026-12-01",
    });
  });

  it("último envio para a conta de luz aparece como devolvido", async () => {
    const r = Resumo.parse((await get("/api/cidadao/pontos/resumo", "dev-cidadao-luz")).json());
    if (r.perfil !== "cidadao" || r.formaDeReceber.tipo !== "credito_luz") throw new Error("forma errada");
    expect(r.formaDeReceber.proximoEnvioEm).toBe("2026-12-01");
    expect(r.formaDeReceber.ultimoEnvio?.situacao).toBe("devolvido");
  });

  it("doação: total doado no mês e cota atingida; saldo zero", async () => {
    const r = Resumo.parse((await get("/api/cidadao/pontos/resumo", "dev-cidadao-doacao")).json());
    if (r.perfil !== "cidadao" || r.formaDeReceber.tipo !== "doacao") throw new Error("forma errada");
    expect(r.formaDeReceber.doadoNoMes.pontos).toBe(1000);
    expect(r.cota.atingida).toBe(true);
    expect(r.cota.restante).toBe(0);
    expect(r.saldo.pontos).toBe(0);
  });

  it("traz no máximo as 3 últimas movimentações, da mais recente para a mais antiga", async () => {
    const r = Resumo.parse((await get("/api/cidadao/pontos/resumo", "dev-cidadao-luz")).json());
    expect(r.ultimasMovimentacoes.map((l) => l.id)).toEqual([
      "lan_BV-R-6W3S7D",
      "lan_c1_luz2",
      "lan_BV-R-4T6Y9P",
    ]);
  });
});

describe("histórico", () => {
  it("o cidadão com 4 meses tem todos os tipos pedidos", async () => {
    const lancs = await todos("dev-cidadao-luz");
    const tipos = new Set(lancs.map((l) => l.tipo));
    for (const t of ["entrega", "bonus_campanha", "resgate", "estorno", "credito_luz_enviado", "credito_luz_devolvido"]) {
      expect(tipos.has(t as Lancamento["tipo"])).toBe(true);
    }
    const meses = new Set(lancs.map((l) => l.ocorridoEm.slice(0, 7)));
    expect(meses.size).toBe(4);
  });

  it("estorno e crédito de luz devolvido são créditos", async () => {
    const lancs = await todos("dev-cidadao-luz");
    expect(lancs.find((l) => l.tipo === "estorno")?.direcao).toBe("credito");
    expect(lancs.find((l) => l.tipo === "credito_luz_devolvido")?.direcao).toBe("credito");
  });

  it("paginação por cursor não repete nem pula itens", async () => {
    const paginado = await todos("dev-cidadao-luz");
    const r = await get("/api/cidadao/pontos/lancamentos?limite=50", "dev-cidadao-luz");
    const tudo = PaginaLancamentos.parse(r.json()).itens;
    expect(paginado.map((l) => l.id)).toEqual(tudo.map((l) => l.id));
    expect(new Set(paginado.map((l) => l.id)).size).toBe(paginado.length);
  });

  it("filtra por grupo e por mês", async () => {
    const premios = await todos("dev-cidadao-luz", "premios");
    expect(premios.map((l) => l.tipo).sort()).toEqual(["estorno", "resgate"]);
    const r = await get("/api/cidadao/pontos/lancamentos?mes=2026-08", "dev-cidadao-luz");
    const ago = PaginaLancamentos.parse(r.json()).itens;
    expect(ago).toHaveLength(3);
  });
});

describe("catador (mocks)", () => {
  it("10 entregas pagas em Pix, 1 com falha", async () => {
    const lancs = await todos("dev-catador");
    expect(lancs).toHaveLength(10);
    expect(lancs.every((l) => l.tipo === "pix_entrega" && l.valor.unidade === "reais")).toBe(true);
    expect(lancs.filter((l) => l.situacaoPix === "falhou")).toHaveLength(1);
  });

  it("recebido no mês, último Pix e chave mascarada; sem cota", async () => {
    const r = Resumo.parse((await get("/api/cidadao/pontos/resumo", "dev-catador")).json());
    if (r.perfil !== "catador") throw new Error("perfil errado");
    expect(r.recebidoNoMes.centavos).toBe(8640);
    expect(r.ultimoPix?.situacao).toBe("falhou");
    expect(r.chavePixMascarada).toBe("***.456.789-**");
    expect("cota" in r).toBe(false);
    expect(JSON.stringify(r)).not.toContain("123.456.789-09");
  });

  it("recibo do catador em reais, sem cota", async () => {
    const r = Recibo.parse((await get("/api/cidadao/pontos/recibos/BV-R-K6L7M8", "dev-catador")).json());
    expect(r.total).toEqual({ unidade: "reais", centavos: 2150 });
    expect(r.cotaRestanteApos).toBeNull();
    expect(r.situacaoPix).toBe("confirmado");
  });
});

describe("recibo do cidadão", () => {
  it("bônus de campanha, total e versão da tabela", async () => {
    const r = Recibo.parse((await get("/api/cidadao/pontos/recibos/BV-R-2V8L5R", "dev-cidadao-luz")).json());
    expect(r.bonus).toEqual({ campanha: "Vidro Vale Mais", valor: { unidade: "pontos", pontos: 50 } });
    expect(r.total).toEqual({ unidade: "pontos", pontos: 165 });
    expect(r.tabela.versao).toBe("v3");
  });

  it("entregas antigas mantêm a versão da tabela usada na época", async () => {
    const r = Recibo.parse((await get("/api/cidadao/pontos/recibos/BV-R-8K2M4Q", "dev-cidadao-luz")).json());
    expect(r.tabela).toEqual({ versao: "v2", vigenteDesde: "2026-03-01" });
  });

  it("marca peso informado manualmente e óleo em litros", async () => {
    const r = Recibo.parse((await get("/api/cidadao/pontos/recibos/BV-R-9F1K3M", "dev-cidadao-luz")).json());
    expect(r.pesoManual).toBe(true);
    expect(r.itens.find((i) => i.material === "oleo")?.quantidade.unidade).toBe("litro");
  });

  it("cota restante depois da entrega", async () => {
    const r = Recibo.parse((await get("/api/cidadao/pontos/recibos/BV-R-6W3S7D", "dev-cidadao-luz")).json());
    expect(r.cotaRestanteApos).toEqual({ unidade: "pontos", pontos: 390 });
  });
});

describe("máscara da chave Pix", () => {
  it("mascara CPF, e-mail, telefone e chave aleatória", () => {
    expect(mascararChavePix("123.456.789-09")).toBe("***.456.789-**");
    expect(mascararChavePix("maria@exemplo.com")).toBe("m***@exemplo.com");
    expect(mascararChavePix("+55 95 99123-4567")).toBe("(95) *****-4567");
    expect(mascararChavePix("1a2b3c4d-0000-4000-8000-9z8y7x6w5v4u")).toBe("1a2b…5v4u");
  });
});
