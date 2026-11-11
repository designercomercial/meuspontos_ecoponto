import type { Lancamento } from "@ecoponto/contracts";
import {
  DIRECOES,
  SITUACOES_PIX,
  TIPOS,
  formatData,
  formatValorComSinal,
  type InfoSituacao,
} from "@ecoponto/format";
import { h, oculto, type Filho } from "../dom.ts";
import { icone, type NomeIcone } from "../icons.ts";
import { urlDaRota, type Rota } from "../router.ts";

/** Link dentro da página (a navegação é interceptada pelo app). */
export function linkInterno(rota: Rota, attrs: Record<string, string>, ...filhos: Filho[]): HTMLAnchorElement {
  return h("a", { ...attrs, href: urlDaRota(rota), "data-rota": "" }, ...filhos);
}

/** Link para outro canal do app SASI. */
export function linkCanal(href: string, texto: string, nome: NomeIcone, rotulo?: string): HTMLAnchorElement {
  return h("a", { class: "link", href, "aria-label": rotulo }, h("span", null, texto), icone(nome, "icon--sm"));
}

let contadorId = 0;

/** Cartão com título. */
export function cartao(titulo: string | null, acao: Filho, ...filhos: Array<Filho | Filho[]>): HTMLElement {
  const id = titulo ? `t-${++contadorId}` : undefined;
  return h(
    "section",
    { class: "card", "aria-labelledby": id },
    titulo || acao
      ? h("div", { class: "card__head" }, titulo ? h("h2", { class: "card__title", id }, titulo) : null, acao)
      : null,
    ...filhos,
  );
}

/** Situação com ícone + texto + tom (nunca só cor). */
export function selo(info: InfoSituacao, texto = info.rotulo): HTMLElement {
  return h("span", { class: `selo selo--${info.tom}` }, icone(info.icone, "icon--sm"), h("span", null, texto));
}

/** Caixa de aviso/informação. `tom` usa os tokens de estado. */
export function caixa(tom: "aviso" | "info" | "sucesso", nome: NomeIcone, ...filhos: Filho[]): HTMLElement {
  return h(
    "div",
    { class: `caixa caixa--${tom}`, role: tom === "aviso" ? "note" : null },
    icone(nome),
    h("div", { class: "caixa__texto" }, ...filhos),
  );
}

/** Um lançamento no histórico ou nas últimas movimentações. */
export function itemLancamento(l: Lancamento): HTMLLIElement {
  const tipo = TIPOS[l.tipo];
  const dir = DIRECOES[l.direcao];
  const reais = l.valor.unidade === "reais";
  const valorTexto = formatValorComSinal(l.valor, l.direcao);
  const pix = l.situacaoPix ? SITUACOES_PIX[l.situacaoPix] : null;

  const conteudo: Filho[] = [
    h("span", { class: "lanc__tipo" }, icone(tipo.icone)),
    h(
      "span",
      { class: "lanc__texto" },
      h("span", { class: "lanc__desc" }, l.descricao),
      h("span", { class: "lanc__data" }, formatData(l.ocorridoEm)),
      pix ? selo(pix) : null,
    ),
    h(
      "span",
      { class: `lanc__valor lanc__valor--${l.direcao}`, "data-direcao": l.direcao },
      icone(dir.icone, "icon--sm"),
      // Leitor de tela ouve "Crédito: +120 pontos" / "Recebido: R$ 12,50".
      oculto(reais ? "Recebido: " : `${dir.rotulo}: `),
      h("span", { class: "lanc__numero" }, valorTexto),
    ),
  ];

  if (l.reciboCodigo) {
    return h(
      "li",
      { class: "lanc-item" },
      linkInterno(
        { nome: "recibo", codigo: l.reciboCodigo },
        { class: "lanc lanc--link" },
        ...conteudo,
        oculto(". Ver recibo"),
        icone("chevron-right", "lanc__seta icon--sm"),
      ),
    );
  }
  return h("li", { class: "lanc-item" }, h("div", { class: "lanc" }, ...conteudo));
}

export function listaLancamentos(itens: readonly Lancamento[]): HTMLUListElement {
  return h("ul", { class: "lancs" }, itens.map(itemLancamento));
}
