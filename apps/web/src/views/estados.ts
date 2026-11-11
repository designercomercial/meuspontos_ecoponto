import { formatDiaHora } from "@ecoponto/format";
import type { Falha } from "../api.ts";
import type { Links } from "../config.ts";
import { h } from "../dom.ts";
import { icone } from "../icons.ts";
import { linkCanal } from "./comuns.ts";

/** Skeleton: blocos no formato do conteúdo. Sem spinner. */
export function skeleton(forma: "saldo" | "lista" | "recibo" | "cota"): HTMLElement {
  const bloco = (cls: string) => h("span", { class: `sk ${cls}` });
  const linhas = (n: number) =>
    Array.from({ length: n }, () =>
      h("div", { class: "sk-linha" }, bloco("sk--icone"), h("span", { class: "sk-col" }, bloco("sk--texto"), bloco("sk--curto")), bloco("sk--valor")),
    );
  const corpo =
    forma === "saldo"
      ? [h("div", { class: "card" }, bloco("sk--rotulo"), bloco("sk--destaque")), h("div", { class: "card" }, bloco("sk--texto"), bloco("sk--texto")), h("div", { class: "card" }, linhas(3))]
      : forma === "cota"
        ? [h("div", { class: "card" }, bloco("sk--texto"), bloco("sk--barra"), bloco("sk--curto"))]
        : forma === "recibo"
          ? [h("div", { class: "card" }, bloco("sk--rotulo"), bloco("sk--texto"), bloco("sk--curto")), h("div", { class: "card" }, linhas(3))]
          : [h("div", { class: "card" }, linhas(5))];
  return h(
    "div",
    { class: "skeleton", "data-estado": "carregando" },
    h("p", { class: "visually-hidden", role: "status" }, "Carregando seus pontos…"),
    h("div", { "aria-hidden": "true" }, corpo),
  );
}

/** Erro sem dados guardados: mensagem + "Tentar novamente". */
export function erro(falha: Falha, online: boolean, tentar: () => void): HTMLElement {
  let titulo = "Não foi possível carregar seus pontos.";
  let texto = "Verifique sua conexão e tente de novo.";
  let nome: "wifi-off" | "triangle-alert" = "triangle-alert";
  if (falha.tipo === "rede" && !online) {
    titulo = "Sem internet.";
    texto = "Conecte-se para ver seus pontos.";
    nome = "wifi-off";
  } else if (falha.tipo === "nao_autenticado") {
    titulo = "Sua sessão terminou.";
    texto = "Feche esta tela e abra Meus Pontos de novo pelo app.";
  } else if (falha.tipo === "servidor" || falha.tipo === "contrato") {
    texto = "O problema é do nosso lado. Tente de novo em alguns minutos.";
  }
  return h(
    "div",
    { class: "estado", role: "alert", "data-estado": "erro" },
    h("span", { class: "estado__icone" }, icone(nome)),
    h("p", { class: "estado__titulo" }, titulo),
    h("p", null, texto),
    botaoTentar(tentar),
  );
}

export function botaoTentar(tentar: () => void, classe = "botao"): HTMLButtonElement {
  return h("button", { type: "button", class: classe, "on:click": () => tentar() }, icone("refresh-cw", "icon--sm"), "Tentar novamente");
}

/** Mostrando dados guardados porque a rede falhou. */
export function avisoOffline(salvoEm: string, tentar: () => void): HTMLElement {
  return h(
    "div",
    { class: "faixa-offline", role: "status", "data-estado": "offline" },
    icone("wifi-off"),
    h("p", null, `Sem internet. Valores de ${formatDiaHora(salvoEm)}.`),
    botaoTentar(tentar, "botao botao--pequeno"),
  );
}

/** Nenhuma movimentação ainda. */
export function vazio(links: Links): HTMLElement {
  return h(
    "div",
    { class: "estado estado--vazio", "data-estado": "vazio" },
    h("span", { class: "estado__icone" }, icone("map-pin")),
    h("p", null, "Você ainda não tem entregas. Veja os ecopontos mais perto de você."),
    linkCanal(links.ecopontos, "Ver ecopontos", "chevron-right"),
  );
}
