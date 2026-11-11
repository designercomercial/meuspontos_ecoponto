/**
 * Servidor: API + página estática (apps/web/dist) em /pontos/.
 *
 * Variáveis:
 *   PORT=3000
 *   ECO_DEV_LOGIN=1     liga os mocks e a entrada /dev (proibido em produção);
 *                       o argumento --mocks faz o mesmo (funciona no Windows)
 *   MOCK_AGORA=ISO      data de referência dos mocks (padrão 2026-11-11 10:00)
 *   SENTRY_DSN=...      liga o Sentry (eventos limpos de dados pessoais)
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { limparBreadcrumb, limparEvento } from "@ecoponto/observability";
import { authDeDesenvolvimento } from "./auth.ts";
import { buildApp, type Reportar } from "./app.ts";
import { ledgerMock } from "./ledger/mock.ts";
import { AGORA_MOCK, TOKENS_DEV } from "./ledger/mock-data.ts";

const aqui = dirname(fileURLToPath(import.meta.url));
const porta = Number(process.env.PORT ?? 3000);
const producao = process.env.NODE_ENV === "production";
const devLogin = process.env.ECO_DEV_LOGIN === "1" || process.argv.includes("--mocks");

if (producao && devLogin) {
  console.error("ECO_DEV_LOGIN não pode ser usado em produção.");
  process.exit(1);
}
if (!devLogin) {
  // Sem T24 não há fonte real de dados. Ver README, "Pendências".
  console.error("Livro-razão (T24) ainda não existe. Rode com ECO_DEV_LOGIN=1 para usar os mocks.");
  process.exit(1);
}

let reportar: Reportar | undefined;
if (process.env.SENTRY_DSN) {
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend: (e) => limparEvento(e),
    beforeBreadcrumb: (b) => limparBreadcrumb(b),
  });
  reportar = (erro, contexto) => Sentry.captureException(erro, { tags: contexto });
}

const app = await buildApp({
  auth: authDeDesenvolvimento(TOKENS_DEV),
  ledger: ledgerMock({ agora: () => new Date(process.env.MOCK_AGORA ?? AGORA_MOCK) }),
  devLogin: { tokens: TOKENS_DEV },
  reportar,
  logger: true,
});

// ---- Página (build do Vite) ----
const dist = resolve(aqui, "../../web/dist");
if (existsSync(dist)) {
  await app.register(fastifyStatic, {
    root: dist,
    prefix: "/pontos/",
    // Entrega .br/.gz gerados no build quando o navegador aceita.
    preCompressed: true,
    setHeaders(res, caminho) {
      // Arquivos com hash: cache longo. HTML e service worker: sempre revalidar.
      if (/[\\/]assets[\\/]/.test(caminho)) res.header("Cache-Control", "public, max-age=31536000, immutable");
      else res.header("Cache-Control", "no-cache");
    },
  });
  // /pontos/historico, /pontos/recibo/{codigo}... → index.html (a página resolve a rota).
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && /^\/pontos(\/|$)/.test(req.url) && !req.url.startsWith("/pontos/assets/")) {
      reply.header("Cache-Control", "no-cache");
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ erro: "nao_encontrado" });
  });
  app.get("/", (_req, reply) => reply.redirect("/dev"));
} else {
  app.log.warn("apps/web/dist não existe: rode `pnpm build` ou use `pnpm dev` (Vite em :5173).");
}

await app.listen({ port: porta, host: "127.0.0.1" });
