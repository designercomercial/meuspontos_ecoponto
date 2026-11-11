export { buildApp, codificarCursor, decodificarCursor, type OpcoesApp } from "./app.ts";
export { authDeDesenvolvimento, COOKIE_SESSAO, type AuthPort } from "./auth.ts";
export { ledgerMock, mascararChavePix } from "./ledger/mock.ts";
export { AGORA_MOCK, TOKENS_DEV, USUARIOS } from "./ledger/mock-data.ts";
export type { LedgerReadPort } from "./ledger/port.ts";
export type { FastifyInstance } from "fastify";

import { authDeDesenvolvimento } from "./auth.ts";
import { buildApp } from "./app.ts";
import { ledgerMock } from "./ledger/mock.ts";
import { AGORA_MOCK, TOKENS_DEV } from "./ledger/mock-data.ts";

/** App com mocks e relógio fixo. Usado em testes (API e web) e no modo dev. */
export function buildAppMock(agora: string = AGORA_MOCK) {
  return buildApp({
    auth: authDeDesenvolvimento(TOKENS_DEV),
    ledger: ledgerMock({ agora: () => new Date(agora) }),
    devLogin: { tokens: TOKENS_DEV },
  });
}
