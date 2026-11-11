import { describe, expect, it } from "vitest";
import { Resumo, type ResumoCatador, type ResumoCidadao } from "@ecoponto/contracts";
import { formatInteiro, formatPontos, formatReais } from "@ecoponto/format";
import {
  apiMock,
  fetchComo,
  fetchPendente,
  fetchSemRede,
  memoria,
  montar,
  linha,
  q,
  qa,
  texto,
  type Pessoa,
} from "./test/ambiente.ts";

async function resumoDaApi(pessoa: Pessoa) {
  const app = await apiMock();
  const r = await app.inject({ url: "/api/cidadao/pontos/resumo", headers: { authorization: `Bearer ${pessoa}` } });
  return Resumo.parse(r.json());
}

const abas = (raiz: ParentNode) => qa(raiz, ".abas a").map(texto);
const sinalNaoSoCor = (li: Element) => ({
  numero: texto(q(li, ".lanc__numero")),
  icone: q(li, ".lanc__valor svg")?.getAttribute("data-icone"),
  leitor: texto(q(li, ".lanc__valor .visually-hidden")),
});

// ---------------------------------------------------------------------------
// Cidadão
// ---------------------------------------------------------------------------

describe("cidadão · aba Saldo", () => {
  it("mostra o saldo igual ao da API, formatado e nunca negativo", async () => {
    const api = (await resumoDaApi("dev-cidadao-luz")) as ResumoCidadao;
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-luz"));
    const saldo = texto(q(raiz, "[data-teste=saldo]"));
    expect(saldo).toBe(formatPontos(api.saldo.pontos));
    expect(saldo).toBe("1.556 pontos");
    expect(saldo).not.toMatch(/[−-]/);
  });

  it("tem as abas Saldo · Cota do mês · Histórico, com a atual marcada", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-luz"));
    expect(abas(raiz)).toEqual(["Saldo", "Cota do mês", "Histórico"]);
    expect(texto(q(raiz, '.abas a[aria-current="page"]'))).toBe("Saldo");
  });

  it("crédito na conta de luz: próximo envio e último envio devolvido", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-luz"));
    expect(texto(raiz)).toContain("Os pontos do mês viram crédito na sua conta de luz. Próximo envio em 1º de dezembro.");
    const envio = q(raiz, "[data-teste=ultimo-envio-luz]");
    expect(texto(envio)).toContain("Devolvido");
    expect(texto(envio)).toContain("461 pontos em 01/11/2026 às 06:00");
    expect(texto(envio)).toContain("Os pontos voltaram para o seu saldo.");
    expect(q(envio!, "svg[data-icone=rotate-ccw]")).not.toBeNull();
  });

  it("link Alterar leva a Meu Perfil", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-luz"));
    const alterar = q(raiz, 'a[aria-label="Alterar forma de receber"]');
    expect(alterar?.getAttribute("href")).toBe("/meu-perfil");
  });

  it("mostra pontos que vencem em breve quando a API manda", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-luz"));
    expect(texto(q(raiz, "[data-teste=pontos-a-vencer]"))).toBe("69 pontos vencem em 5 de dezembro.");
  });

  it("mostra as 3 últimas movimentações e o link Ver histórico", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-luz"));
    const itens = qa(raiz, ".lancs > li");
    expect(itens).toHaveLength(3);
    expect(sinalNaoSoCor(itens[0]!).numero).toBe("+295 pontos");
    expect(qa(raiz, "a").some((a) => texto(a) === "Ver histórico")).toBe(true);
  });

  it("doação: beneficiário e total doado no mês", async () => {
    const api = (await resumoDaApi("dev-cidadao-doacao")) as ResumoCidadao;
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-doacao"));
    expect(texto(raiz)).toContain("Seus pontos vão para Escola Municipal Sol Nascente.");
    if (api.formaDeReceber.tipo !== "doacao") throw new Error("forma");
    expect(texto(q(raiz, ".linha-valor strong"))).toBe(formatPontos(api.formaDeReceber.doadoNoMes.pontos));
    expect(texto(q(raiz, ".linha-valor span"))).toBe("Doado este mês");
    expect(texto(q(raiz, "[data-teste=saldo]"))).toBe("0 pontos");
    expect(q(raiz, "[data-teste=pontos-a-vencer]")).toBeNull();
  });

  it("forma pontos e sem movimentações: link para Prêmios e estado vazio", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-cidadao-novo"));
    expect(texto(raiz)).toContain("Seus pontos ficam aqui para trocar por prêmios.");
    expect(qa(raiz, "a").find((a) => texto(a) === "Ver prêmios")?.getAttribute("href")).toBe("/premios");
    const vazio = q(raiz, "[data-estado=vazio]");
    expect(texto(vazio)).toContain("Você ainda não tem entregas. Veja os ecopontos mais perto de você.");
    expect(q(vazio!, "a")?.getAttribute("href")).toBe("/ecopontos");
  });
});

