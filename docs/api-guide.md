# Guia de Integração da API — selfhub-backend

Documento de referência para times de frontend integrarem com este backend. Cobre autenticação de ponta a ponta, todos os endpoints existentes, formatos de request/response, e as particularidades reais de comportamento (inclusive inconsistências conhecidas) que afetam como o cliente deve tratar as respostas.

> Convenção: nesta documentação, "papel"/"role" segue a hierarquia `WAITER < MANAGER < ADMIN`. "Mesmo restaurante" significa que toda operação autenticada é sempre restrita ao `restaurantId` do usuário logado — nunca é possível um usuário acessar/alterar dados de outro restaurante.

---

## 1) Visão geral

- **Base URL**: configurada por ambiente (local: `http://localhost:3333`; produção: a URL do Render).
- **Content-Type**: todo body de request é `application/json`.
- **Documentação interativa**: a API expõe Swagger UI em `GET /docs` (útil para testar endpoints manualmente, mas os `schema` registrados nas rotas hoje só descrevem `tags`/`summary` — não validam o body, então confie neste documento para os formatos exatos).
- **Rate limiting**: globalmente 100 requisições/minuto por IP; rotas de `/auth/*` e `POST /orders` têm limites mais restritos (ver tabela de endpoints). Ao bater o limite, a resposta é `429` (padrão do `@fastify/rate-limit`, fora do envelope abaixo).

### Envelope de resposta padrão

**Quase todas** as respostas (sucesso e erro) seguem este formato:

```json
{
  "statusCode": 200,
  "response": { /* payload ou null */ },
  "message": "..."
}
```

⚠️ **Atenção — leia antes de integrar**: existem inconsistências reais no campo `statusCode` do corpo vs. o status code HTTP de fato retornado, e algumas respostas omitem `message`. **Trate sempre o status HTTP real da resposta (`response.status` no fetch/axios) como fonte da verdade, nunca o campo `body.statusCode`.** Detalhes por endpoint na tabela abaixo; resumo dos casos problemáticos na seção 8.

---

## 2) Autenticação — fluxo completo

### 2.1 Modelo de tokens

Desde 2026-06-22, o login (e o refresh) retornam **dois tokens**:

| Token | Tipo | Duração | Uso |
|---|---|---|---|
| `token` | JWT | **10 minutos** | Enviado em `Authorization: Bearer <token>` em toda rota protegida. |
| `refreshToken` | string opaca (não é JWT) | **6 horas** | Usado só em `POST /auth/refresh-token` para obter um novo par de tokens. Nunca enviado em outra rota. |

O JWT (`token`) carrega `{ id, role, restaurantId }` — é o que toda rota autenticada decodifica para popular o usuário logado. **Não tente decodificar o `refreshToken`** — ele não é um JWT, é só uma string aleatória opaca.

### 2.2 Fluxo de login

```
POST /auth/login
Body: { "email": "...", "password": "..." }

200 OK
{
  "statusCode": 200,
  "response": {
    "token": "eyJhbGci...",
    "tokenExpiresIn": 600,
    "refreshToken": "a1b2c3...",
    "refreshTokenExpiresIn": 21600,
    "user": {
      "id": "...",
      "name": "...",
      "email": "...",
      "role": "ADMIN" | "MANAGER" | "WAITER",
      "restaurantId": "..."
    }
  },
  "message": "Login successful"
}
```

`tokenExpiresIn`/`refreshTokenExpiresIn` estão em **segundos** — use para calcular quando renovar, em vez de decodificar o JWT manualmente.

Erros possíveis: `404` (`"User not found"`), `401` (`"Invalid password"`).

### 2.3 Renovando o access token (`POST /auth/refresh-token`)

Quando o `token` (JWT) expira, qualquer rota protegida responde `401 { "message": "Invalid token" }`. Nesse momento, o frontend deve chamar:

