# RFC-001 — Convenções de Arquitetura e Segurança do selfhub-backend

Status: **Aceito** (efetivo a partir de 2026-06-21)
Aplica-se a: todo código sob `src/`

## 1) Propósito

Este documento existe para que os próximos prompts/PRs neste repositório sigam um
padrão único, em vez de cada feature reinventar sua própria forma de validar,
autorizar e responder. Ele nasce de uma auditoria completa de segurança e
arquitetura (2026-06-21) que encontrou inconsistências relevantes entre módulos
(ver §7 para o que ainda está pendente). Qualquer código novo deve seguir as
regras abaixo; qualquer código antigo que viole uma regra deve ser corrigido
quando tocado por outro motivo (não é necessário um refactor dedicado só para
isso, exceto onde já há um item rastreado em §7).

## 2) Camadas

```
routes.ts → Controller → Service → Prisma
```

- **Controller**: única camada que toca `FastifyRequest`/`FastifyReply`. Faz
  parsing/cast do `body`/`params`/`query`, repassa para o Service, e traduz o
  resultado do Service em `reply.status(...).send(...)`. Não deve conter
  regra de negócio nem chamar `prismaClient` diretamente.
- **Service**: contém toda a regra de negócio e toda chamada ao Prisma. Não
  conhece `FastifyRequest`/`FastifyReply`. Recebe dados já desestruturados
  (incluindo `loggedUser`, quando aplicável) e retorna um envelope de resposta
  (ver §4) ou lança um erro controlado (ver §5).
- Exceção conhecida e **não recomendada para novo código**: `GetCategoriesController`,
  `GetProductsController` e `GetRestaurantController` consultam o Prisma
  diretamente, sem Service. Isso é dívida técnica (ver §7, item M4) — não
  copie esse padrão em features novas.

## 3) Autenticação e autorização

- Toda rota que precisa de usuário autenticado usa `preHandler: [verifyToken]`
  (`src/shared/utils/verifyToken.ts`). Isso popula `request.user = { id, role, restaurantId }`.
- **Nunca** confie em `restaurantId`, `role`, ou qualquer campo de identidade
  vindo do `body`/`query` de uma rota autenticada — sempre use `request.user`.
- Hierarquia de papéis: `WAITER < MANAGER < ADMIN`. Regra padrão ao introduzir
  uma nova operação restrita:
  - **WAITER**: leitura do próprio escopo apenas; nunca pode alterar dados de
    outro perfil nem seu próprio `role`.
  - **MANAGER**: pode gerenciar catálogo (categorias/produtos/zonas de entrega)
    e pedidos do próprio restaurante; ao editar outro perfil, só pode editar
    perfis que atualmente são `WAITER`.
  - **ADMIN**: acesso total dentro do próprio restaurante. Nenhum papel tem
    acesso entre restaurantes (multi-tenant estrito).
  - Esse modelo está implementado em `UpdateProfileService` — use-o como
    referência para qualquer nova feature que edite recursos pertencentes a
    outro usuário.
- **Toda query que retorna ou modifica dados específicos de um tenant deve
  filtrar por `restaurantId: loggedUser.restaurantId`** (ou equivalente via
  relação, ex.: `category: { restaurantId }` para `Product`). Um 404 (não 403)
  deve ser retornado quando o recurso existe mas pertence a outro restaurante,
  para não revelar a existência do recurso entre tenants.
- Rotas públicas (sem `verifyToken`) só devem existir para os fluxos já
  documentados: registro (`/auth/register`, sempre cria `WAITER`), login,
  pareamento de dispositivo, catálogo público (`GET /products`, `GET /categories`,
  `GET /restaurant/:cnpj`) e criação de pedido via QR de mesa (`POST /orders`).
  Qualquer rota pública nova precisa de justificativa explícita — o padrão é
  exigir autenticação.
- **Registro público nunca aceita `role` do cliente.** Promoção de papel é
  sempre uma ação autenticada de um ADMIN/MANAGER via `PUT /profile/:id`.

