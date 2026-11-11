import type { Recibo } from "@ecoponto/contracts";
import {
  MATERIAIS,
  SITUACOES_PIX,
  formatDataHora,
  formatDataSimples,
  formatPontos,
  formatQuantidade,
  formatValor,
} from "@ecoponto/format";
import type { Links } from "../config.ts";
import { h } from "../dom.ts";
import { icone } from "../icons.ts";
import { caixa, cartao, linkInterno, selo } from "./comuns.ts";

export function voltarAoHistorico(): HTMLElement {
  return h(
    "p",
    { class: "voltar" },
    linkInterno({ nome: "historico", filtro: "todos" }, { class: "link link--voltar" }, icone("chevron-left", "icon--sm"), h("span", null, "Voltar ao histórico")),
  );
}

/** Recibo da entrega (T17). */
export function viewRecibo(r: Recibo, links: Links): HTMLElement[] {
  const pix = r.situacaoPix ? SITUACOES_PIX[r.situacaoPix] : null;
  const faleConosco = `${links.faleConosco}${links.faleConosco.includes("?") ? "&" : "?"}recibo=${encodeURIComponent(r.codigo)}`;

  return [
    voltarAoHistorico(),
    cartao(
      "Recibo da entrega",
      null,
      h(
        "dl",
        { class: "dados" },
        h("div", null, h("dt", null, "Código"), h("dd", { class: "code", "data-teste": "recibo-codigo" }, r.codigo)),
        h("div", null, h("dt", null, "Data e hora"), h("dd", null, formatDataHora(r.registradoEm))),
        h("div", null, h("dt", null, "Local"), h("dd", null, r.ecoponto.nome)),
      ),
      r.pesoManual
        ? h("p", { class: "selo selo--info selo--bloco", "data-teste": "peso-manual" }, icone("scale", "icon--sm"), h("span", null, "Peso informado manualmente"))
        : null,
    ),
    cartao(
      "Itens",
      null,
      h(
        "table",
        { class: "itens" },
        h("caption", { class: "visually-hidden" }, "Materiais entregues"),
        h(
          "thead",
          null,
          h("tr", null, h("th", { scope: "col" }, "Material"), h("th", { scope: "col" }, "Quantidade"), h("th", { scope: "col", class: "num" }, r.perfil === "catador" ? "Valor" : "Pontos")),
        ),
        h(
          "tbody",
          null,
          r.itens.map((i) =>
            h("tr", null, h("th", { scope: "row" }, MATERIAIS[i.material]), h("td", null, formatQuantidade(i.quantidade)), h("td", { class: "num" }, formatValor(i.valor))),
          ),
          r.bonus
            ? h(
                "tr",
                { class: "itens__bonus", "data-teste": "bonus" },
                h("th", { scope: "row", colspan: 2 }, h("span", { class: "com-icone" }, icone("sparkles", "icon--sm"), `Bônus da campanha ${r.bonus.campanha}`)),
                h("td", { class: "num" }, formatValor(r.bonus.valor)),
              )
            : null,
        ),
        h(
          "tfoot",
          null,
          h("tr", null, h("th", { scope: "row", colspan: 2 }, "Total da entrega"), h("td", { class: "num total", "data-teste": "recibo-total" }, formatValor(r.total))),
        ),
      ),
    ),
    cartao(
      null,
      null,
      h(
        "dl",
        { class: "dados" },
        r.cotaRestanteApos
          ? h("div", null, h("dt", null, "Cota restante depois desta entrega"), h("dd", { "data-teste": "cota-apos" }, formatPontos(r.cotaRestanteApos.pontos)))
          : null,
        pix ? h("div", null, h("dt", null, "Pagamento"), h("dd", { "data-teste": "recibo-pix" }, selo(pix))) : null,
        h(
          "div",
          null,
          h("dt", null, "Tabela de valores"),
          h("dd", { "data-teste": "tabela-versao" }, `Versão ${r.tabela.versao}, em vigor desde ${formatDataSimples(r.tabela.vigenteDesde)}`),
        ),
      ),
      pix?.detalhe ? h("p", { class: "situacao__detalhe" }, pix.detalhe) : null,
    ),
    h(
      "p",
      { class: "acao-final" },
      h("a", { class: "botao botao--secundario", href: faleConosco, "data-teste": "fale-conosco" }, icone("message-circle", "icon--sm"), "Algo errado? Fale com a gente"),
    ),
  ];
}

export function viewReciboNaoEncontrado(): HTMLElement[] {
  return [
    voltarAoHistorico(),
    caixa("info", "info", h("p", { "data-teste": "recibo-nao-encontrado", "data-estado": "nao-encontrado" }, "Não encontramos este recibo.")),
  ];
}