```
POST /auth/refresh-token
Body: { "refreshToken": "<o refreshToken guardado no login>" }

200 OK
{
  "statusCode": 200,
  "response": {
    "token": "<novo JWT>",
    "tokenExpiresIn": 600,
    "refreshToken": "<novo refreshToken>",
    "refreshTokenExpiresIn": 21600,
    "user": { ... }
  },
  "message": "Token refreshed successfully"
}
```

**Pontos críticos para a implementação do frontend:**

1. **O `refreshToken` antigo é invalidado a cada uso (rotação).** A resposta sempre traz um `refreshToken` novo — substitua o salvo localmente (ex.: `localStorage`/cookie seguro) a cada chamada. Nunca reutilize um `refreshToken` já usado.
2. **Detecção de reuso**: se você (acidentalmente, por bug de concorrência, ou por um token vazado) enviar um `refreshToken` que já foi usado antes, a resposta é `401 { "message": "Refresh token already used" }` **e todos os refresh tokens daquele usuário são invalidados no servidor** — a única saída é fazer login novamente. Implicação prática: **nunca dispare duas chamadas de refresh em paralelo** (ex.: duas abas, duas requisições simultâneas que expiraram ao mesmo tempo). Use um mutex/fila no cliente (ver exemplo de código na seção 9).
3. Trocar a própria senha (`PUT /profile/:id`) **revoga todos os refresh tokens ativos** daquele usuário — depois de mudar a senha, o usuário precisa logar de novo em todos os dispositivos/abas.
4. Não existe ainda endpoint de logout/revogação manual — fechar a sessão no frontend hoje significa só descartar os tokens localmente (o `refreshToken` continua válido no servidor até expirar ou ser usado).

Erros possíveis: `400` (`"refreshToken is required"`), `401` (`"Invalid refresh token"`, `"Refresh token expired"`, `"Refresh token already used"`).

### 2.4 Registro de novo usuário (`POST /auth/register`)

Rota **pública**. Sempre cria um usuário com papel `WAITER` — **não é possível** criar um `MANAGER`/`ADMIN` por aqui, mesmo enviando `role` no body (o campo é ignorado).

```
POST /auth/register
Body: {
  "name": "...",
  "lastname": "...",
  "email": "...",
  "password": "...",
  "restaurantId": "<ObjectId de um restaurante já existente>"
}

200 OK
{
  "statusCode": 200,
  "response": {
    "user": { "id": "...", "name": "...", "email": "...", "role": "WAITER" }
  },
  "message": "User registered successfully"
}
```

Erros: `400` (`"Invalid restaurantId"` — formato inválido), `404` (`"Restaurant not found"`), `409` (`"Email is already in use"`).

**Promoção a MANAGER/ADMIN**: só é possível via `PUT /profile/:id`, feito por um `ADMIN` autenticado (ver seção 5). Não há nenhum fluxo de "criar o primeiro admin" automatizado — isso precisa ser feito manualmente (seed/migration) na criação de um novo restaurante.

### 2.5 Pareamento de dispositivo (`POST /auth/associate-device`)

Rota pública, usada para pareamento de totens/terminais físicos via CNPJ do restaurante.

```
POST /auth/associate-device
Body: { "macAddress": "AA:BB:CC:DD:EE:FF", "restaurantCnpj": "11.222.333/0001-81" }
```

(CNPJ pode vir formatado ou só dígitos — o backend sanitiza removendo tudo que não é número.)

```
200 OK
{
  "statusCode": 200,
  "response": { "id": "...", "name": "...", "cnpj": "...", "created_at": "..." },
  "message": "Device associated successfully"
}
```

Se o `macAddress` já estiver associado a **este mesmo** restaurante, retorna `200` com a mensagem `"mac address already associated to this cnpj"` (idempotente). Se estiver associado a **outro** restaurante, retorna `402` (sim, "Payment Required" — reaproveitado aqui só como um código de erro distinto, não tem relação com pagamento) com `"mac address already associated to another cnpj"`. Se o CNPJ não existir, `404`.