## 4) Contrato de resposta

Toda resposta HTTP — sucesso ou erro — segue o envelope:

```json
{ "statusCode": 200, "response": { }, "message": "..." }
```

ou, em erro:

```json
{ "statusCode": 400, "response": null, "message": "..." }
```

Use sempre os helpers de `src/shared/utils/httpResponse.ts`
(`successResponse`, `badRequest`, `unauthorized`, `notFound`, `internalError`,
`errorResponse`) em vez de montar o objeto manualmente. Não retorne uma
entidade "crua" (sem envelope) em nenhuma rota nova.

## 5) Tratamento de erros

- Erros **operacionais** (validação, autorização, não encontrado — qualquer
  coisa com `statusCode < 500`) podem ter sua `message` retornada ao cliente
  literalmente, pois o texto é escrito por nós e não contém detalhe interno.
- Erros **inesperados** (`statusCode >= 500`) **nunca** devem expor
  `error.message`/stack ao cliente — apenas uma mensagem genérica. Em troca,
  toda resposta 500 inclui um campo `errorId` (= `request.id`, um UUID por
  requisição — ver `genReqId` em `src/server.ts`), e o servidor loga, na
  mesma linha indexada por esse id, o erro completo (`err` com `message` e
  `stack`) mais o contexto da requisição (`method`, `url`, `userId`,
  `restaurantId`). Isso permite depurar um erro relatado por um cliente sem
  nunca ter vazado detalhe interno na resposta: basta buscar o `errorId` no
  log.

  ```json
  { "statusCode": 500, "response": null, "message": "Failed to fetch categories", "errorId": "71e2eaaf-ccbd-4325-ac2d-951cda0a6220" }
  ```

  ```json
  { "level": 50, "reqId": "71e2eaaf-ccbd-4325-ac2d-951cda0a6220", "err": { "message": "...", "stack": "..." }, "method": "GET", "url": "/categories?restaurantId=...", "msg": "Failed to fetch categories" }
  ```

- **Em todo controller**, erro inesperado (qualquer coisa que caia no
  `catch` sem ser um erro operacional controlado) deve usar
  `respondInternalError(request, reply, error, "<mensagem pública>")`
  (`src/shared/utils/respondInternalError.ts`) em vez de montar a resposta
  500 manualmente. Esse helper já faz o log estruturado e já inclui o
  `errorId` na resposta — não duplique essa lógica.
- Erros que escapam de todos os `catch` (não deveria acontecer, mas é a
  rede de segurança) caem no `errorHandler` global
  (`src/shared/middlewares/errorHandler.ts`), que aplica exatamente o mesmo
  padrão (log completo + `errorId` na resposta).
- Padrão para lançar um erro operacional dentro de um Service:
  `throw { statusCode: 404, message: "..." }` (estilo usado em
  `RegisterUserService`/`LoginUserService`) — o `errorHandler` global e os
  `catch` dos controllers já tratam esse formato.
- **Nunca** use `console.log`/`console.error`/`console.warn` para erros de
  requisição em código novo — use `request.log.error(...)` (diretamente, ou
  via `respondInternalError`). `console.*` só é aceitável para diagnósticos
  de boot, fora do ciclo de uma requisição (ex.: `src/shared/env.ts`).
- Services não precisam (e geralmente não devem) capturar erros do Prisma ou
  de chamadas externas (ex.: OpenAI) só para logar e relançar — isso duplica
  log sem contexto de requisição. Deixe o erro subir descapturado; o
  controller loga com `respondInternalError`, que já tem acesso a
  `request` e por isso loga com muito mais contexto (rota, usuário,
  `errorId`) do que o Service conseguiria.

## 6) Validação de entrada

