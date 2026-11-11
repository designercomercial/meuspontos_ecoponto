import type { ResumoCatador, ResumoCidadao } from "@ecoponto/contracts";
import {
  SITUACOES_LUZ,
  SITUACOES_PIX,
  formatDataHora,
  formatDiaDoMes,
  formatInteiro,
  formatPontos,
  formatReais,
  formatValor,
} from "@ecoponto/format";
import type { Links } from "../config.ts";
import { h } from "../dom.ts";
import { icone } from "../icons.ts";
import { caixa, cartao, linkCanal, linkInterno, listaLancamentos, selo } from "./comuns.ts";
import { vazio } from "./estados.ts";

/** "1.250 pontos" com o número em destaque. */
function destaquePontos(pontos: number): HTMLElement {
  return h(
    "p",
    { class: "destaque", "data-teste": "saldo" },
    h("span", { class: "destaque__numero" }, formatInteiro(pontos)),
    " ",
    h("span", { class: "destaque__unidade" }, pontos === 1 ? "ponto" : "pontos"),
  );
}

function linkAlterar(links: Links, rotulo: string): HTMLAnchorElement {
  return linkCanal(links.meuPerfil, "Alterar", "pencil-line", rotulo);
}

function ultimas(resumo: ResumoCidadao | ResumoCatador, links: Links): HTMLElement {
  const itens = resumo.ultimasMovimentacoes;
  return cartao(
    "Últimas movimentações",
    null,
    itens.length === 0
      ? vazio(links)
      : [
          listaLancamentos(itens),
          h(
            "p",
            { class: "card__rodape" },
            linkInterno({ nome: "historico", filtro: "todos" }, { class: "link" }, h("span", null, "Ver histórico"), icone("chevron-right", "icon--sm")),
          ),
        ],
  );
}

function formaDeReceber(r: ResumoCidadao, links: Links): HTMLElement {
  const f = r.formaDeReceber;
  const alterar = linkAlterar(links, "Alterar forma de receber");

  if (f.tipo === "pontos") {
    return cartao(
      "Como você recebe: pontos",
      alterar,
      h("p", null, "Seus pontos ficam aqui para trocar por prêmios."),
      h("p", null, linkCanal(links.premios, "Ver prêmios", "chevron-right")),
    );
  }

  if (f.tipo === "credito_luz") {
    const envio = f.ultimoEnvio;
    const info = envio ? SITUACOES_LUZ[envio.situacao] : null;
    return cartao(
      "Como você recebe: crédito na conta de luz",
      alterar,
      h("p", null, `Os pontos do mês viram crédito na sua conta de luz. Próximo envio em ${formatDiaDoMes(f.proximoEnvioEm)}.`),
      envio && info
        ? h(
            "div",
            { class: "situacao", "data-teste": "ultimo-envio-luz" },
            h("p", { class: "situacao__rotulo" }, "Último envio"),
            h("div", { class: "situacao__linha" }, selo(info), h("span", null, `${formatValor(envio.valor)} em ${formatDataHora(envio.em)}`)),
            info.detalhe ? h("p", { class: "situacao__detalhe" }, info.detalhe) : null,
          )
        : null,
    );
  }

  return cartao(
    "Como você recebe: doação",
    alterar,
    h("p", null, `Seus pontos vão para ${f.beneficiario}.`),
    h("p", { class: "linha-valor" }, h("span", null, "Doado este mês"), h("strong", { class: "total" }, formatPontos(f.doadoNoMes.pontos))),
  );
}

export function viewSaldoCidadao(r: ResumoCidadao, links: Links): HTMLElement[] {
  const vencer = r.pontosAVencer;
  return [
    cartao("Seu saldo", null, destaquePontos(r.saldo.pontos)),
    formaDeReceber(r, links),
    vencer && vencer.valor.pontos > 0
      ? caixa(
          "aviso",
          "clock",
          h("p", { "data-teste": "pontos-a-vencer" }, `${formatPontos(vencer.valor.pontos)} vencem em ${formatDiaDoMes(vencer.ate)}.`),
          h("p", null, "Use antes dessa data para não perder."),
        )
      : null,
    ultimas(r, links),
  ].filter((x): x is HTMLElement => x !== null);
}

export function viewSaldoCatador(r: ResumoCatador, links: Links): HTMLElement[] {
  const pix = r.ultimoPix;
  const info = pix ? SITUACOES_PIX[pix.situacao] : null;
  return [
    cartao(
      null,
      null,
      h(
        "p",
        { class: "destaque", "data-teste": "recebido-mes" },
        h("span", { class: "destaque__rotulo" }, "Recebido este mês: "),
        h("span", { class: "destaque__numero" }, formatReais(r.recebidoNoMes.centavos)),
      ),
    ),
    cartao(
      "Último Pix",
      null,
      pix && info
        ? h(
            "div",
            { class: "situacao", "data-teste": "ultimo-pix" },
            h("div", { class: "situacao__linha" }, selo(info), h("span", null, `${formatReais(pix.valor.centavos)} em ${formatDataHora(pix.em)}`)),
            info.detalhe ? h("p", { class: "situacao__detalhe" }, info.detalhe) : null,
          )
        : h("p", null, "Nenhum Pix enviado ainda."),
    ),
    cartao(
      "Sua chave Pix",
      linkAlterar(links, "Alterar chave Pix"),
      h("p", { class: "chave-pix", "data-teste": "chave-pix" }, icone("key-round", "icon--sm"), h("span", null, r.chavePixMascarada)),
    ),
    ultimas(r, links),
  ];
}
