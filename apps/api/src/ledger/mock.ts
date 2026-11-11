/**
 * Adaptador mock da porta de leitura. Faz no servidor o que o T24 faria
 * (somar o livro-razão, apurar a cota). A página nunca faz essas contas.
 */
import { createHash } from "node:crypto";
import {
  DIRECAO_POR_TIPO,
  GRUPO_POR_TIPO,
  type Lancamento,
  type Perfil,
  type Recibo,
  type Resumo,
} from "@ecoponto/contracts";
import { chaveMes } from "@ecoponto/format";
import type { ConsultaLancamentos, LedgerReadPort, PaginaInterna, PosicaoCursor } from "./port.ts";
import { TABELAS, USUARIOS, type UsuarioFx } from "./mock-data.ts";

const soma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Próximo dia 1º no fuso de Boa Vista (AAAA-MM-DD). */
export function proximoDiaPrimeiro(agora: Date): string {
  const [ano = 0, mes = 0] = chaveMes(agora.toISOString()).split("-").map(Number);
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  return `${proxAno}-${String(proxMes).padStart(2, "0")}-01`;
}

/**
 * Mascara a chave Pix antes de sair do servidor.
 * CPF: ***.456.789-** (padrão do Banco Central). Telefone: (95) *****-4567.
 * E-mail: m***@exemplo.com. Aleatória: 1a2b…9z0y.
 */
export function mascararChavePix(chave: string): string {
  const digitos = chave.replace(/\D/g, "");
  if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(chave)) {
    return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
  }
  if (chave.includes("@")) {
    const [u = "", d = ""] = chave.split("@");
    return `${u.charAt(0)}***@${d}`;
  }
  if (/^\+?[\d\s()-]{10,}$/.test(chave)) {
    return `(${digitos.slice(-11, -9)}) *****-${digitos.slice(-4)}`;
  }
  return `${chave.slice(0, 4)}…${chave.slice(-4)}`;
}

type Interno = { lancamentos: Lancamento[]; recibos: Map<string, Recibo> };

function sinal(l: Lancamento): number {
  const v = l.valor.unidade === "pontos" ? l.valor.pontos : l.valor.centavos;
  return l.direcao === "credito" ? v : -v;
}

function ordenarDesc(a: { ocorridoEm: string; id: string }, b: { ocorridoEm: string; id: string }) {
  const d = Date.parse(b.ocorridoEm) - Date.parse(a.ocorridoEm);
  return d !== 0 ? d : b.id.localeCompare(a.id);
}

