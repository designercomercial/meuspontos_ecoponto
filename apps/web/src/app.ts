/**
 * Meus Pontos – controlador da página.
 *
 * Fluxo de cada tela:
 *  1. Mostra na hora o que está guardado no aparelho (ou o skeleton).
 *  2. Busca na API; se chegou, guarda e redesenha.
 *  3. Se a rede falhou e havia dados guardados, mantém e mostra
 *     "Sem internet. Valores de [dia e hora]". Se não havia, mostra o erro.
 *
 * O perfil (cidadão/catador) vem só da resposta do servidor.
 */
import {
  PaginaLancamentos,
  Recibo,
  Resumo,
  type FiltroHistorico,
  type Lancamento,
} from "@ecoponto/contracts";
import { chaveMes, formatMesAno } from "@ecoponto/format";
import { criarApi, type Falha, type Reportar } from "./api.ts";
import { criarCache, type Entrada } from "./cache.ts";
import type { Links } from "./config.ts";
import { h, substituir } from "./dom.ts";
import { lerRota, urlDaRota, type Rota } from "./router.ts";
import { linkInterno, listaLancamentos } from "./views/comuns.ts";
import { viewCota } from "./views/cota.ts";
import { avisoOffline, botaoTentar, erro, skeleton, vazio } from "./views/estados.ts";
import { viewRecibo, viewReciboNaoEncontrado, voltarAoHistorico } from "./views/recibo.ts";
import { viewSaldoCatador, viewSaldoCidadao } from "./views/saldo.ts";

export type Deps = {
  raiz: HTMLElement;
  fetch: typeof fetch;
  storage: Storage | null;
  online: () => boolean;
  agora: () => Date;
  links: Links;
  reportar: Reportar;
  /** Busca do resumo já iniciada pelo index.html (opcional). */
  resumoAntecipado?: Promise<Response> | null;
  /** Chama `cb` quando `alvo` chega perto da tela (rolagem infinita). */
  observarFim?: (alvo: Element, cb: () => void) => () => void;
};

type EstadoHistorico = {
  itens: Lancamento[];
  cursor: string | null;
  fim: boolean;
  carregando: boolean;
  falhaMais: boolean;
  /** Mostrando dados guardados porque a rede falhou. */
  salvoEm: string | null;
  carregadoDaRede: boolean;
};

const FILTROS: ReadonlyArray<[FiltroHistorico, string]> = [
  ["todos", "Todos"],
  ["entregas", "Entregas"],
  ["premios", "Prêmios"],
  ["outros", "Outros"],
];

function observadorPadrao(alvo: Element, cb: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && cb(), { rootMargin: "400px 0px" });
  io.observe(alvo);
  return () => io.disconnect();
}

