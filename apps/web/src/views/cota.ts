import type { ResumoCidadao } from "@ecoponto/contracts";
import { formatDiaDoMes, formatInteiro, formatPontos } from "@ecoponto/format";
import type { Links } from "../config.ts";
import { h } from "../dom.ts";
import { caixa, cartao, linkCanal } from "./comuns.ts";

/** Aba "Cota do mês" (só cidadão). Todos os números vêm do servidor. */
export function viewCota(r: ResumoCidadao, links: Links): HTMLElement[] {
  const c = r.cota;
  const renova = formatDiaDoMes(c.renovaEm);
  const texto = `Você usou ${formatInteiro(c.usado)} de ${formatPontos(c.limite)} este mês`;

  return [
    cartao(
      "Cota do mês",
      null,
      h("p", { class: "cota__texto", "data-teste": "cota-texto" }, texto),
      h(
        "div",
        {
          class: `barra${c.atingida ? " barra--cheia" : ""}`,
          role: "progressbar",
          "aria-label": "Cota do mês usada",
          "aria-valuemin": 0,
          "aria-valuemax": c.limite,
          "aria-valuenow": c.usado,
          "aria-valuetext": `${formatInteiro(c.usado)} de ${formatPontos(c.limite)}`,
        },
        h("span", { class: "barra__preenchido", style: `width:${c.percentualUsado}%` }),
      ),
      h(
        "div",
        { class: "cota__legenda" },
        h("span", null, `Usado: ${formatPontos(c.usado)}`),
        h("span", { "data-teste": "cota-restante" }, `Restante: ${formatPontos(c.restante)}`),
      ),
      h("p", { "data-teste": "cota-renova" }, `Sua cota renova em ${renova}.`),
    ),
    c.atingida
      ? caixa(
          "aviso",
          "triangle-alert",
          h("p", { "data-teste": "cota-atingida" }, `Você atingiu a cota deste mês. Novas entregas voltam a contar a partir de ${renova}.`),
        )
      : null,
    cartao(
      "O que é a cota",
      null,
      h(
        "p",
        null,
        "A cota é o limite de pontos que suas entregas podem gerar em um mês. Quando ela acaba, você pode continuar entregando recicláveis, mas as entregas só voltam a contar no mês seguinte.",
      ),
      h("p", null, linkCanal(links.regulamento, "Ler o regulamento (PDF)", "file-text")),
    ),
  ].filter((x): x is HTMLElement => x !== null);
}