describe("cidadão · aba Cota do mês", () => {
  it("mostra usado, restante e renovação iguais aos da API", async () => {
    const api = (await resumoDaApi("dev-cidadao-luz")) as ResumoCidadao;
    const { raiz } = await montar("/pontos/cota", await fetchComo("dev-cidadao-luz"));
    expect(texto(q(raiz, "[data-teste=cota-texto]"))).toBe(
      `Você usou ${formatInteiro(api.cota.usado)} de ${formatPontos(api.cota.limite)} este mês`,
    );
    expect(texto(q(raiz, "[data-teste=cota-texto]"))).toBe("Você usou 610 de 1.000 pontos este mês");
    expect(texto(q(raiz, "[data-teste=cota-restante]"))).toBe(`Restante: ${formatPontos(api.cota.restante)}`);
    expect(texto(q(raiz, "[data-teste=cota-renova]"))).toBe("Sua cota renova em 1º de dezembro.");
    const barra = q(raiz, "[role=progressbar]");
    expect(barra?.getAttribute("aria-valuenow")).toBe(String(api.cota.usado));
    expect(barra?.getAttribute("aria-valuemax")).toBe(String(api.cota.limite));
    expect(q(raiz, "[data-teste=cota-atingida]")).toBeNull();
    expect(qa(raiz, "a").find((a) => texto(a).includes("regulamento"))?.getAttribute("href")).toBe("/ajuda/regulamento.pdf");
  });

  it("cota atingida: aviso com ícone e texto", async () => {
    const { raiz } = await montar("/pontos/cota", await fetchComo("dev-cidadao-doacao"));
    const aviso = q(raiz, "[data-teste=cota-atingida]");
    expect(texto(aviso)).toBe("Você atingiu a cota deste mês. Novas entregas voltam a contar a partir de 1º de dezembro.");
    const caixa = aviso!.closest(".caixa--aviso");
    expect(caixa).not.toBeNull();
    expect(q(caixa!, "svg[data-icone=triangle-alert]")).not.toBeNull();
  });
});

describe("cidadão · aba Histórico", () => {
  it("agrupa por mês, do mais recente para o mais antigo, carregando ao rolar", async () => {
    const m = await montar("/pontos/historico", await fetchComo("dev-cidadao-luz"));
    expect(qa(m.raiz, ".lancs > li").length).toBe(10); // primeira página
    expect(qa(m.raiz, ".historico__mais button").map(texto)).toEqual(["Carregar mais"]);
    m.rolarAteOFim();
    await m.app.ocioso();
    expect(qa(m.raiz, "[data-mes]").map((s) => s.getAttribute("data-mes"))).toEqual(["2026-11", "2026-10", "2026-09", "2026-08"]);
    expect(qa(m.raiz, ".mes__titulo").map(texto)).toEqual(["Novembro de 2026", "Outubro de 2026", "Setembro de 2026", "Agosto de 2026"]);
    expect(qa(m.raiz, ".lancs > li")).toHaveLength(14);
    expect(qa(m.raiz, ".historico__mais button")).toHaveLength(0); // acabou
  });

  it("estorno e crédito de luz devolvido aparecem como créditos (sinal, ícone e texto)", async () => {
    const m = await montar("/pontos/historico", await fetchComo("dev-cidadao-luz"));
    m.rolarAteOFim();
    await m.app.ocioso();
    const item = (desc: string) => qa(m.raiz, ".lancs > li").find((li) => texto(li).includes(desc))!;
    expect(sinalNaoSoCor(item("Vale do kit de utensílios cancelado"))).toEqual({ numero: "+200 pontos", icone: "arrow-down-left", leitor: "Crédito:" });
    expect(sinalNaoSoCor(item("Crédito de luz devolvido"))).toEqual({ numero: "+461 pontos", icone: "arrow-down-left", leitor: "Crédito:" });
    expect(sinalNaoSoCor(item("Troca por kit de utensílios"))).toEqual({ numero: "−200 pontos", icone: "arrow-up-right", leitor: "Débito:" });
    expect(sinalNaoSoCor(item("enviados para a conta de luz"))).toEqual({ numero: "−461 pontos", icone: "arrow-up-right", leitor: "Débito:" });
  });

  it("filtra por Prêmios", async () => {
    const m = await montar("/pontos/historico", await fetchComo("dev-cidadao-luz"));
    const premios = qa(m.raiz, ".filtro").find((b) => texto(b) === "Prêmios") as HTMLButtonElement;
    premios.click();
    await m.app.ocioso();
    expect(location.search).toBe("?tipo=premios");
    expect(qa(m.raiz, ".filtro[aria-pressed=true]").map(texto)).toEqual(["Prêmios"]);
    expect(qa(m.raiz, ".lanc__desc").map(texto)).toEqual(["Vale do kit de utensílios cancelado", "Troca por kit de utensílios"]);
  });

  it("entregas abrem o recibo", async () => {
    const m = await montar("/pontos/historico?tipo=entregas", await fetchComo("dev-cidadao-luz"));
    const link = q(m.raiz, ".lanc--link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/pontos/recibo/BV-R-6W3S7D");
    link.click();
    await m.app.ocioso();
    expect(location.pathname).toBe("/pontos/recibo/BV-R-6W3S7D");
    expect(texto(q(m.raiz, "[data-teste=recibo-codigo]"))).toBe("BV-R-6W3S7D");
  });

  it("sem movimentações mostra o estado vazio com link para Ecopontos", async () => {
    const { raiz } = await montar("/pontos/historico", await fetchComo("dev-cidadao-novo"));
    expect(texto(q(raiz, "[data-estado=vazio]"))).toContain("Você ainda não tem entregas.");
  });
});

