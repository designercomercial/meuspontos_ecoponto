/**
 * API da página "Meus Pontos". Só leitura.
 *
 *   GET /api/cidadao/pontos/resumo
 *   GET /api/cidadao/pontos/lancamentos?mes=AAAA-MM&tipo=&cursor=
 *   GET /api/cidadao/pontos/recibos/{codigo}
 *
 * Toda rota usa o usuário da SESSÃO. Nenhum parâmetro do cliente escolhe de
 * quem são os dados nem qual é o perfil.
 */
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  CodigoRecibo,
  LancamentosQuery,
  PaginaLancamentos,
  Recibo,
  Resumo,
  type CodigoErro,
  type Esquema,
} from "@ecoponto/contracts";
import { resumoErroDeContrato } from "@ecoponto/observability";
import { z } from "zod";
import { COOKIE_SESSAO, type AuthPort, type Sessao } from "./auth.ts";
import type { LedgerReadPort, PosicaoCursor } from "./ledger/port.ts";

export type Reportar = (erro: unknown, contexto: Record<string, string>) => void;

export type OpcoesApp = {
  auth: AuthPort;
  ledger: LedgerReadPort;
  /** Rotas /dev para entrar como uma pessoa dos mocks. Nunca em produção. */
  devLogin?: { tokens: Readonly<Record<string, string>> } | undefined;
  reportar?: Reportar | undefined;
  logger?: boolean | undefined;
};

declare module "fastify" {
  interface FastifyRequest {
    sessao: Sessao | null;
  }
}

// ---------------------------------------------------------------------------
// Cursor opaco: base64url de {em, id}. O cliente só devolve o que recebeu.
// ---------------------------------------------------------------------------

const CursorSchema = z.object({ e: z.iso.datetime({ offset: true }), i: z.string().min(1).max(80) });

export function codificarCursor(p: PosicaoCursor): string {
  return Buffer.from(JSON.stringify({ e: p.em, i: p.id })).toString("base64url");
}

export function decodificarCursor(s: string): PosicaoCursor | null {
  try {
    const r = CursorSchema.safeParse(JSON.parse(Buffer.from(s, "base64url").toString("utf8")));
    return r.success ? { em: r.data.e, id: r.data.i } : null;
  } catch {
    return null;
  }
}

function erro(reply: FastifyReply, status: number, codigo: CodigoErro) {
  return reply.code(status).send({ erro: codigo });
}

export async function buildApp(opts: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger
      ? {
          // Nada de cookie, token ou query string no log.
          serializers: {
            req: (req: FastifyRequest) => ({ method: req.method, url: req.url.split("?")[0] ?? "" }),
          },
        }
      : false,
  });
  const reportar: Reportar = opts.reportar ?? (() => {});

  await app.register(cookie);
  app.decorateRequest("sessao", null);

  app.setErrorHandler((e, req, reply) => {
    const rota = req.routeOptions.url ?? "desconhecida";
    reportar(e, { rota });
    req.log.error({ rota, codigo: (e as { code?: string }).code }, "erro na rota");
    return erro(reply, 500, "erro_interno");
  });

  // ---- Rotas do cidadão: exigem sessão ----
  await app.register(
    async (r) => {
      r.addHook("onRequest", async (req, reply) => {
        req.sessao = await opts.auth.autenticar(req);
        if (!req.sessao) return erro(reply, 401, "nao_autenticado");
        // Dados de uma pessoa: o navegador pode guardar, proxies não.
        reply.header("Cache-Control", "private, no-cache");
        reply.header("Vary", "Cookie, Authorization");
      });

      /** Valida a saída contra o contrato antes de enviar. */
      function enviar<T>(reply: FastifyReply, schema: Esquema<T>, dados: unknown, rota: string) {
        const r = schema.safeParse(dados);
        if (!r.success) {
          reportar(new Error("Resposta fora do contrato"), { rota, detalhe: resumoErroDeContrato(r.error.issues) });
          return erro(reply, 500, "erro_interno");
        }
        return reply.send(r.data);
      }

      r.get("/resumo", async (req, reply) => {
        const usuarioId = req.sessao!.usuarioId;
        const resumo = await opts.ledger.resumo(usuarioId);
        if (!resumo) return erro(reply, 401, "nao_autenticado");
        return enviar(reply, Resumo, resumo, "resumo");
      });

      r.get("/lancamentos", async (req, reply) => {
        const q = LancamentosQuery.safeParse(req.query);
        if (!q.success) return erro(reply, 400, "parametro_invalido");
        let apos: PosicaoCursor | undefined;
        if (q.data.cursor) {
          const c = decodificarCursor(q.data.cursor);
          if (!c) return erro(reply, 400, "parametro_invalido");
          apos = c;
        }
        const pagina = await opts.ledger.lancamentos(req.sessao!.usuarioId, {
          mes: q.data.mes,
          filtro: q.data.tipo ?? "todos",
          apos,
          limite: q.data.limite ?? 15,
        });
        return enviar(
          reply,
          PaginaLancamentos,
          { itens: pagina.itens, proximoCursor: pagina.proximo ? codificarCursor(pagina.proximo) : null },
          "lancamentos",
        );
      });

      r.get<{ Params: { codigo: string } }>("/recibos/:codigo", async (req, reply) => {
        const codigo = CodigoRecibo.safeParse(req.params.codigo);
        // Código malformado, inexistente ou de outra pessoa: mesma resposta.
        if (!codigo.success) return erro(reply, 404, "recibo_nao_encontrado");
        const recibo = await opts.ledger.recibo(req.sessao!.usuarioId, codigo.data);
        if (!recibo) return erro(reply, 404, "recibo_nao_encontrado");
        return enviar(reply, Recibo, recibo, "recibo");
      });
    },
    { prefix: "/api/cidadao/pontos" },
  );

  // ---- Entrada de desenvolvimento (só com mocks) ----
  if (opts.devLogin) {
    const tokens = opts.devLogin.tokens;
    app.get("/dev", async (_req, reply) => {
      const links = Object.keys(tokens)
        .map((t) => `<li><a href="/dev/entrar?como=${encodeURIComponent(t)}">${t.replace(/^dev-/, "")}</a></li>`)
        .join("");
      return reply
        .type("text/html; charset=utf-8")
        .send(
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar (desenvolvimento)</title><body style="font:16px system-ui;padding:16px"><h1>Entrar como (só desenvolvimento)</h1><ul style="line-height:2.5">${links}</ul><p><a href="/dev/sair">Sair</a></p></body></html>`,
        );
    });
    app.get<{ Querystring: { como?: string; para?: string } }>("/dev/entrar", async (req, reply) => {
      const t = req.query.como ?? "";
      if (!Object.hasOwn(tokens, t)) return reply.code(400).send("Pessoa desconhecida");
      const para = req.query.para?.startsWith("/pontos") ? req.query.para : "/pontos/";
      return reply.setCookie(COOKIE_SESSAO, t, { path: "/", httpOnly: true, sameSite: "lax" }).redirect(para);
    });
    app.get("/dev/sair", async (_req, reply) =>
      reply.clearCookie(COOKIE_SESSAO, { path: "/" }).redirect("/dev"),
    );
  }

  return app;
}
