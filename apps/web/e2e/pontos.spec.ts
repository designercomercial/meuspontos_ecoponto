/**
 * Testes de ponta a ponta no build de produção (Chromium, perfil Pixel 5).
 * Cobrem o que só um navegador real mostra: tempo da primeira tela em 4G
 * simulado, offline com service worker, endereço direto do recibo e layout.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Pessoa = "dev-cidadao-luz" | "dev-cidadao-doacao" | "dev-catador";

async function entrar(context: BrowserContext, baseURL: string, pessoa: Pessoa) {
  await context.addCookies([{ name: "eco_sessao", value: pessoa, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

/** "Slow 4G" do Lighthouse + CPU 4x mais lenta (Android de entrada). */
async function emular4G(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

/** Marca o instante (desde o início da navegação) em que o saldo aparece. */
const MARCAR_SALDO = () => {
  const w = window as unknown as { __saldoEm?: number };
  new MutationObserver((_m, obs) => {
    if (document.querySelector("[data-teste=saldo]")) {
      w.__saldoEm = performance.now();
      obs.disconnect();
    }
  }).observe(document, { childList: true, subtree: true });
};

async function tempoAteSaldo(page: Page): Promise<number> {
  await page.goto("/pontos/");
  await page.locator("[data-teste=saldo]").waitFor();
  return page.evaluate(() => (window as unknown as { __saldoEm: number }).__saldoEm);
}

test("primeira tela abre em menos de 2 s em 4G simulado, sem cache e com cache", async ({ context, page, baseURL }) => {
  await entrar(context, baseURL!, "dev-cidadao-luz");
  // Aquece o servidor (a primeira requisição após subir compila o TypeScript).
  // Medimos o aparelho e a rede, não a partida do servidor.
  await page.request.get("/pontos/");
  await page.request.get("/api/cidadao/pontos/resumo");
  await page.addInitScript(MARCAR_SALDO);
  await emular4G(page);

  const semCache = await tempoAteSaldo(page);
  console.log(
    await page.evaluate(() =>
      [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")]
        .map((e) => {
          const r = e as PerformanceResourceTiming;
          return `${r.name.replace(location.origin, "")} start=${Math.round(r.startTime)} ttfb=${Math.round(r.responseStart)} end=${Math.round(r.responseEnd)} bytes=${r.transferSize}`;
        })
        .join("\n"),
    ),
  );
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);
  const comCache = await tempoAteSaldo(page);

  console.log(`Primeira tela (4G simulado, CPU 4x): sem cache ${Math.round(semCache)} ms, com cache ${Math.round(comCache)} ms`);
  expect(semCache).toBeLessThan(2000);
  expect(comCache).toBeLessThan(2000);
  await expect(page.locator("[data-teste=saldo]")).toHaveText("1.556 pontos");
});

test("offline mostra os últimos dados com dia e hora", async ({ context, page, baseURL }) => {
  await entrar(context, baseURL!, "dev-cidadao-luz");
  await page.goto("/pontos/");
  await expect(page.locator("[data-teste=saldo]")).toHaveText("1.556 pontos");
  await page.goto("/pontos/historico");
  await expect(page.locator(".lancs > li").first()).toBeVisible();
  await page.goto("/pontos/recibo/BV-R-9F1K3M");
  await expect(page.locator("[data-teste=recibo-codigo]")).toHaveText("BV-R-9F1K3M");
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);

  await context.setOffline(true);

  await page.goto("/pontos/");
  await expect(page.locator("[data-teste=saldo]")).toHaveText("1.556 pontos");
  await expect(page.locator("[data-estado=offline]")).toContainText(/Sem internet\. Valores de \d{2}\/\d{2} às \d{2}:\d{2}\./);
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();

  await page.goto("/pontos/historico");
  await expect(page.locator(".lancs > li").first()).toBeVisible();
  await expect(page.locator("[data-estado=offline]")).toBeVisible();

  await page.goto("/pontos/recibo/BV-R-9F1K3M");
  await expect(page.locator("[data-teste=recibo-codigo]")).toHaveText("BV-R-9F1K3M");
  await expect(page.locator("[data-estado=offline]")).toBeVisible();

  await context.setOffline(false);
});

test("o endereço /pontos/recibo/{codigo} abre o recibo direto (como a notificação)", async ({ context, page, baseURL }) => {
  await entrar(context, baseURL!, "dev-cidadao-luz");
  await page.goto("/pontos/recibo/BV-R-2V8L5R");
  await expect(page.locator("[data-teste=recibo-codigo]")).toHaveText("BV-R-2V8L5R");
  await expect(page.locator("[data-teste=bonus]")).toContainText("Vidro Vale Mais");
  await expect(page.locator("[data-teste=recibo-total]")).toHaveText("165 pontos");
  await page.getByRole("link", { name: "Voltar ao histórico" }).click();
  await expect(page).toHaveURL(/\/pontos\/historico$/);
});

test("recibo de outra pessoa não abre", async ({ context, page, baseURL }) => {
  await entrar(context, baseURL!, "dev-cidadao-doacao");
  await page.goto("/pontos/recibo/BV-R-9F1K3M");
  await expect(page.getByText("Não encontramos este recibo.")).toBeVisible();
  await expect(page.locator("[data-teste=recibo-codigo]")).toHaveCount(0);
});

test.describe("layout em 360 px, tema claro e escuro", () => {
  const telas: Array<[Pessoa, string]> = [
    ["dev-cidadao-luz", "/pontos/"],
    ["dev-cidadao-doacao", "/pontos/cota"],
    ["dev-cidadao-luz", "/pontos/historico"],
    ["dev-cidadao-luz", "/pontos/recibo/BV-R-2V8L5R"],
    ["dev-catador", "/pontos/"],
    ["dev-catador", "/pontos/historico"],
    ["dev-catador", "/pontos/recibo/BV-R-K9N0P1"],
  ];

  for (const tema of ["light", "dark"] as const) {
    for (const [pessoa, url] of telas) {
      test(`${tema} · ${pessoa} · ${url}`, async ({ context, page, baseURL }) => {
        await entrar(context, baseURL!, pessoa);
        await page.setViewportSize({ width: 360, height: 740 });
        await page.emulateMedia({ colorScheme: tema });
        await page.goto(url);
        await page.locator("main [data-teste], main .lancs, main .card").first().waitFor();
        await page.waitForLoadState("networkidle");

        // Sem rolagem horizontal.
        const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, tela: window.innerWidth }));
        expect(larguras.doc).toBeLessThanOrEqual(larguras.tela);

        // Áreas de toque de no mínimo 44 px.
        const pequenos = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("main a, main button, nav a, header button")]
            .filter((el) => el.offsetParent !== null)
            .map((el) => ({ texto: (el.textContent ?? el.getAttribute("aria-label") ?? "").trim(), h: el.getBoundingClientRect().height }))
            .filter((x) => x.h < 44),
        );
        expect(pequenos).toEqual([]);

        // Corpo com no mínimo 16 px.
        const menorFonte = await page.evaluate(() =>
          Math.min(
            ...[...document.querySelectorAll<HTMLElement>("main *")]
              .filter((el) => el.offsetParent !== null && el.childNodes.length > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
              .map((el) => parseFloat(getComputedStyle(el).fontSize)),
          ),
        );
        expect(menorFonte).toBeGreaterThanOrEqual(16);

        // Botões de ícone com nome acessível.
        const semNome = await page.evaluate(() =>
          [...document.querySelectorAll("button")].filter((b) => !(b.textContent ?? "").trim() && !b.getAttribute("aria-label")).length,
        );
        expect(semNome).toBe(0);
      });
    }
  }
});