function montar(u: UsuarioFx): Interno {
  const lancamentos: Lancamento[] = [];
  const recibos = new Map<string, Recibo>();
  const catador = u.perfil === "catador";

  // Cota acumulada por mês, para "cota restante depois da entrega".
  const usadoNoMes = new Map<string, number>();
  const entregas = [...u.entregas].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));

  for (const e of entregas) {
    const valores = e.itens.map(([, , v]) => v);
    const subtotal = soma(valores);
    const total = subtotal + (e.bonus?.pontos ?? 0);

    let cotaRestanteApos: Recibo["cotaRestanteApos"] = null;
    if (!catador && u.cotaLimite !== undefined) {
      const mes = chaveMes(e.em);
      const usado = Math.min(u.cotaLimite, (usadoNoMes.get(mes) ?? 0) + subtotal);
      usadoNoMes.set(mes, usado);
      cotaRestanteApos = { unidade: "pontos", pontos: u.cotaLimite - usado };
    }

    recibos.set(e.codigo, {
      codigo: e.codigo,
      perfil: u.perfil,
      registradoEm: e.em,
      ecoponto: { nome: e.ecoponto },
      itens: e.itens.map(([material, qtd, v]) => ({
        material,
        quantidade: { valor: qtd, unidade: material === "oleo" ? "litro" : "kg" },
        valor: catador ? { unidade: "reais", centavos: v } : { unidade: "pontos", pontos: v },
      })),
      bonus: e.bonus ? { campanha: e.bonus.campanha, valor: { unidade: "pontos", pontos: e.bonus.pontos } } : null,
      total: catador ? { unidade: "reais", centavos: total } : { unidade: "pontos", pontos: total },
      cotaRestanteApos,
      tabela: TABELAS[e.tabela],
      pesoManual: e.pesoManual ?? false,
      situacaoPix: catador ? (e.pix ?? "enviado") : null,
    });

    if (catador) {
      lancamentos.push({
        id: `lan_${e.codigo}`,
        tipo: "pix_entrega",
        direcao: DIRECAO_POR_TIPO.pix_entrega,
        descricao: `Pix da entrega no ${e.ecoponto}`,
        ocorridoEm: e.em,
        valor: { unidade: "reais", centavos: total },
        reciboCodigo: e.codigo,
        situacaoPix: e.pix ?? "enviado",
      });
    } else {
      lancamentos.push({
        id: `lan_${e.codigo}`,
        tipo: "entrega",
        direcao: DIRECAO_POR_TIPO.entrega,
        descricao: `Entrega no ${e.ecoponto}`,
        ocorridoEm: e.em,
        valor: { unidade: "pontos", pontos: subtotal },
        reciboCodigo: e.codigo,
        situacaoPix: null,
      });
      if (e.bonus) {
        lancamentos.push({
          id: `lan_${e.codigo}_bonus`,
          tipo: "bonus_campanha",
          direcao: DIRECAO_POR_TIPO.bonus_campanha,
          descricao: `Bônus da campanha ${e.bonus.campanha}`,
          ocorridoEm: e.bonus.em,
          valor: { unidade: "pontos", pontos: e.bonus.pontos },
          reciboCodigo: e.codigo,
          situacaoPix: null,
        });
      }
    }
  }

  for (const o of u.outros) {
    lancamentos.push({
      id: o.id,
      tipo: o.tipo,
      direcao: DIRECAO_POR_TIPO[o.tipo],
      descricao: o.descricao,
      ocorridoEm: o.em,
      valor: { unidade: "pontos", pontos: o.pontos },
      reciboCodigo: null,
      situacaoPix: null,
    });
  }

  lancamentos.sort(ordenarDesc);
  return { lancamentos, recibos };
}

/** O lançamento vem depois do cursor na ordem do histórico (mais antigo). */
function depoisDoCursor(l: Lancamento, p: PosicaoCursor): boolean {
  return ordenarDesc(l, { ocorridoEm: p.em, id: p.id }) > 0;
}

/** Identificador opaco: separa o cache no aparelho sem expor o id interno. */
function referencia(usuarioId: string): string {
  return createHash("sha256").update(`eco-pontos:${usuarioId}`).digest("base64url").slice(0, 16);
}

