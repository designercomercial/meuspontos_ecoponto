import { FiltroHistorico } from "@ecoponto/contracts";

export const BASE = "/pontos";

export type Rota =
  | { nome: "saldo" }
  | { nome: "cota" }
  | { nome: "historico"; filtro: FiltroHistorico }
  | { nome: "recibo"; codigo: string };

/**
 * /pontos                    → saldo
 * /pontos/cota               → cota do mês
 * /pontos/historico?tipo=... → histórico
 * /pontos/recibo/{codigo}    → recibo (endereço aberto pela notificação T23)
 */
export function lerRota(pathname: string, search: string): Rota {
  const caminho = pathname.replace(/\/+$/, "");
  if (!caminho.startsWith(BASE)) return { nome: "saldo" };
  const resto = caminho.slice(BASE.length);

  const recibo = /^\/recibo\/([^/]+)$/.exec(resto);
  if (recibo?.[1]) {
    let codigo: string;
    try {
      codigo = decodeURIComponent(recibo[1]);
    } catch {
      codigo = recibo[1];
    }
    return { nome: "recibo", codigo: codigo.toUpperCase() };
  }
  if (resto === "/cota") return { nome: "cota" };
  if (resto === "/historico") {
    const f = FiltroHistorico.safeParse(new URLSearchParams(search).get("tipo") ?? "todos");
    return { nome: "historico", filtro: f.success ? f.data : "todos" };
  }
  return { nome: "saldo" };
}

export function urlDaRota(r: Rota): string {
  switch (r.nome) {
    case "saldo":
      return `${BASE}/`;
    case "cota":
      return `${BASE}/cota`;
    case "historico":
      return r.filtro === "todos" ? `${BASE}/historico` : `${BASE}/historico?tipo=${r.filtro}`;
    case "recibo":
      return `${BASE}/recibo/${encodeURIComponent(r.codigo)}`;
  }
}
