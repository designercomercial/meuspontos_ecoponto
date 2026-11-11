# Meus Pontos – ECOponto Boa Vista

Página do canal "Meus Pontos" do app do cidadão (plataforma SASI), aberta em webview.
Mostra saldo, cota do mês, histórico e recibo de cada entrega. **Só lê dados:** todo valor vem do servidor.

> O livro-razão (T24) e o cálculo da entrega (T16) ainda não existem. A API lê de uma
> porta (`LedgerReadPort`) que hoje tem só o adaptador **mock**. Ver "Pendências".

## Como rodar

Requisitos: Node 22+ e pnpm (`corepack enable pnpm`).

```bash
pnpm install
pnpm dev          # API em :3000 (mocks) + Vite em :5173
```

Abra <http://localhost:5173/dev> e escolha uma pessoa de exemplo:

| Pessoa | O que mostra |
|---|---|
| `cidadao-luz` | 4 meses de histórico, crédito na conta de luz com envio devolvido, bônus, resgate, estorno, peso manual |
| `cidadao-doacao` | doação para escola, cota do mês atingida, saldo zero |
| `cidadao-novo` | sem movimentações (estado vazio) |
| `catador` | 10 entregas pagas em Pix, 1 com falha, valores em reais |

Build de produção, com a API servindo a página em `/pontos/`:

```bash
pnpm build && pnpm start   # http://localhost:3000/dev
```

Testes:

```bash
pnpm test        # unitários, servidor e telas (Vitest)
pnpm typecheck
pnpm test:e2e    # Playwright: 4G simulado, offline, recibo direto, layout 360 px
```

A rota `/dev` e os mocks só sobem com `--mocks` ou `ECO_DEV_LOGIN=1`. O servidor se recusa a subir assim com `NODE_ENV=production`.

## Estrutura

```
packages/contracts      Zod (zod/mini): resumo, lançamentos, recibo, tipos e direções
packages/format         formatação pt-BR (1.250 pontos, 12,5 kg, R$ 86,40, datas em America/Boa_Vista)
                        e mapeamento tipo → rótulo/ícone, crédito/débito, situações do Pix e da luz
packages/tokens         tokens.css: o único arquivo com cores
packages/observability  limpeza de eventos do Sentry (sem CPF, nome, chave Pix ou valores)
apps/api                Fastify: 3 endpoints, autenticação, porta do livro-razão, mocks
apps/web                Vite + TypeScript sem framework; service worker para offline
```

## Onde ficam os tokens

`packages/tokens/tokens.css`. São os mesmos valores da Minha Carteirinha, mais os tokens de estado
(`--warning-*`, `--success-*`, `--info-*`, `--credit-text`, skeleton, barra de progresso) e
`--brand-text` (saldo e totais: `--brand` no claro e azul claro no escuro, para manter o contraste AA).
Componentes usam só `var(--token)`; não há cor em hex fora desse arquivo.

## Como a notificação abre o recibo

O recibo tem endereço próprio: **`/pontos/recibo/{codigo}`** (ex.: `/pontos/recibo/BV-R-9F1K3M`).

1. A notificação de entrega registrada (T23) abre esse endereço no webview.
2. O servidor devolve o `index.html` para qualquer `/pontos/*`.
3. A página lê a rota e chama `GET /api/cidadao/pontos/recibos/{codigo}`.
4. O servidor só procura entre os recibos do usuário da sessão. Se o recibo não existe ou é de
   outra pessoa, a resposta é a mesma (404): "Não encontramos este recibo."

Sem internet, o recibo abre se já foi visto antes neste aparelho.

## API

| Endpoint | Retorno |
|---|---|
| `GET /api/cidadao/pontos/resumo` | perfil, saldo (ou recebido no mês), forma de receber e situação, cota, pontos a vencer, 3 últimas movimentações |
| `GET /api/cidadao/pontos/lancamentos?mes=AAAA-MM&tipo=entregas\|premios\|outros&cursor=&limite=` | página de lançamentos + `proximoCursor` |
| `GET /api/cidadao/pontos/recibos/{codigo}` | recibo completo (só do próprio usuário) |

- Toda rota usa o usuário da **sessão** (cookie `eco_sessao` ou `Authorization: Bearer`).
  O perfil nunca vem da URL.
- A resposta é validada pelo contrato antes de sair. A página valida de novo ao receber: um
  saldo negativo, por exemplo, não é exibido, e o erro é reportado sem o valor.

## Offline e desempenho

- **Dados:** o último resumo, a primeira página de cada filtro e os recibos abertos ficam no
  aparelho (localStorage), com a hora em que foram salvos. São separados por usuário e apagados
  quando outra pessoa entra no mesmo celular.
- **App shell:** o service worker (gerado no build) guarda HTML, JS e CSS.
- Sem rede, a página mostra os dados guardados com "Sem internet. Valores de 11/11 às 14:32.".
- A busca do resumo começa no próprio HTML, em paralelo com o download do JS. Os arquivos saem
  pré-comprimidos (brotli/gzip). O JS tem 20 KB gzip.
- Medido no Playwright, com Slow 4G (150 ms, 1,6 Mbps) e CPU 4x mais lenta: **cerca de 1,6 s sem
  cache e cerca de 0,1 s com cache** até o saldo aparecer.

## Pendências de definição

1. **Livro-razão (T24) e cálculo da entrega (T16):** não existem. Falta o adaptador PostgreSQL da
   `LedgerReadPort` (`apps/api/src/ledger/port.ts`). Redis não foi usado, porque não há o que guardar sem fonte real.
2. **Validade dos pontos:** se vencem e em quanto tempo. A página mostra "pontos que vencem" só se a
   API mandar `pontosAVencer`. O mock da `cidadao-luz` manda, só para demonstração.
3. **Autenticação no webview SASI:** como o app entrega a sessão ao canal URL. Hoje: cookie
   `eco_sessao` ou Bearer, com tokens de desenvolvimento.
4. **Endereços dos outros canais** (Prêmios, Meu Perfil, Ecopontos, Fale Conosco, PDF do
   Regulamento): configuráveis por `VITE_LINK_*` no build (`apps/web/src/config.ts`).
5. **Regra de "recebido no mês" do catador:** hoje soma só Pix **confirmados**. Confirmar se Pix
   "enviado" também conta.
6. **Cota:** unidade definida como pontos. Confirmar se o bônus de campanha conta na cota (hoje não
   conta) e o limite mensal (mock: 1.000 pontos).
7. **Texto explicativo da cota** e da situação "devolvido" da conta de luz: revisar com o jurídico
   e a comunicação.
8. **Sentry:** precisa de `SENTRY_DSN` (API) e `VITE_SENTRY_DSN` (web).
9. **Minha Carteirinha:** os tokens foram copiados, não movidos. Quando a carteirinha entrar no
   monorepo, ela deve usar `@ecoponto/tokens`. Ela ainda decide o perfil por `?perfil=` na URL.
