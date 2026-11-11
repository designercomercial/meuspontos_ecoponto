/**
 * Cliente da API. Valida toda resposta pelo contrato (Zod): o que não bate
 * não é exibido (por exemplo, um saldo negativo).
 */
import {
  PaginaLancamentos,
  Recibo,
  RespostaErro,
  Resumo,
  type Esquema,
  type FiltroHistorico,
} from "@ecoponto/contracts";
import { resumoErroDeContrato } from "@ecoponto/observability";

export type Falha =
  | { tipo: "rede" }
  | { tipo: "nao_autenticado" }
  | { tipo: "nao_encontrado" }
  | { tipo: "servidor"; status: number }
  | { tipo: "contrato" };

export type Resultado<T> = { ok: true; dados: T } | { ok: false; falha: Falha };

export type Reportar = (erro: unknown, contexto: Record<string, string>) => void;

const TEMPO_LIMITE_MS = 10_000;
export const TAMANHO_PAGINA = 10;

/**
 * @param resumoAntecipado busca do resumo já iniciada no HTML (index.html),
 *   em paralelo com o download do JS. Usada uma vez, na primeira tela.
 */
export function criarApi(fetcher: typeof fetch, reportar: Reportar, resumoAntecipado: Promise<Response> | null = null) {
  let antecipado = resumoAntecipado;

  async function obter<T>(
    caminho: string,
    schema: Esquema<T>,
    rotulo: string,
    jaIniciada: Promise<Response> | null = null,
  ): Promise<Resultado<T>> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS);
    let res: Response;
    try {
      const pedido =
        jaIniciada ??
        fetcher(caminho, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: ctrl.signal,
        });
      // O tempo-limite vale também para a busca antecipada.
      const limite = new Promise<never>((_, rejeitar) =>
        ctrl.signal.addEventListener("abort", () => rejeitar(new Error("tempo esgotado"))),
      );
      res = await Promise.race([pedido, limite]);
    } catch {
      return { ok: false, falha: { tipo: "rede" } };
    } finally {
      clearTimeout(t);
    }

    let corpo: unknown = null;
    try {
      corpo = await res.json();
    } catch {
      corpo = null;
    }

    if (!res.ok) {
      const e = RespostaErro.safeParse(corpo);
      if (res.status === 401) return { ok: false, falha: { tipo: "nao_autenticado" } };
      if (res.status === 404 && e.success && e.data.erro === "recibo_nao_encontrado") {
        return { ok: false, falha: { tipo: "nao_encontrado" } };
      }
      if (res.status >= 500) reportar(new Error(`HTTP ${res.status}`), { endpoint: rotulo });
      return { ok: false, falha: { tipo: "servidor", status: res.status } };
    }

    const r = schema.safeParse(corpo);
    if (!r.success) {
      // Só caminho e código do erro: nenhum valor vai para o Sentry.
      reportar(new Error("Resposta fora do contrato"), {
        endpoint: rotulo,
        detalhe: resumoErroDeContrato(r.error.issues),
      });
      return { ok: false, falha: { tipo: "contrato" } };
    }
    return { ok: true, dados: r.data };
  }

  return {
    resumo: () => {
      const ja = antecipado;
      antecipado = null;
      return obter("/api/cidadao/pontos/resumo", Resumo, "resumo", ja);
    },

    lancamentos: (filtro: FiltroHistorico, cursor: string | null) => {
      // 10 por página: primeira carga leve em rede lenta; o resto vem ao rolar.
      const q = new URLSearchParams({ limite: String(TAMANHO_PAGINA) });
      if (filtro !== "todos") q.set("tipo", filtro);
      if (cursor) q.set("cursor", cursor);
      const s = q.toString();
      return obter(`/api/cidadao/pontos/lancamentos${s ? `?${s}` : ""}`, PaginaLancamentos, "lancamentos");
    },

    recibo: (codigo: string) =>
      obter(`/api/cidadao/pontos/recibos/${encodeURIComponent(codigo)}`, Recibo, "recibo"),
  };
}

export type Api = ReturnType<typeof criarApi>;
