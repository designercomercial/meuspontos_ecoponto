/**
 * Porta de leitura do livro-razão (T24) e dos recibos (T17).
 *
 * Esta página só lê. Toda implementação TEM de filtrar pelo `usuarioId` da
 * sessão: nunca devolve lançamento ou recibo de outra pessoa.
 *
 * Hoje só existe o adaptador mock (./mock.ts). Quando o T24 existir, um
 * adaptador PostgreSQL implementa esta mesma interface.
 */
import type {
  FiltroHistorico,
  Lancamento,
  Perfil,
  Recibo,
  Resumo,
} from "@ecoponto/contracts";

export type PosicaoCursor = { em: string; id: string };

export type ConsultaLancamentos = {
  mes?: string | undefined;
  filtro: FiltroHistorico;
  apos?: PosicaoCursor | undefined;
  limite: number;
};

export type PaginaInterna = {
  itens: Lancamento[];
  proximo: PosicaoCursor | null;
};

export interface LedgerReadPort {
  perfil(usuarioId: string): Promise<Perfil | null>;
  resumo(usuarioId: string): Promise<Resumo | null>;
  lancamentos(usuarioId: string, consulta: ConsultaLancamentos): Promise<PaginaInterna>;
  /** Devolve null se não existir OU se for de outra pessoa (mesma resposta). */
  recibo(usuarioId: string, codigo: string): Promise<Recibo | null>;
}
