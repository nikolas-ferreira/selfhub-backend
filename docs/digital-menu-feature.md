# Documentação de Mudanças Necessárias — Cardápio Digital Self-Service

## Visão Geral

O frontend `selfhub-web` (cardápio digital web mobile, acessado via QR Code na mesa ou diretamente para delivery) está sendo implementado para consumir a API existente. A maior parte dos endpoints necessários **já existe e já é pública** (`GET /categories`, `GET /products`, `POST /orders`). Este documento cobre apenas as lacunas que impedem o fluxo 100% self-service (sem login) de funcionar, para que outro agente possa implementá-las no backend.

Decisão de produto que motiva estas mudanças: o cardápio digital **não depende do garçom** para abrir a comanda da mesa — o próprio cliente faz isso ao escanear o QR Code. O pagamento continua acontecendo depois, no caixa (fluxo `Bill`/`Payment` já existente, sem alteração).

**Decisão de produto adicional:** cada restaurante que contratar o serviço terá um **domínio próprio** (custom domain) apontando para o mesmo deploy do `selfhub-web` — não há um deploy por restaurante. Ou seja, o tenant (`restaurantId`) precisa ser resolvido a partir do **`Host` da requisição**, não de um parâmetro na URL. Isso é coberto na seção 0 abaixo.

---

## 0) Multi-tenancy por domínio — `Restaurant.domain` + `GET /restaurants/by-domain/:domain`

### Schema

Novo campo único em `Restaurant`:

```prisma
model Restaurant {
  // ...campos existentes
  domain String? @unique
}
```

`domain` guarda o hostname completo configurado pelo restaurante para o cardápio digital (ex.: `cardapio.boteco-do-ze.com.br`), sem protocolo/porta. Fica opcional porque restaurantes que só usam o `selfhub-admin` (sem cardápio digital) não precisam configurar um.

### Novo endpoint público — `GET /restaurants/by-domain/:domain`

Resolve o `restaurantId` a partir do hostname que o navegador do cliente está acessando. É o primeiro request que o `selfhub-web` faz ao carregar, antes de qualquer outra coisa.

- **Resposta (200):** mesmo formato de `GET /restaurants/:id` (seção 3) — `{ "id": "...", "name": "...", "cnpj": "...", "domain": "...", "created_at": "..." }`.
- **Erros:** `404` se nenhum restaurante tiver esse `domain` cadastrado (domínio não configurado/erro de DNS do cliente).
- **Arquivos a alterar:** mesmo módulo `src/modules/restaurant/` da seção 3 — adicionar um método de busca por `domain` (`prisma.restaurant.findUnique({ where: { domain } })`), registrar rota pública em `src/shared/routes.ts`.
- **Observação:** como vários domínios completamente diferentes vão apontar para a mesma origem da API, garantir que `CORS_ORIGIN` (ou a lógica de CORS em `server.ts`) aceite uma lista dinâmica/wildcard de domínios de clientes — hoje é uma lista fixa separada por vírgula em variável de ambiente, o que não escala para "qualquer domínio que um restaurante configurar". Vale revisitar para validar contra os `domain`s cadastrados no banco em vez de uma env var fixa.
- **Como o admin gerencia isso:** fora do escopo deste documento, mas o `selfhub-admin` precisará de uma tela para o restaurante configurar/verificar seu domínio (ou isso é feito manualmente pelo time SelfHub por enquanto).

### Como o frontend usa isso

Em produção, o `selfhub-web` chama `GET /restaurants/by-domain/:hostname` usando `window.location.hostname` assim que a aplicação carrega, antes de renderizar qualquer rota. Para ambientes sem domínio customizado (localhost, previews de PR, etc.), o frontend aceita um override via query string `?restaurantId=...` que pula essa resolução — documentado no próprio `selfhub-web`, sem impacto no backend.

---

## 1) Schema (`prisma/schema.prisma`)

### `Comanda.openedById` deve passar a ser opcional

Hoje (`schema.prisma` linha ~327):

```prisma
openedById   String        @db.ObjectId
```

Uma comanda aberta via self-checkin (cliente, sem login) não tem um `Profile` de staff associado. Tornar opcional:

```prisma
openedById   String?       @db.ObjectId
```

### Novo campo `Comanda.openedBy`

Para diferenciar comandas abertas por staff vs. abertas pelo próprio cliente (auditoria/relatórios):

```prisma
enum ComandaOpenedBy {
  STAFF
  CUSTOMER
}

model Comanda {
  // ...campos existentes
  openedBy ComandaOpenedBy @default(STAFF)
}
```

Quando `openedBy = CUSTOMER`, `openedById` é `null` e `openedByName` pode ser algo como `"Self-Service"`.