describe("cidadão · recibo", () => {
  it("abre direto pelo endereço /pontos/recibo/{codigo} (como a notificação)", async () => {
    const { raiz } = await montar("/pontos/recibo/BV-R-9F1K3M", await fetchComo("dev-cidadao-luz"));
    expect(texto(q(raiz, "[data-teste=recibo-codigo]"))).toBe("BV-R-9F1K3M");
    expect(texto(raiz)).toContain("29/10/2026 às 11:47");
    expect(texto(raiz)).toContain("Ecoponto Cidade Satélite");
    const linhas = qa(raiz, ".itens tbody tr").map(linha);
    expect(linhas).toEqual(["Plástico 2,5 kg 55 pontos", "Óleo de cozinha 2 litros 50 pontos"]);
    expect(texto(q(raiz, "[data-teste=recibo-total]"))).toBe("105 pontos");
    expect(texto(q(raiz, "[data-teste=peso-manual]"))).toBe("Peso informado manualmente");
    expect(texto(q(raiz, "[data-teste=tabela-versao]"))).toBe("Versão v3, em vigor desde 01/10/2026");
    expect(texto(q(raiz, "[data-teste=cota-apos]"))).toBe("589 pontos");
    expect(q(raiz, "[data-teste=fale-conosco]")?.getAttribute("href")).toBe("/fale-conosco?recibo=BV-R-9F1K3M");
    expect(texto(q(raiz, "[data-teste=fale-conosco]"))).toBe("Algo errado? Fale com a gente");
  });

  it("mostra bônus de campanha e a versão antiga da tabela", async () => {
    const bonus = await montar("/pontos/recibo/BV-R-2V8L5R", await fetchComo("dev-cidadao-luz"));
    expect(linha(q(bonus.raiz, "[data-teste=bonus]")!)).toBe("Bônus da campanha Vidro Vale Mais 50 pontos");
    expect(texto(q(bonus.raiz, "[data-teste=recibo-total]"))).toBe("165 pontos");
    const antigo = await montar("/pontos/recibo/BV-R-8K2M4Q", await fetchComo("dev-cidadao-luz"));
    expect(texto(q(antigo.raiz, "[data-teste=tabela-versao]"))).toBe("Versão v2, em vigor desde 01/03/2026");
    expect(q(antigo.raiz, "[data-teste=peso-manual]")).toBeNull();
  });

  it("cota restante depois da entrega", async () => {
    const { raiz } = await montar("/pontos/recibo/BV-R-6W3S7D", await fetchComo("dev-cidadao-luz"));
    expect(texto(q(raiz, "[data-teste=cota-apos]"))).toBe("390 pontos");
  });

  it("recibo de outra pessoa: 'Não encontramos este recibo.'", async () => {
    const { raiz } = await montar("/pontos/recibo/BV-R-8K2M4Q", await fetchComo("dev-cidadao-doacao"));
    expect(texto(q(raiz, "[data-teste=recibo-nao-encontrado]"))).toBe("Não encontramos este recibo.");
    expect(q(raiz, "[data-teste=recibo-codigo]")).toBeNull();
  });

  it("recibo inexistente: 'Não encontramos este recibo.'", async () => {
    const { raiz } = await montar("/pontos/recibo/NAO-EXISTE", await fetchComo("dev-cidadao-luz"));
    expect(texto(q(raiz, "[data-teste=recibo-nao-encontrado]"))).toBe("Não encontramos este recibo.");
  });
});