export function ledgerMock(opts: { agora?: () => Date; usuarios?: readonly UsuarioFx[] } = {}): LedgerReadPort {
  const agora = opts.agora ?? (() => new Date());
  const usuarios = new Map((opts.usuarios ?? USUARIOS).map((u) => [u.id, u]));
  const dados = new Map([...usuarios.values()].map((u) => [u.id, montar(u)]));

  return {
    async perfil(usuarioId): Promise<Perfil | null> {
      return usuarios.get(usuarioId)?.perfil ?? null;
    },

    async resumo(usuarioId): Promise<Resumo | null> {
      const u = usuarios.get(usuarioId);
      const d = dados.get(usuarioId);
      if (!u || !d) return null;
      const hoje = agora();
      const mesAtual = chaveMes(hoje.toISOString());
      const doMes = d.lancamentos.filter((l) => chaveMes(l.ocorridoEm) === mesAtual);
      const base = {
        usuarioRef: referencia(usuarioId),
        atualizadoEm: hoje.toISOString(),
        ultimasMovimentacoes: d.lancamentos.slice(0, 3),
      };

      if (u.perfil === "catador") {
        const pix = d.lancamentos.filter((l) => l.tipo === "pix_entrega");
        const ultimo = pix[0];
        const recebido = soma(
          doMes
            .filter((l) => l.tipo === "pix_entrega" && l.situacaoPix === "confirmado")
            .map((l) => (l.valor.unidade === "reais" ? l.valor.centavos : 0)),
        );
        return {
          perfil: "catador",
          ...base,
          recebidoNoMes: { unidade: "reais", centavos: recebido },
          ultimoPix:
            ultimo && ultimo.situacaoPix && ultimo.valor.unidade === "reais"
              ? { situacao: ultimo.situacaoPix, em: ultimo.ocorridoEm, valor: ultimo.valor }
              : null,
          chavePixMascarada: mascararChavePix(u.chavePix ?? ""),
        };
      }

      // Saldo = soma do livro-razão. Invariante do T24: nunca negativo.
      const saldo = soma(d.lancamentos.map(sinal));
      if (saldo < 0) throw new Error("Invariante do livro-razão violada: saldo negativo");

      const limite = u.cotaLimite ?? 0;
      const usado = Math.min(
        limite,
        soma(doMes.filter((l) => l.tipo === "entrega").map((l) => (l.valor.unidade === "pontos" ? l.valor.pontos : 0))),
      );
      const renovaEm = proximoDiaPrimeiro(hoje);

      const forma = u.forma ?? { tipo: "pontos" as const };
      let formaDeReceber: Extract<Resumo, { perfil: "cidadao" }>["formaDeReceber"];
      if (forma.tipo === "credito_luz") {
        const envio = d.lancamentos.find((l) => l.tipo === "credito_luz_enviado");
        const devolvido =
          envio && d.lancamentos.some((l) => l.tipo === "credito_luz_devolvido" && Date.parse(l.ocorridoEm) > Date.parse(envio.ocorridoEm));
        const fx = envio ? u.outros.find((o) => o.id === envio.id) : undefined;
        formaDeReceber = {
          tipo: "credito_luz",
          proximoEnvioEm: renovaEm,
          ultimoEnvio:
            envio && envio.valor.unidade === "pontos"
              ? { situacao: devolvido ? "devolvido" : (fx?.situacaoLuz ?? "enviado"), em: envio.ocorridoEm, valor: envio.valor }
              : null,
        };
      } else if (forma.tipo === "doacao") {
        formaDeReceber = {
          tipo: "doacao",
          beneficiario: forma.beneficiario,
          doadoNoMes: {
            unidade: "pontos",
            pontos: soma(doMes.filter((l) => l.tipo === "doacao").map((l) => (l.valor.unidade === "pontos" ? l.valor.pontos : 0))),
          },
        };
      } else {
        formaDeReceber = { tipo: "pontos" };
      }

      return {
        perfil: "cidadao",
        ...base,
        saldo: { unidade: "pontos", pontos: saldo },
        formaDeReceber,
        cota: {
          unidade: "pontos",
          limite,
          usado,
          restante: limite - usado,
          percentualUsado: limite === 0 ? 0 : Math.round((usado / limite) * 1000) / 10,
          atingida: limite > 0 && usado >= limite,
          renovaEm,
        },
        pontosAVencer: u.pontosAVencer
          ? { valor: { unidade: "pontos", pontos: u.pontosAVencer.pontos }, ate: u.pontosAVencer.ate }
          : null,
      };
    },

    async lancamentos(usuarioId, c: ConsultaLancamentos): Promise<PaginaInterna> {
      const d = dados.get(usuarioId);
      if (!d) return { itens: [], proximo: null };
      const filtrados = d.lancamentos.filter(
        (l) =>
          (c.mes === undefined || chaveMes(l.ocorridoEm) === c.mes) &&
          (c.filtro === "todos" || GRUPO_POR_TIPO[l.tipo] === c.filtro) &&
          (c.apos === undefined || depoisDoCursor(l, c.apos)),
      );
      const itens = filtrados.slice(0, c.limite);
      const ultimo = itens.at(-1);
      return {
        itens,
        proximo: filtrados.length > c.limite && ultimo ? { em: ultimo.ocorridoEm, id: ultimo.id } : null,
      };
    },

    async recibo(usuarioId, codigo): Promise<Recibo | null> {
      // Busca SÓ entre os recibos do próprio usuário.
      return dados.get(usuarioId)?.recibos.get(codigo) ?? null;
    },
  };
}