**Atenção:** como o provider é MongoDB, `prisma migrate dev` não é suportado — usar `prisma validate` + `prisma generate` e aplicar com `prisma db push` (mesma observação já registrada em `docs/delivery-feature.md`).

---

## 2) Comportamento importante já existente que afeta o self-checkin

Pelo comentário em `Comanda` (schema.prisma) e em `ComandaService.ts`: **uma mesa pode ter múltiplas comandas `OPEN` simultaneamente** — não há relação 1:1 mesa↔comanda, e `number` não é auto-incremental (hoje é "o que estiver impresso no cartão físico", escolhido por quem abre).

Isso importa porque o QR Code do cardápio digital só carrega o `tableNumber` (sem número de comanda — não há cartão físico no fluxo self-service). Logo, o endpoint novo de self-checkin (seção 3) precisa de uma regra de desambiguação:

- Se já existir **uma única** comanda `OPEN` para a mesa → reutilizar essa (`comandaId`).
- Se existir **mais de uma** comanda `OPEN` para a mesa → usar a mais recente (`openedAt` desc) como heurística. É uma limitação conhecida do MVP: grupos diferentes sentados "na mesma mesa numerada" ao mesmo tempo (raro, mas possível em alguns layouts) podem cair na comanda errada. Não bloquear por isso — apenas documentar.
- Se não existir nenhuma → criar uma nova comanda `CUSTOMER`. Como `number` não é mais "o que está no cartão", gerar um número disponível automaticamente (ex.: `max(número de comandas já usadas no restaurante, mesmo fechadas) + 1`, ou um contador dedicado por restaurante — qualquer estratégia que não colida com `@@index([restaurantId, number, status])` para comandas `OPEN`).

---

## 3) Novo endpoint público — `GET /restaurants/:id`

O QR Code de cada mesa codifica o `restaurantId` direto na URL do cardápio digital (`/r/:restaurantId/mesa/:tableNumber`), não o CNPJ. O único endpoint público de restaurante hoje é `GET /restaurant/:cnpj` — falta o equivalente por `id`, usado para exibir o nome real do restaurante no header do app (em vez de uma marca fixa).

- **Resposta (200):** `{ "id": "...", "name": "...", "cnpj": "...", "created_at": "..." }` — mesmo formato de `GET /restaurant/:cnpj`.
- **Erros:** `404` se não existir.
- **Arquivos a alterar:** reaproveitar `GetRestaurantService`/`GetRestaurantController` (`src/modules/restaurant/`) adicionando um método de busca por `id`, ou um novo controller seguindo o mesmo padrão; registrar `GET /restaurants/:id` em `src/shared/routes.ts` (rota pública, sem `verifyToken`).

---

## 4) Novo endpoint público — `POST /tables/:tableNumber/comandas/self-checkin`

Permite ao cardápio digital (sem autenticação) obter um `comandaId` válido para criar pedidos `LOCAL`, sem depender de um garçom.

- **Body:** `{ "restaurantId": "<ObjectId>" }`
- **Regra:** ver seção 2 (reusa comanda `OPEN` existente da mesa, com heurística de "mais recente" se houver mais de uma; senão cria uma nova com `openedBy: CUSTOMER`, `openedById: null`, `openedByName: "Self-Service"`).
- **Resposta (200 ou 201):**
  ```json
  {
    "statusCode": 200,
    "response": { "comandaId": "...", "comandaNumber": 17, "tableNumber": 4 },
    "message": "Comanda ready"
  }
  ```
- **Erros:** `404` se `restaurantId` não existir; `400` se `tableNumber` não for inteiro positivo.
- **Rate limit:** público, reaproveitar o limite de 20/min já usado em `POST /orders` (mesma exposição a abuso).
- **Arquivos a alterar**, seguindo o padrão de `ComandaController`/`ComandaService` já existentes em `src/modules/comanda/`:
  - `ComandaService.ts`: novo método `selfCheckin({ tableNumber, restaurantId })` (sem `loggedUser` — rota pública, sem checagem de `CAN_MANAGE_COMANDAS`).
  - `ComandaController.ts`: novo método `selfCheckin(request, reply)`.
  - `src/shared/routes.ts`: registrar rota **sem** `preHandler: [verifyToken]` (diferente das rotas de comanda existentes, que são todas protegidas), com rate limit dedicado:
    ```ts
    fastify.post(
      "/tables/:tableNumber/comandas/self-checkin",
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, schema: { tags: ["Comanda"], summary: "Self-service check-in (public, no auth)" } },
      async (request, reply) => comandaController.selfCheckin(request, reply)
    )
    ```