export function criarApp(d: Deps) {
  const api = criarApi(d.fetch, d.reportar, d.resumoAntecipado ?? null);
  const cache = criarCache(d.storage, d.agora);
  const observarFim = d.observarFim ?? observadorPadrao;

  let resumo: Entrada<Resumo> | null = null;
  let resumoDaRede = false;
  let geracao = 0;
  let limpezas: Array<() => void> = [];
  const historicos = new Map<FiltroHistorico, EstadoHistorico>();
  const pendentes = new Set<Promise<unknown>>();

  const nav = h("nav", { class: "abas", "aria-label": "Seções de Meus Pontos" });
  const faixa = h("div", { class: "faixa-slot" });
  const main = h("main", { id: "conteudo", class: "page", tabindex: "-1" });
  d.raiz.replaceChildren(nav, faixa, main);

  function rastrear<T>(p: Promise<T>): Promise<T> {
    pendentes.add(p);
    void p.finally(() => pendentes.delete(p));
    return p;
  }

  // ---------------------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------------------

  d.raiz.addEventListener("click", (e) => {
    const alvo = e.target instanceof Element ? e.target.closest("a[data-rota]") : null;
    if (!alvo || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navegar(alvo.getAttribute("href") ?? "/pontos/");
  });

  window.addEventListener("popstate", () => void rastrear(desenhar(true)));
  window.addEventListener("online", () => {
    if (faixa.childElementCount > 0) tentarDeNovo();
  });

  function navegar(url: string, opts: { substituir?: boolean } = {}): Promise<void> {
    if (opts.substituir) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    return rastrear(desenhar(true));
  }

  function tentarDeNovo(): void {
    resumoDaRede = false;
    const r = lerRota(location.pathname, location.search);
    if (r.nome === "historico") historicos.delete(r.filtro);
    void rastrear(desenhar(false));
  }

  function mostrarFaixa(salvoEm: string | null): void {
    substituir(faixa, salvoEm ? avisoOffline(salvoEm, tentarDeNovo) : null);
  }

  function limpar(): void {
    for (const f of limpezas) f();
    limpezas = [];
  }

  function focarConteudo(focar: boolean): void {
    if (focar) main.focus({ preventScroll: true });
    if (focar) window.scrollTo?.(0, 0);
  }

  function titulo(t: string): void {
    document.title = `${t} – Meus Pontos`;
  }

  async function desenhar(focar: boolean): Promise<void> {
    const g = ++geracao;
    limpar();
    const rota = lerRota(location.pathname, location.search);
    if (rota.nome === "recibo") return desenharRecibo(rota.codigo, g, focar);
    return desenharAba(rota, g, focar);
  }

  // ---------------------------------------------------------------------------
  // Abas (Saldo, Cota do mês, Histórico)
  // ---------------------------------------------------------------------------

  function desenharAbas(perfil: Resumo["perfil"] | null, ativa: Rota["nome"]): void {
    if (!perfil) {
      substituir(nav, h("div", { class: "abas__lista abas__lista--sk", "aria-hidden": "true" }, h("span", { class: "sk sk--aba" }), h("span", { class: "sk sk--aba" }), h("span", { class: "sk sk--aba" })));
      return;
    }
    const abas: Array<[Rota, string]> = [[{ nome: "saldo" }, "Saldo"]];
    if (perfil === "cidadao") abas.push([{ nome: "cota" }, "Cota do mês"]);
    abas.push([{ nome: "historico", filtro: "todos" }, "Histórico"]);
    substituir(
      nav,
      h(
        "ul",
        { class: "abas__lista" },
        abas.map(([r, texto]) =>
          h("li", null, linkInterno(r, { class: "aba", ...(r.nome === ativa ? { "aria-current": "page" } : {}) }, texto)),
        ),
      ),
    );
  }

  function conteudoAba(rota: Rota, r: Resumo, g: number): Array<HTMLElement> {
    if (rota.nome === "cota" && r.perfil === "cidadao") {
      titulo("Cota do mês");
      return [h("h2", { class: "visually-hidden" }, "Cota do mês"), ...viewCota(r, d.links)];
    }
    if (rota.nome === "historico") {
      titulo("Histórico");
      return [desenharHistorico(rota.filtro, g)];
    }
    titulo("Saldo");
    return [
      h("h2", { class: "visually-hidden" }, "Saldo"),
      ...(r.perfil === "cidadao" ? viewSaldoCidadao(r, d.links) : viewSaldoCatador(r, d.links)),
    ];
  }

  function mostrarAba(rota: Rota, r: Resumo, g: number): void {
    // Catador não tem aba de cota: /pontos/cota vira o saldo.
    if (rota.nome === "cota" && r.perfil !== "cidadao") {
      history.replaceState(null, "", urlDaRota({ nome: "saldo" }));
      rota = { nome: "saldo" };
    }
    desenharAbas(r.perfil, rota.nome);
    main.removeAttribute("aria-busy");
    substituir(main, conteudoAba(rota, r, g));
  }

  async function desenharAba(rota: Exclude<Rota, { nome: "recibo" }>, g: number, focar: boolean): Promise<void> {
    const guardado = resumo ?? cache.ler("resumo", Resumo);
    if (guardado) {
      mostrarAba(rota, guardado.dados, g);
    } else {
      desenharAbas(null, rota.nome);
      main.setAttribute("aria-busy", "true");
      substituir(main, skeleton(rota.nome === "historico" ? "lista" : rota.nome === "cota" ? "cota" : "saldo"));
      mostrarFaixa(null);
    }
    focarConteudo(focar);
    if (resumoDaRede && resumo) return;

    const res = await api.resumo();
    if (res.ok) {
      const antes = guardado ? JSON.stringify({ ...guardado.dados, atualizadoEm: "" }) : "";
      cache.definirUsuario(res.dados.usuarioRef);
      cache.salvar("resumo", res.dados);
      resumo = { dados: res.dados, salvoEm: d.agora().toISOString() };
      resumoDaRede = true;
      if (g !== geracao) return;
      mostrarFaixa(null);
      // Só redesenha se algo mudou (evita piscar e perder a posição).
      // No histórico, a lista tem carga própria: só as abas dependem do resumo.
      if (rota.nome === "historico" && guardado) desenharAbas(res.dados.perfil, rota.nome);
      else if (antes !== JSON.stringify({ ...res.dados, atualizadoEm: "" })) mostrarAba(rota, res.dados, g);
      return;
    }
    if (g !== geracao) return;
    falhaAoAtualizar(res.falha, guardado);
  }

  /** Rede falhou: mantém os dados guardados com aviso, ou mostra o erro. */
  function falhaAoAtualizar(falha: Falha, guardado: Entrada<unknown> | null): void {
    if (guardado && falha.tipo !== "nao_autenticado") {
      mostrarFaixa(guardado.salvoEm);
      return;
    }
    substituir(nav);
    main.removeAttribute("aria-busy");
    mostrarFaixa(null);
    substituir(main, erro(falha, d.online(), tentarDeNovo));
  }

  // ---------------------------------------------------------------------------
  // Histórico
  // ---------------------------------------------------------------------------

  function desenharHistorico(filtro: FiltroHistorico, g: number): HTMLElement {
    const lista = h("div", { class: "historico__lista" });
    const status = h("p", { class: "visually-hidden", role: "status", "aria-live": "polite" });
    const mais = h("div", { class: "historico__mais" });
    const sentinela = h("div", { class: "historico__sentinela", "aria-hidden": "true" });

    const filtros = h(
      "div",
      { class: "filtros", role: "group", "aria-label": "Filtrar por tipo" },
      FILTROS.map(([f, texto]) =>
        h(
          "button",
          {
            type: "button",
            class: "filtro",
            "aria-pressed": f === filtro ? "true" : "false",
            "on:click": () => {
              if (f !== filtro) void navegar(urlDaRota({ nome: "historico", filtro: f }), { substituir: true });
            },
          },
          texto,
        ),
      ),
    );

    const secao = h(
      "section",
      { class: "historico", "aria-labelledby": "titulo-historico" },
      h("h2", { id: "titulo-historico", class: "visually-hidden" }, "Histórico"),
      filtros,
      lista,
      mais,
      sentinela,
      status,
    );

    let estado = historicos.get(filtro);
    if (!estado) {
      const guardado = cache.ler(`lanc:${filtro}`, PaginaLancamentos);
      estado = {
        itens: guardado?.dados.itens ?? [],
        cursor: guardado?.dados.proximoCursor ?? null,
        fim: guardado ? guardado.dados.proximoCursor === null : false,
        carregando: false,
        falhaMais: false,
        salvoEm: null,
        carregadoDaRede: false,
      };
      historicos.set(filtro, estado);
      if (!guardado) substituir(lista, skeleton("lista"));
    }
    const e = estado;

    const atualizar = () => {
      if (g !== geracao) return;
      if (e.itens.length === 0 && !e.carregadoDaRede && e.salvoEm === null) return; // ainda no skeleton
      if (e.itens.length === 0) {
        substituir(lista, filtro === "todos" ? vazio(d.links) : h("p", { class: "estado", "data-estado": "vazio" }, "Nenhuma movimentação deste tipo."));
      } else {
        substituir(lista, agruparPorMes(e.itens));
      }
      if (e.carregando) substituir(mais, skeleton("lista"));
      else if (!e.fim && e.carregadoDaRede)
        substituir(
          mais,
          e.falhaMais
            ? h("div", { class: "historico__falha" }, h("p", null, "Não foi possível carregar mais."), botaoTentar(() => void carregarMais()))
            : h("button", { type: "button", class: "botao botao--secundario", "on:click": () => void carregarMais() }, "Carregar mais"),
        );
      else substituir(mais);
      mostrarFaixa(e.salvoEm);
    };

    const carregarMais = async (): Promise<void> => {
      if (e.carregando || e.fim || !e.carregadoDaRede) return;
      e.carregando = true;
      e.falhaMais = false;
      atualizar();
      const res = await rastrear(api.lancamentos(filtro, e.cursor));
      e.carregando = false;
      if (res.ok) {
        e.itens = [...e.itens, ...res.dados.itens];
        e.cursor = res.dados.proximoCursor;
        e.fim = res.dados.proximoCursor === null;
        status.textContent = `${res.dados.itens.length} movimentações carregadas.`;
      } else {
        e.falhaMais = true;
      }
      atualizar();
    };

    const carregarPrimeira = async (): Promise<void> => {
      e.carregando = false;
      const res = await api.lancamentos(filtro, null);
      if (res.ok) {
        cache.salvar(`lanc:${filtro}`, res.dados);
        e.itens = res.dados.itens;
        e.cursor = res.dados.proximoCursor;
        e.fim = res.dados.proximoCursor === null;
        e.carregadoDaRede = true;
        e.salvoEm = null;
        atualizar();
        return;
      }
      if (g !== geracao) return;
      const guardado = cache.ler(`lanc:${filtro}`, PaginaLancamentos);
      if (guardado && res.falha.tipo !== "nao_autenticado") {
        e.salvoEm = guardado.salvoEm;
        atualizar();
      } else {
        historicos.delete(filtro);
        substituir(lista, erro(res.falha, d.online(), tentarDeNovo));
      }
    };

    queueMicrotask(() => {
      atualizar();
      if (g !== geracao) return;
      limpezas.push(observarFim(sentinela, () => void carregarMais()));
      if (!e.carregadoDaRede) void rastrear(carregarPrimeira());
    });

    return secao;
  }

  function agruparPorMes(itens: readonly Lancamento[]): HTMLElement[] {
    const grupos = new Map<string, Lancamento[]>();
    for (const l of itens) {
      const k = chaveMes(l.ocorridoEm);
      const g = grupos.get(k);
      if (g) g.push(l);
      else grupos.set(k, [l]);
    }
    return [...grupos].map(([mes, ls]) =>
      h(
        "section",
        { class: "mes", "aria-labelledby": `mes-${mes}`, "data-mes": mes },
        h("h3", { class: "mes__titulo", id: `mes-${mes}` }, formatMesAno(mes)),
        listaLancamentos(ls),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Recibo (/pontos/recibo/{codigo})
  // ---------------------------------------------------------------------------

  async function desenharRecibo(codigo: string, g: number, focar: boolean): Promise<void> {
    titulo(`Recibo ${codigo}`);
    substituir(nav);
    const chave = `recibo:${codigo}`;
    const guardado = cache.ler(chave, Recibo);
    if (guardado) {
      main.removeAttribute("aria-busy");
      substituir(main, viewRecibo(guardado.dados, d.links));
    } else {
      main.setAttribute("aria-busy", "true");
      substituir(main, voltarAoHistorico(), skeleton("recibo"));
    }
    mostrarFaixa(null);
    focarConteudo(focar);

    const res = await api.recibo(codigo);
    if (g !== geracao) return;
    main.removeAttribute("aria-busy");
    if (res.ok) {
      cache.salvar(chave, res.dados);
      if (!guardado || JSON.stringify(guardado.dados) !== JSON.stringify(res.dados)) {
        substituir(main, viewRecibo(res.dados, d.links));
      }
      return;
    }
    if (res.falha.tipo === "nao_encontrado") {
      cache.remover(chave);
      substituir(main, viewReciboNaoEncontrado());
      return;
    }
    if (guardado && res.falha.tipo !== "nao_autenticado") {
      mostrarFaixa(guardado.salvoEm);
      return;
    }
    substituir(main, voltarAoHistorico(), erro(res.falha, d.online(), tentarDeNovo));
  }

  return {
    iniciar: () => rastrear(desenhar(false)),
    navegar,
    /** Espera todas as cargas em andamento (usado nos testes). */
    async ocioso(): Promise<void> {
      while (pendentes.size > 0) {
        await Promise.allSettled([...pendentes]);
        await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
}

export type App = ReturnType<typeof criarApp>;