### 2.6 Usando o access token

Toda rota protegida exige o header:

```
Authorization: Bearer <token>
```

Se o header estiver ausente ou malformado: `401 { "message": "Token not provided" }`.
Se o JWT for inválido ou **expirado**: `401 { "message": "Invalid token" }` — é o sinal para o frontend disparar o fluxo de refresh (seção 2.3) e repetir a requisição original.

---

## 3) Papéis e autorização

```
WAITER  <  MANAGER  <  ADMIN
```

Regras gerais (variam um pouco por endpoint — está detalhado na tabela da seção 4):

- **WAITER**: acesso de leitura/operação básica (criar pedidos, listar catálogo). Não pode criar/editar categorias, produtos ou zonas de entrega. Não pode editar outros usuários nem o próprio papel.
- **MANAGER**: pode gerenciar catálogo (categorias/produtos), zonas de entrega, listar/atualizar pedidos, ver insights. Pode editar outros perfis **somente se o perfil-alvo for `WAITER`**.
- **ADMIN**: acesso total dentro do próprio restaurante, incluindo criar novos restaurantes (`POST /restaurant`) e promover/editar qualquer perfil do mesmo restaurante.

⚠️ **Quirk de status code**: quando o backend nega uma ação por falta de permissão, a maioria dos endpoints retorna **`401`** (não `403`) com mensagens como `"Only MANAGER or ADMIN can create categories"`. Alguns poucos endpoints (criação de restaurante, criação/edição/exclusão de zona de entrega, listagem de pedidos, edição de status de pedido) retornam `403`. **Não assuma que `401` sempre significa "token inválido/expirado" — pode ser "permissão insuficiente" mesmo com token válido.** Diferencie pela mensagem, não só pelo código.

---

## 4) Referência completa de endpoints

Legenda de autenticação: 🔓 público · 🔒 requer `Authorization: Bearer <token>` · papel mínimo entre parênteses quando houver restrição.

### Auth

| Método | Rota | Auth | Rate limit | Descrição |
|---|---|---|---|---|
| POST | `/auth/register` | 🔓 | 10/min | Cria usuário `WAITER`. |
| POST | `/auth/login` | 🔓 | 10/min | Retorna par de tokens. |
| POST | `/auth/refresh-token` | 🔓 (mas exige refresh token válido) | 10/min | Renova o par de tokens. |
| POST | `/auth/associate-device` | 🔓 | 10/min | Pareia dispositivo/totem a um restaurante. |

(Detalhes completos na seção 2.)

### Restaurant

| Método | Rota | Auth | Body | Resposta (200/201) | Erros |
|---|---|---|---|---|---|
| GET | `/restaurant/:cnpj` | 🔓 | — | `{ response: { id, name, cnpj, created_at } }` | `400` cnpj inválido/ausente, `404` não encontrado |
| POST | `/restaurant` | 🔒 (ADMIN) | `{ name, cnpj }` | HTTP **201**; `response`: objeto do restaurante criado | `403` se não for ADMIN, `400` nome/cnpj inválido (cnpj precisa ter 14 dígitos) |

> ⚠️ Em `POST /restaurant`, o HTTP status é `201` mas o campo `body.statusCode` vem `200` (bug de serialização conhecido — ver seção 8). Use o status HTTP real.

### Profile

| Método | Rota | Auth | Body | Resposta | Erros |
|---|---|---|---|---|---|
| PUT | `/profile/:id` | 🔒 | `{ name?, lastname?, email?, password?, role? }` (todos opcionais) | `{ response: { id, name, lastname, email, role } }` | `401` sem permissão / fora do restaurante, `500` *(sic)* se o perfil não existir — ver seção 8 |