---

## 5) Novo endpoint público — `GET /orders/track/:id`

Permite à tela "Acompanhar Pedido" do cardápio digital fazer polling do status de um pedido específico, sem autenticação.

- **Acesso:** público. O controle de acesso é o próprio `id` ser um ObjectId não-adivinhável (mesmo padrão de segurança "by design" já usado para o resto do fluxo público de pedidos).
- **Resposta (200):** subconjunto de campos do pedido — **não** retornar dados de outros pedidos nem informações do restaurante:
  ```json
  {
    "statusCode": 200,
    "response": {
      "id": "...",
      "orderNumber": "1042",
      "status": "PREPARING",
      "orderedAt": "...",
      "preparedAt": null,
      "deliveredAt": null,
      "finishedAt": null,
      "canceledAt": null,
      "totalValue": 89.9,
      "items": [{ "id": "...", "quantity": 2, "product": { "name": "...", "imageUrl": "..." } }]
    }
  }
  ```
- **Erros:** `404` se o pedido não existir.
- **Sugestão de uso no front:** polling a cada 8-10 segundos enquanto a tela estiver aberta.
- **Arquivos a alterar:** novo método em `GetOrdersService.ts` (ou um `GetOrderByIdController.ts` dedicado, seguindo o padrão de `GetDeliveryOrdersController.ts`) + registro em `routes.ts`, **sem** `preHandler: [verifyToken]`.

---

## 6) `GET /delivery-zones` deve ficar público (ou equivalente)

Hoje a rota exige `preHandler: [verifyToken]` (qualquer usuário autenticado). O cardápio digital precisa listar as zonas de entrega disponíveis **sem login** para o cliente escolher a sua no checkout de delivery.

Duas opções (escolher a que for mais simples de implementar):

- **(a)** Remover `verifyToken` de `GET /delivery-zones` e exigir `restaurantId` via query param (mesmo padrão de `GET /categories`/`GET /products`), retornando apenas zonas `isActive: true` quando a requisição for anônima.
- **(b)** Criar uma rota pública dedicada, ex. `GET /restaurants/:restaurantId/delivery-zones/active`, mantendo a rota protegida atual intacta para o admin.

Recomendação: opção (a), por consistência com o padrão já usado em categorias/produtos.

---

## 7) Nice-to-have (não obrigatório para o MVP)

`GET /comandas/:comandaId/orders` (público, escopado pela própria comanda) — lista todos os pedidos já feitos para aquela comanda. Útil quando várias pessoas na mesma mesa usam o cardápio digital em paralelo e querem ver o que já foi pedido pelo grupo, não só pelo próprio celular. Pode ficar como próximo passo; o MVP do frontend resolve isso localmente (guarda os `orderId`s criados pela própria sessão em `localStorage`).

---

## 8) Próximos passos recomendados (fora do escopo do MVP)

- **Tempo real:** hoje só há polling. Avaliar WebSocket (ex. plugin `@fastify/websocket`) ou SSE para push de mudança de status de pedido, reduzindo carga de polling quando o cardápio digital tiver tração.
- **Auto-incremento de número de comanda:** se o self-checkin se tornar o caminho dominante de abertura de comanda (não só staff), vale revisitar o modelo `Comanda.number` para um contador atômico por restaurante em vez de heurística de "maior número usado".
- **Endpoint de descoberta dinâmica por QR:** não é necessário no backend — o frontend já resolve via URL (`/r/:restaurantId/mesa/:tableNumber`), mas se no futuro o QR só tiver um código curto (não o `restaurantId` completo), seria necessário um endpoint de resolução de código → `restaurantId`/`tableNumber`.

---

## 9) Resumo de arquivos a criar/alterar

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | `Comanda.openedById` opcional + novo enum/campo `openedBy`; `Restaurant.domain` (único, opcional) |
| `src/modules/restaurant/GetRestaurantController.ts` / `Service.ts` | novo método de busca pública por `id` e por `domain` |
| `src/server.ts` | CORS precisa validar contra `domain`s cadastrados dinamicamente, não só a lista fixa de `CORS_ORIGIN` |
| `src/modules/comanda/ComandaService.ts` | novo método `selfCheckin` |
| `src/modules/comanda/ComandaController.ts` | novo método `selfCheckin` |
| `src/modules/order/GetOrdersService.ts` (ou novo arquivo) | novo método de busca pública por `id` (`track`) |
| `src/modules/deliveryZone/DeliveryZoneController.ts` / `Service.ts` | remover/ajustar exigência de auth em `GET /delivery-zones` |
| `src/shared/routes.ts` | registrar as 3 rotas novas públicas + ajustar a de delivery-zones |
