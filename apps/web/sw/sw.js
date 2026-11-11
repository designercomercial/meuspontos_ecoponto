/*
 * Service worker de Meus Pontos (gerado no build; ver vite.config.ts).
 *
 * - App shell (HTML, JS, CSS): guardado na instalação. Navegações em /pontos/*
 *   tentam a rede e, sem internet, usam o shell guardado.
 * - Arquivos com hash (/pontos/assets/*): cache primeiro (nunca mudam).
 * - API: NÃO passa por aqui. Os dados ficam no aparelho pela própria página,
 *   separados por usuário e com a data da última atualização.
 */
const VERSAO = "__VERSAO__";
const CACHE = "eco-pontos-shell-" + VERSAO;
const PRECACHE = __PRECACHE__;
const SHELL = "/pontos/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n.startsWith("eco-pontos-shell-") && n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: /pontos, /pontos/historico, /pontos/recibo/{codigo}...
  if (req.mode === "navigate" && url.pathname.startsWith("/pontos")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copia));
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/pontos/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
  }
});