// ---------------------------------------------------------------------------
// Catador
// ---------------------------------------------------------------------------

describe("catador", () => {
  it("abas Saldo · Histórico, sem Cota do mês", async () => {
    const { raiz } = await montar("/pontos/", await fetchComo("dev-catador"));
    expect(abas(raiz)).toEqual(["Saldo", "Histórico"]);
  });

  it("/pontos/cota não mostra cota: volta para o saldo", async () => {
    const { raiz } = await montar("/pontos/cota", await fetchComo("dev-catador"));
    expect(location.pathname).toBe("/pontos/");
    expect(q(raiz, "[role=progressbar]")).toBeNull();
    expect(texto(raiz)).not.toContain("Cota do mês");
  });

  it("perfil vem do servidor, não da URL", async () => {
    const { raiz } = await montar("/pontos/?perfil=cidadao", await fetchComo("dev-catador"));
    expect(abas(raiz)).toEqual(["Saldo", "Histórico"]);
    expect(q(raiz, "[data-teste=recebido-mes]")).not.toBeNull();
  });

  it("aba Saldo: recebido no mês em reais, último Pix com falha, chave mascarada", async () => {
    const api = (await resumoDaApi("dev-catador")) as ResumoCatador;
    const { raiz } = await montar("/pontos/", await fetchComo("dev-catador"));
    expect(texto(q(raiz, "[data-teste=recebido-mes]"))).toBe(`Recebido este mês: ${formatReais(api.recebidoNoMes.centavos).replace(/\s/g, " ")}`);
    expect(texto(q(raiz, "[data-teste=recebido-mes]"))).toBe("Recebido este mês: R$ 86,40");
    const pix = q(raiz, "[data-teste=ultimo-pix]");
    expect(texto(pix)).toContain("Pix falhou");
    expect(texto(pix)).toContain("R$ 12,50 em 10/11/2026 às 08:05");
    expect(texto(pix)).toContain("Uma nova tentativa será feita automaticamente.");
    expect(texto(q(raiz, "[data-teste=chave-pix]"))).toBe("***.456.789-**");
    expect(q(raiz, 'a[aria-label="Alterar chave Pix"]')?.getAttribute("href")).toBe("/meu-perfil");
    expect(qa(raiz, ".lancs > li")).toHaveLength(3);
    expect(q(raiz, "[data-teste=saldo]")).toBeNull();
  });

  it("aba Histórico: valores em reais e situação de cada Pix", async () => {
    const m = await montar("/pontos/historico", await fetchComo("dev-catador"));
    const itens = qa(m.raiz, ".lancs > li");
    expect(itens).toHaveLength(10);
    expect(itens.every((li) => /^R\$ \d+,\d{2}$/.test(sinalNaoSoCor(li).numero))).toBe(true);
    expect(itens.every((li) => q(li, ".selo") !== null)).toBe(true);
    expect(itens.filter((li) => texto(q(li, ".selo")) === "Pix falhou")).toHaveLength(1);
    expect(itens.filter((li) => texto(q(li, ".selo")) === "Pix confirmado")).toHaveLength(9);
    expect(sinalNaoSoCor(itens[0]!)).toEqual({ numero: "R$ 12,50", icone: "arrow-down-left", leitor: "Recebido:" });
    expect(qa(m.raiz, ".mes__titulo").map(texto)).toEqual(["Novembro de 2026", "Outubro de 2026"]);
  });

  it("recibo em reais, sem cota, com a situação do Pix", async () => {
    const { raiz } = await montar("/pontos/recibo/BV-R-K8U9V0", await fetchComo("dev-catador"));
    expect(qa(raiz, ".itens tbody tr").map(linha)).toEqual(["Plástico 5 kg R$ 6,50", "Papel 10 kg R$ 6,00"]);
    expect(texto(q(raiz, "[data-teste=recibo-total]"))).toBe("R$ 12,50");
    expect(q(raiz, "[data-teste=cota-apos]")).toBeNull();
    expect(texto(q(raiz, "[data-teste=recibo-pix]"))).toBe("Pix falhou");
    expect(texto(raiz)).toContain("Uma nova tentativa será feita automaticamente.");
  });
});

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