Regras de autorização (detalhe):
- Qualquer perfil pode editar a si mesmo (exceto o próprio `role`).
- `WAITER` não pode editar **nenhum** outro perfil.
- `MANAGER` só pode editar outro perfil se o papel atual dele for `WAITER`.
- `ADMIN` pode editar qualquer perfil do mesmo restaurante.
- Trocar `role`: `WAITER` nunca pode; `MANAGER` só pode mexer em alvos `WAITER` (na prática, não promove ninguém); `ADMIN` pode setar qualquer `role`.
- **Trocar a própria senha invalida todos os refresh tokens ativos** (ver seção 2.3).

### Category

| Método | Rota | Auth | Body / Query | Resposta | Erros |
|---|---|---|---|---|---|
| GET | `/categories` | 🔓 | query `?restaurantId=<id>` (obrigatório) | `{ response: [Category, ...] }` | `400` sem `restaurantId` |
| POST | `/categories` | 🔒 (MANAGER/ADMIN) | `{ name, iconUrl }` | HTTP 201; `{ response: Category }` | `401` se WAITER |
| PUT | `/categories/:id` | 🔒 (MANAGER/ADMIN) | `{ name?, iconUrl? }` | `{ response: Category }` | `401` se WAITER, `404` não encontrada/de outro restaurante |

**Objeto `Category`**: `{ id, name, iconUrl, createdAt, updatedAt, restaurantId, lastEditedById }`.

### Product

| Método | Rota | Auth | Body / Query | Resposta | Erros |
|---|---|---|---|---|---|
| GET | `/products` | 🔓 | query `?categoryId=<id>` **ou** `?restaurantId=<id>` (pelo menos um) | `{ response: [Product, ...] }` (com `customizationGroups.options` incluídos) | `400` sem nenhum filtro |
| POST | `/products` | 🔒 (MANAGER/ADMIN) | ver abaixo | HTTP 201; `{ response: Product }` | `401` se WAITER, `404` categoria não encontrada |
| PUT | `/products/:id` | 🔒 (MANAGER/ADMIN) | ver abaixo (tudo opcional) | `{ response: Product }` ⚠️ ver nota | `401` se WAITER, `404` produto/categoria não encontrada |

Body de criação/edição de produto:

```json
{
  "name": "Hambúrguer Especial",
  "price": 32.9,
  "imageUrl": "https://...",
  "description": "...",
  "categoryId": "<ObjectId>",
  "customizationGroups": [
    {
      "name": "Ponto da carne",
      "min": 1,
      "max": 1,
      "options": [
        { "name": "Mal passado", "price": 0 },
        { "name": "Bem passado", "price": 0 }
      ]
    }
  ]
}
```

⚠️ **Em `PUT /products/:id`**: enviar `customizationGroups` **substitui todos** os grupos/opções existentes do produto (não faz merge — apaga tudo e recria do zero). Se você quer manter um grupo existente, ele precisa vir incluído no array enviado.

⚠️ **A resposta de `PUT /products/:id` não inclui `customizationGroups` no objeto retornado**, mesmo quando você os atualizou no mesmo request — é um efeito colateral de como o endpoint busca o produto atualizado internamente. Depois de editar customizações, refaça um `GET /products?categoryId=...` para ver o estado atualizado.

**Objeto `Product`**: `{ id, name, price, imageUrl, description, createdAt, updatedAt, categoryId, createdById, lastEditedById, customizationGroups: [{ id, name, min, max, options: [{ id, name, price }] }] }` (campo `customizationGroups` presente em `GET`/`POST`, ausente em `PUT`, conforme nota acima).

### Order