- Não existe ainda uma lib de schema (zod/joi) no projeto — validações são
  manuais, feitas no início do Service. Ao escrever uma validação nova:
  - Valide presença e tipo de todo campo obrigatório antes de qualquer query.
  - Valide formato de `ObjectId` (`/^[0-9a-fA-F]{24}$/`) antes de passar um id
    para o Prisma — um id malformado lançado direto ao Prisma vira um erro
    interno feio (ver `RegisterUserService`/`CreateOrderService` para o padrão).
  - Para listas (`items`, etc.), valide não-vazio e valide cada elemento
    individualmente (quantidade positiva, ids presentes) antes do loop de
    persistência.
- **Nunca confie em preço/valor total enviado pelo cliente.** Quando uma
  operação envolve dinheiro (criação de pedido, futuros cupons/descontos), o
  valor final deve ser recalculado no servidor a partir do catálogo
  (`Product.price`, etc.), nunca aceito como veio no `body`. Ver
  `CreateOrderService.execute` para o padrão atual e a ressalva sobre
  `customizationOptions` em §7.

## 7) Dívida técnica conhecida (não bloqueante, mas a corrigir quando tocar o módulo)

Itens levantados na auditoria de 2026-06-21 e ainda não resolvidos:

- **Preço de customizações não verificado**: `CreateOrderService` recalcula o
  total a partir de `Product.price`, mas `customizationOptions.additionalPrice`
  ainda vem do cliente sem vínculo a um `CustomizationOption` real no banco
  (o schema atual não guarda esse id no `OrderItemCustomizationOption`).
  Corrigir exigirá migração de schema: adicionar `customizationOptionId` ao
  input e validar/recalcular o preço a partir do registro real.
- **Sem validação de schema (zod/joi)**: toda validação é manual via `as`
  casts. Adotar zod nos controllers é o próximo passo natural para reduzir
  bugs de tipo em runtime.
- **`GetCategoriesController`/`GetProductsController`/`GetRestaurantController`**
  ainda consultam Prisma direto, sem Service — extrair `GetCategoriesService`,
  `GetProductsService`, `GetRestaurantService` por consistência.
- **Checagem de papel duplicada**: o padrão `role === "WAITER"` /
  `['ADMIN','MANAGER'].includes(role)` está reimplementado em ~10 lugares.
  Extrair um `preHandler` `requireRole(...roles)` compartilhado.
- **Sem injeção de dependência do Prisma client**: todo Service importa o
  singleton diretamente, dificultando teste unitário sem mock de módulo.
- **`EditProductService`**: o replace de `customizationGroups` faz
  delete-then-recreate fora de uma `$transaction`, com loop de creates
  individuais em vez de nested `create`. Risco de estado inconsistente se
  falhar no meio.
- **`OPENAI_API_KEY` ausente só gera warning no boot**, não bloqueia o start
  — o erro só aparece quando alguém chama `/insights/*`. Decisão consciente
  (insights é uma feature opcional), mas documentar aqui para não ser
  "descoberto" de novo.
- **Envio de dados operacionais completos para a OpenAI** em
  `GetOrderInsightsService`/`GetProductInsightsService`, sem minimização —
  avaliar redação/agregação antes de qualquer expansão dessa feature.

## 8) Checklist para revisão de PR neste repositório

Ao revisar (ou gerar) uma mudança neste backend, confirme:

- [ ] Toda rota nova decide explicitamente: pública ou `preHandler: [verifyToken]`?
- [ ] Toda query/mutação está filtrada por `restaurantId` do usuário autenticado?
- [ ] Toda resposta usa o envelope `{ statusCode, response, message }` via os helpers de `httpResponse.ts`?
- [ ] Nenhum erro 500 expõe `error.message`/stack ao cliente?
- [ ] Todo `catch` de erro inesperado num controller usa `respondInternalError(...)` (não monta a resposta 500 nem loga via `console.*` manualmente)?
- [ ] Nenhum valor monetário é aceito do cliente sem recálculo/validação contra o catálogo?
- [ ] Toda checagem de papel segue a hierarquia WAITER < MANAGER < ADMIN descrita em §3?
- [ ] Métodos públicos novos têm um comentário TSDoc curto explicando propósito, autorização esperada e condições de erro?