describe("estados", () => {
  it("carregando: skeleton, não spinner", async () => {
    const { raiz } = await montar("/pontos/", fetchPendente, { esperar: false });
    expect(q(raiz, "[data-estado=carregando]")).not.toBeNull();
    expect(q(raiz, "main")?.getAttribute("aria-busy")).toBe("true");
    expect(texto(q(raiz, "[role=status]"))).toBe("Carregando seus pontos…");
  });

  it("erro de conexão sem dados guardados: mensagem + Tentar novamente", async () => {
    const storage = memoria();
    const m = await montar("/pontos/", fetchSemRede, { storage });
    const e = q(m.raiz, "[data-estado=erro]");
    expect(texto(e)).toContain("Não foi possível carregar seus pontos.");
    const botao = qa(e!, "button").find((b) => texto(b) === "Tentar novamente");
    expect(botao).toBeDefined();
  });

  it("offline: mostra os últimos dados com dia e hora", async () => {
    const storage = memoria();
    await montar("/pontos/", await fetchComo("dev-cidadao-luz"), { storage });
    // Mais tarde, sem internet:
    const { raiz } = await montar("/pontos/", fetchSemRede, { storage, online: false });
    expect(texto(q(raiz, "[data-teste=saldo]"))).toBe("1.556 pontos");
    expect(texto(q(raiz, "[data-estado=offline]"))).toContain("Sem internet. Valores de 11/11 às 10:00.");
    expect(qa(raiz, "[data-estado=offline] button").map(texto)).toEqual(["Tentar novamente"]);
  });

  it("offline também no histórico e no recibo já abertos", async () => {
    const storage = memoria();
    await montar("/pontos/historico", await fetchComo("dev-cidadao-luz"), { storage });
    await montar("/pontos/recibo/BV-R-9F1K3M", await fetchComo("dev-cidadao-luz"), { storage });
    const hist = await montar("/pontos/historico", fetchSemRede, { storage, online: false });
    expect(qa(hist.raiz, ".lancs > li").length).toBeGreaterThan(0);
    expect(q(hist.raiz, "[data-estado=offline]")).not.toBeNull();
    const rec = await montar("/pontos/recibo/BV-R-9F1K3M", fetchSemRede, { storage, online: false });
    expect(texto(q(rec.raiz, "[data-teste=recibo-codigo]"))).toBe("BV-R-9F1K3M");
    expect(q(rec.raiz, "[data-estado=offline]")).not.toBeNull();
  });

  it("outro usuário no mesmo aparelho não vê o cache do anterior", async () => {
    const storage = memoria();
    await montar("/pontos/", await fetchComo("dev-cidadao-luz"), { storage });
    await montar("/pontos/", await fetchComo("dev-catador"), { storage });
    const { raiz } = await montar("/pontos/", fetchSemRede, { storage, online: false });
    expect(q(raiz, "[data-teste=saldo]")).toBeNull();
    expect(q(raiz, "[data-teste=recebido-mes]")).not.toBeNull();
  });

  it("um saldo negativo vindo do servidor nunca é exibido", async () => {
    const real = await fetchComo("dev-cidadao-luz");
    const adulterado = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = await real(input, init);
      const corpo = (await r.json()) as { saldo?: { pontos: number } };
      if (corpo.saldo) corpo.saldo.pontos = -50;
      return new Response(JSON.stringify(corpo), { status: r.status });
    }) as typeof fetch;
    const m = await montar("/pontos/", adulterado);
    expect(texto(m.raiz)).not.toMatch(/[−-]\s?50/);
    expect(q(m.raiz, "[data-teste=saldo]")).toBeNull();
    expect(q(m.raiz, "[data-estado=erro]")).not.toBeNull();
    // Reporta sem o valor.
    expect(m.reportados).toHaveLength(1);
    expect(JSON.stringify(m.reportados[0]!.contexto)).not.toContain("50");
  });

  it("sessão expirada: pede para abrir de novo pelo app", async () => {
    const semToken = (async () =>
      new Response(JSON.stringify({ erro: "nao_autenticado" }), { status: 401 })) as unknown as typeof fetch;
    const { raiz } = await montar("/pontos/", semToken);
    expect(texto(q(raiz, "[data-estado=erro]"))).toContain("Sua sessão terminou.");
  });
});