| Método | Rota | Auth | Body / Query | Resposta | Erros |
|---|---|---|---|---|---|
| POST | `/orders` | 🔓 (rate limit 20/min) | ver abaixo | HTTP 201; `{ response: Order }` | `400` com mensagem específica de validação |
| GET | `/orders` | 🔒 (ADMIN/MANAGER) | query `?productId=<id>&origin=DELIVERY\|PICKUP\|LOCAL` (ambos opcionais) | `{ response: [Order, ...] }` *(sem `message`)* | `403` outro papel, `401` contexto de usuário inválido, `400` filtro inválido |
| GET | `/orders/delivery` | 🔒 (ADMIN/MANAGER) | — | `{ response: [Order, ...] }` *(sem `message`)*, já filtrado por `origin=DELIVERY` | `403` outro papel |
| PATCH | `/orders/:id` | 🔒 (ADMIN/MANAGER) | `{ status: OrderStatus }` | `{ response: Order }` *(sem `message`)* | `403` outro papel, `400` status inválido / pedido não encontrado / pedido já em estado final |

**Body de `POST /orders`** (rota pública — pense em "pedido feito via QR code da mesa"):

```json
{
  "orderNumber": 1042,
  "tableNumber": 7,
  "waiterNumber": 3,
  "paymentMethod": "PIX",
  "totalValue": 999,
  "restaurantId": "<ObjectId>",
  "origin": "LOCAL",
  "items": [
    {
      "productId": "<ObjectId>",
      "quantity": 2,
      "observation": "sem cebola",
      "ratingStar": 0,
      "imageUrl": "https://...",
      "customizationOptions": [
        { "name": "Bacon extra", "additionalPrice": 5, "quantity": 1 }
      ]
    }
  ]
}
```

⚠️ **`totalValue` é ignorado pelo servidor.** O total real é sempre recalculado a partir do preço atual do produto no catálogo (`Product.price × quantity`, mais `customizationOptions[].additionalPrice × quantity`). Envie o valor que quiser nesse campo (ou omita) — ele nunca é usado para gravar o pedido. Isso é intencional (proteção contra manipulação de preço), não um bug a reportar.

`origin` é opcional, default `"LOCAL"`. Valores: `"LOCAL"` | `"PICKUP"` | `"DELIVERY"`.

Se `origin: "DELIVERY"`, **passam a ser obrigatórios**:
```json
{
  "deliveryZoneId": "<ObjectId de uma DeliveryZone ativa deste restaurante>",
  "address": {
    "street": "...", "number": "...", "district": "...",
    "city": "...", "state": "...", "zipCode": "...",
    "complement": "opcional", "reference": "opcional"
  }
}
```
O `deliveryFee`/tempo estimado do pedido são copiados (snapshot) da zona no momento da criação — mudanças futuras na zona não alteram pedidos antigos. Se `origin` **não** for `"DELIVERY"`, `deliveryZoneId` não pode ser enviado.

**Objeto `Order`** (como retornado por `GET /orders`/`GET /orders/delivery`):
```ts
{
  id: string
  orderNumber: string         // sempre string, mesmo que enviado como number
  status: "CREATED" | "PREPARING" | "COMING" | "IN_ROUTE" | "DELIVERED" | "FINISHED" | "CANCELED"
  origin: "LOCAL" | "PICKUP" | "DELIVERY"
  orderedAt: string  // ISO datetime
  preparedAt: string | null
  deliveredAt: string | null
  finishedAt: string | null
  canceledAt: string | null
  tableNumber: string          // sempre string
  waiterNumber: string         // sempre string
  address: object | null
  deliveryFee: number | null
  estimatedDeliveryTime: number | null
  totalValue: number
  paymentMethod: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "MONEY" | "UNKNOWN"
  deliveryZone: { id, name, estimatedTime } | null
  items: [{
    id: string
    quantity: number
    observation: string | null
    ratingStar: number | null
    product: { id, name, price, imageUrl }
  }]
}
```

