/**
 * Últimos dados carregados, guardados no aparelho para abrir rápido e para
 * funcionar sem internet.
 *
 * - Cada entrada guarda a data em que foi salva (para "Valores de ...").
 * - Separado por usuário: se o usuário muda (celular compartilhado), tudo é
 *   apagado antes de salvar o novo.
 * - Tudo é revalidado pelo contrato ao ler; entrada inválida é descartada.
 * - localStorage é síncrono: a primeira tela pinta antes de qualquer rede.
 */
import type { Esquema } from "@ecoponto/contracts";

const PREFIXO = "eco-pontos:v1:";
const CHAVE_USUARIO = `${PREFIXO}usuario`;
/** Limite de recibos guardados, para não crescer sem fim. */
const MAX_RECIBOS = 20;

export type Entrada<T> = { dados: T; salvoEm: string };

export type Cache = {
  ler<T>(chave: string, schema: Esquema<T>): Entrada<T> | null;
  salvar<T>(chave: string, dados: T): void;
  remover(chave: string): void;
  /** Confere o dono do cache; se mudou, apaga tudo. */
  definirUsuario(ref: string): void;
};

export function criarCache(storage: Storage | null, agora: () => Date): Cache {
  const seguro = <T>(fn: () => T, padrao: T): T => {
    if (!storage) return padrao;
    try {
      return fn();
    } catch {
      return padrao;
    }
  };

  const chaves = () =>
    seguro(() => {
      const out: string[] = [];
      for (let i = 0; i < storage!.length; i++) {
        const k = storage!.key(i);
        if (k?.startsWith(PREFIXO)) out.push(k);
      }
      return out;
    }, [] as string[]);

  const limparTudo = () => seguro(() => chaves().forEach((k) => storage!.removeItem(k)), undefined);

  return {
    ler(chave, schema) {
      return seguro(() => {
        const bruto = storage!.getItem(PREFIXO + chave);
        if (!bruto) return null;
        const obj = JSON.parse(bruto) as { dados?: unknown; salvoEm?: unknown };
        const r = schema.safeParse(obj.dados);
        if (!r.success || typeof obj.salvoEm !== "string") {
          storage!.removeItem(PREFIXO + chave);
          return null;
        }
        return { dados: r.data, salvoEm: obj.salvoEm };
      }, null);
    },

    salvar(chave, dados) {
      seguro(() => {
        if (chave.startsWith("recibo:")) {
          const recibos = chaves().filter((k) => k.startsWith(`${PREFIXO}recibo:`));
          if (recibos.length >= MAX_RECIBOS && recibos[0]) storage!.removeItem(recibos[0]);
        }
        storage!.setItem(PREFIXO + chave, JSON.stringify({ dados, salvoEm: agora().toISOString() }));
      }, undefined);
    },

    remover(chave) {
      seguro(() => storage!.removeItem(PREFIXO + chave), undefined);
    },

    definirUsuario(ref) {
      seguro(() => {
        const atual = storage!.getItem(CHAVE_USUARIO);
        if (atual !== ref) {
          limparTudo();
          storage!.setItem(CHAVE_USUARIO, ref);
        }
      }, undefined);
    },
  };
}
