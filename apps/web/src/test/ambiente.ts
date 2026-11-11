/**
 * Monta a página num DOM de teste ligada à API real com os mocks
 * (Fastify `inject`, sem rede). Assim os números da tela são conferidos
 * contra o que a API devolve, não contra valores copiados.
 */
import { buildAppMock } from "@ecoponto/api";
import type { FastifyInstance } from "@ecoponto/api";
import { criarApp, type App } from "../app.ts";
import type { Links } from "../config.ts";

export const LINKS_TESTE: Links = {
  premios: "/premios",
  meuPerfil: "/meu-perfil",
  ecopontos: "/ecopontos",
  faleConosco: "/fale-conosco",
  regulamento: "/ajuda/regulamento.pdf",
};

export const AGORA = new Date("2026-11-11T10:00:00-04:00");

let api: FastifyInstance | null = null;
export async function apiMock(): Promise<FastifyInstance> {
  api ??= await buildAppMock();
  return api;
}

export type Pessoa = "dev-cidadao-luz" | "dev-cidadao-doacao" | "dev-cidadao-novo" | "dev-catador";

/** fetch que chama a API mock com o token da pessoa. */
export async function fetchComo(pessoa: Pessoa): Promise<typeof fetch> {
  const app = await apiMock();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;
    const r = await app.inject({ method: (init?.method as "GET") ?? "GET", url, headers: { authorization: `Bearer ${pessoa}` } });
    return new Response(r.body, { status: r.statusCode, headers: { "content-type": String(r.headers["content-type"] ?? "application/json") } });
  }) as typeof fetch;
}

/** fetch de quem está sem internet. */
export const fetchSemRede = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

/** fetch que nunca responde (para ver o skeleton). */
export const fetchPendente = (() => new Promise(() => {})) as unknown as typeof fetch;

export type Montagem = {
  app: App;
  raiz: HTMLElement;
  reportados: Array<{ erro: unknown; contexto: Record<string, string> }>;
  /** Dispara a "rolagem até o fim" do histórico. */
  rolarAteOFim(): void;
};

export async function montar(
  url: string,
  fetcher: typeof fetch,
  opts: { storage?: Storage | null; online?: boolean; esperar?: boolean } = {},
): Promise<Montagem> {
  history.replaceState(null, "", url);
  document.body.replaceChildren();
  const raiz = document.createElement("div");
  document.body.append(raiz);
  const reportados: Montagem["reportados"] = [];
  let fim: (() => void) | null = null;
  const app = criarApp({
    raiz,
    fetch: fetcher,
    storage: opts.storage === undefined ? memoria() : opts.storage,
    online: () => opts.online ?? true,
    agora: () => AGORA,
    links: LINKS_TESTE,
    reportar: (erro, contexto) => reportados.push({ erro, contexto }),
    observarFim: (_alvo, cb) => {
      fim = cb;
      return () => {
        fim = null;
      };
    },
  });
  void app.iniciar();
  if (opts.esperar !== false) await app.ocioso();
  else await new Promise((r) => setTimeout(r, 0));
  return {
    app,
    raiz,
    reportados,
    rolarAteOFim: () => fim?.(),
  };
}

/** localStorage em memória, para simular "voltar ao app depois". */
export function memoria(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

export const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
/** Linha de tabela como "célula célula célula". */
export const linha = (tr: Element) => [...tr.children].map(texto).join(" ");
export const q = (raiz: ParentNode, sel: string) => raiz.querySelector(sel);
export const qa = (raiz: ParentNode, sel: string) => [...raiz.querySelectorAll(sel)];