**`PATCH /orders/:id`** — body `{ "status": "PREPARING" }`. Valores aceitos: `CREATED`, `PREPARING`, `COMING`, `IN_ROUTE`, `DELIVERED`, `FINISHED`, `CANCELED`. Uma vez em `FINISHED` ou `CANCELED`, o pedido não aceita mais nenhuma transição (erro `400`: `"Order is already FINISHED and cannot be updated"`). Não há validação de máquina de estados além disso — é possível ir, por exemplo, de `CREATED` direto para `DELIVERED`.

### Delivery Zone

| Método | Rota | Auth | Body | Resposta | Erros |
|---|---|---|---|---|---|
| GET | `/delivery-zones` | 🔒 (qualquer papel) | — | `{ response: [DeliveryZone, ...] }` *(sem `message`)* — inclui zonas inativas | `401` sem token |
| POST | `/delivery-zones` | 🔒 (MANAGER/ADMIN) | `{ name, deliveryFee, estimatedTime? }` | HTTP 201; `{ response: DeliveryZone }` | `403` outro papel, `400` nome ausente/taxa negativa, `409` nome duplicado no restaurante |
| PUT | `/delivery-zones/:id` | 🔒 (MANAGER/ADMIN) | `{ name?, deliveryFee?, estimatedTime?\|null }` | `{ response: DeliveryZone }` | `403`, `404` não encontrada, `400` taxa negativa, `409` nome duplicado |
| DELETE | `/delivery-zones/:id` | 🔒 (MANAGER/ADMIN) | — | ver nota | `403`, `404` não encontrada |

**`DELETE /delivery-zones/:id`** tem dois comportamentos possíveis, dependendo se a zona já tem pedidos vinculados:
- **Com pedidos vinculados**: soft-delete — `{ response: DeliveryZone com isActive:false, message: "Delivery zone deactivated because it has related orders" }`.
- **Sem pedidos vinculados**: hard-delete — `{ response: null, message: "Delivery zone deleted successfully" }`.

**Objeto `DeliveryZone`**: `{ id, name, deliveryFee, estimatedTime, isActive, restaurantId, lastEditedBy, createdAt, updatedAt }`.

### Insights (IA)

| Método | Rota | Auth | Resposta | Erros |
|---|---|---|---|---|
| GET | `/insights/orders` | 🔒 (ADMIN/MANAGER) | `{ response: string[] }` ⚠️ ver nota | `403` outro papel, `500` (ex.: `OPENAI_API_KEY` ausente/inválida) |
| GET | `/insights/products` | 🔒 (ADMIN/MANAGER) | `{ response: [{ name: string, insights: string[] }] }` | `403`, `500` |

⚠️ **`GET /insights/orders` retorna só um array de strings** (`response.insights` do JSON gerado pela IA) — apesar do prompt interno pedir à OpenAI um objeto rico com `trendAnalysis`, `recommendations`, `keyMetrics` e `productPerformance`, **esses campos são descartados** pelo backend antes de responder. Se o frontend precisa desses outros campos, é necessário alterar `GetOrderInsightsService` para retornar o objeto completo em vez de só `parsed.insights`.

Essas rotas chamam a API da OpenAI de forma síncrona — espere latência de alguns segundos.

---

## 5) Enums (sincronizados com `prisma/schema.prisma`)

```ts
ProfileRole    = "ADMIN" | "MANAGER" | "WAITER"
OrderStatus    = "CREATED" | "PREPARING" | "COMING" | "IN_ROUTE" | "DELIVERED" | "FINISHED" | "CANCELED"
OrderOrigin    = "LOCAL" | "PICKUP" | "DELIVERY"
PaymentMethod  = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "MONEY" | "UNKNOWN"
```

---

## 6) CORS

O backend só aceita requisições cross-origin de domínios explicitamente listados na variável de ambiente `CORS_ORIGIN` (separados por vírgula). Se o domínio do seu frontend não estiver lá, **toda requisição com preflight `OPTIONS` falha com `404`** (não com um erro de CORS comum — é uma particularidade da lib usada, documentada em `docs/RFC-001-architecture.md` §7.1). Se a integração começar a falhar com 404 em `OPTIONS`, o primeiro lugar a checar é essa variável de ambiente no ambiente de deploy, não o código do frontend.

---

## 7) Multi-tenancy (restaurantId)

Praticamente toda operação autenticada é implicitamente restrita ao `restaurantId` do usuário logado (extraído do JWT, nunca do body/query). Tentar acessar/editar um recurso de outro restaurante resulta em `404` (não em `403`) — o backend não diferencia "não existe" de "existe mas não é seu", para não revelar a existência de dados de outro tenant.

Para o fluxo de **catálogo público** (sem login — ex.: cardápio digital via QR code de mesa), o `restaurantId` é descoberto via `GET /restaurant/:cnpj` e depois usado explicitamente como query param em `GET /categories`/`GET /products` e no body de `POST /orders`.

---

## 8) Quirks conhecidos — resumo para quem só quer a lista

1. **`statusCode` do body ≠ status HTTP real** em `POST /restaurant` e `POST /orders` (corpo diz `200`, HTTP real é `201`). Sempre confie no status HTTP.
2. **Permissão negada geralmente retorna `401`, não `403`** (exceções: criação de restaurante, CRUD de zona de entrega, listagem/edição de pedidos, que usam `403` corretamente).
3. **`PUT /profile/:id` com perfil inexistente retorna `500`**, não `404` (mensagem: `"Profile not found"`).
4. **Várias respostas de listagem não têm campo `message`** (`GET /orders`, `GET /orders/delivery`, `PATCH /orders/:id`, `GET /delivery-zones`). Não dependa de `message` estar sempre presente — sempre cheque `response`.
5. **`GET /insights/orders` retorna só `string[]`**, descartando a maior parte do que a IA gera (ver seção 4).
6. **`PUT /products/:id` não retorna `customizationGroups` no objeto de resposta**, mesmo após atualizá-los.
7. **`AssociateDeviceService` usa `402`** para "MAC já associado a outro CNPJ" — não é um erro de pagamento, é só um código reaproveitado.
8. Erros `500` reais (não os itens acima, que são `200`/`4xx` "errados") vêm com um campo extra `errorId` no body — útil para reportar bugs ao time de backend (eles conseguem buscar esse id direto no log do servidor).

---

## 9) Receita para o cliente HTTP do frontend

Pseudo-código (adapte para `fetch`/`axios`/`ky`, o que for usado no projeto):

```ts
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<void> | null = null; // evita refresh em paralelo

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (res.status === 401) {
    const body = await res.clone().json().catch(() => null);
    const isExpiredToken = body?.message === "Invalid token";

    if (isExpiredToken && refreshToken) {
      // Garante que só uma chamada de refresh está em voo por vez.
      refreshInFlight ??= doRefresh();
      await refreshInFlight;
      refreshInFlight = null;

      // repete a requisição original com o novo accessToken
      return apiFetch(path, options);
    }

    // 401 por permissão insuficiente ou refresh falhou: manda pra tela de login
    redirectToLogin();
  }

  return res;
}

async function doRefresh() {
  const res = await fetch(`${BASE_URL}/auth/refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // refreshToken inválido/expirado/já usado: sessão morta, login de novo
    accessToken = null;
    refreshToken = null;
    redirectToLogin();
    return;
  }

  const { response } = await res.json();
  accessToken = response.token;
  refreshToken = response.refreshToken; // SEMPRE atualize — token antigo foi invalidado
}
```

Pontos-chave reforçados pelo pseudo-código acima:
- Diferencie "token expirado" (`message === "Invalid token"`) de "sem permissão" (qualquer outro `401`) antes de decidir se vale tentar refresh.
- Nunca dispare duas chamadas de refresh simultâneas — use um lock/promise compartilhada.
- Sempre substitua **os dois tokens** após um refresh bem-sucedido.
