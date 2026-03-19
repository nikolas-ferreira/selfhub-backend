# Documentação Completa — Feature de Gestão de Delivery

## Visão Geral

Esta feature adiciona uma estrutura completa de gestão de delivery para o backend Node.js + Fastify + Prisma + TypeScript com foco em:

- multi-tenant por restaurante (`restaurantId`)
- consistência histórica de pedidos
- validações de negócio para `DELIVERY`
- gestão de bairros/zonas de entrega
- base para evolução (múltiplas taxas/cupom de frete)

## Escopo Implementado

### 1) Modelagem de dados (Prisma)

#### Novo enum: `OrderOrigin`

- `DELIVERY`
- `PICKUP`
- `LOCAL`

#### Alterações em `Order`

Campos novos:

- `origin: OrderOrigin` (default `LOCAL`)
- `address: Json?`
- `deliveryFee: Float?` (snapshot)
- `estimatedDeliveryTime: Int?` (snapshot)
- `deliveryZoneId: String?`
- `deliveryZone: DeliveryZone?` (relation)
- índice: `@@index([origin])`

#### Nova tabela/model: `DeliveryZone`

Campos:

- `id`
- `name` (nome do bairro/zona)
- `deliveryFee` (`Float`)
- `estimatedTime` (`Int?`)
- `isActive` (`Boolean`, default `true`)
- `restaurantId` (FK lógica para restaurante)
- `lastEditedBy`
- `createdAt`
- `updatedAt`
- `orders` (relation)

Restrições:

- `@@unique([restaurantId, name])` (não permite bairro duplicado no mesmo restaurante)
- `@@index([restaurantId, isActive])`

#### Alteração em `Restaurant`

- relação adicionada: `deliveryZones DeliveryZone[]`

---

### 2) Regras de negócio aplicadas

## Regras para criação de pedido

- `origin` é opcional no payload, mas defaulta para `LOCAL`.
- Se `origin = DELIVERY`:
  - `deliveryZoneId` é obrigatório
  - `address` é obrigatório
  - a zona precisa existir, ser ativa e pertencer ao `restaurantId` do pedido
  - `deliveryFee` do pedido é copiado da zona (snapshot)
  - `estimatedDeliveryTime` do pedido é copiado da zona (snapshot)
- Se `origin != DELIVERY`:
  - `deliveryZoneId` não pode ser enviado
  - `deliveryFee` e `estimatedDeliveryTime` permanecem `null`

## Regras para zonas de entrega

- Apenas `ADMIN` e `MANAGER` podem criar/editar/deletar
- `name` obrigatório
- `deliveryFee >= 0`
- bairro não pode duplicar no mesmo restaurante
- operações sempre filtradas por `restaurantId` do usuário autenticado
- `DELETE` é soft delete (`isActive = false`)
- se zona já estiver em pedidos, também é desativada (histórico preservado)

## Consistência histórica

- alterações futuras na zona não alteram `deliveryFee` e `estimatedDeliveryTime` de pedidos antigos (snapshot)
- pedidos antigos continuam válidos mesmo com zona desativada

---

### 3) Endpoints adicionados/alterados

## Delivery Zones

### `POST /delivery-zones`
Cria zona de entrega para o restaurante do usuário autenticado.

Permissão: `ADMIN`, `MANAGER`

Body:

```json
{
  "name": "Centro",
  "deliveryFee": 8.5,
  "estimatedTime": 35
}
```

Respostas esperadas:

- `201` sucesso
- `400` validação (`name` ausente, taxa negativa)
- `403` sem permissão
- `409` duplicidade de bairro

### `GET /delivery-zones`
Lista zonas do restaurante do usuário.

Permissão: usuário autenticado

Respostas esperadas:

- `200` sucesso

### `PUT /delivery-zones/:id`
Atualiza zona de entrega do restaurante do usuário.

Permissão: `ADMIN`, `MANAGER`

Body (parcial):

```json
{
  "name": "Centro Expandido",
  "deliveryFee": 10,
  "estimatedTime": 40
}
```

Respostas esperadas:

- `200` sucesso
- `400` taxa negativa
- `403` sem permissão
- `404` zona não encontrada/no escopo
- `409` duplicidade de bairro

### `DELETE /delivery-zones/:id`
Desativa zona (`isActive = false`).

Permissão: `ADMIN`, `MANAGER`

Respostas esperadas:

- `200` zona desativada
- `403` sem permissão
- `404` zona não encontrada/no escopo

## Orders

### `POST /orders` (alterado)
Agora aceita campos de delivery.

Body exemplo delivery:

```json
{
  "orderNumber": 1001,
  "tableNumber": 0,
  "waiterNumber": 0,
  "paymentMethod": "PIX",
  "totalValue": 89.9,
  "restaurantId": "<restaurantId>",
  "origin": "DELIVERY",
  "deliveryZoneId": "<zoneId>",
  "address": {
    "street": "Rua A",
    "number": "123",
    "district": "Centro",
    "city": "São Paulo",
    "state": "SP",
    "zipCode": "01000-000",
    "complement": "Apto 12",
    "reference": "Próximo à praça"
  },
  "items": [
    {
      "productId": "<productId>",
      "quantity": 1,
      "observation": "Sem cebola",
      "ratingStar": 0,
      "imageUrl": "https://...",
      "customizationOptions": []
    }
  ]
}
```

Respostas esperadas:

- `201` sucesso
- `400` validações de delivery

### `GET /orders` (alterado)
Agora suporta filtro por origem:

- `GET /orders?origin=DELIVERY`
- `GET /orders?origin=PICKUP`
- `GET /orders?origin=LOCAL`

Permissão: `ADMIN`, `MANAGER`

Respostas esperadas:

- `200` sucesso
- `400` origin inválido
- `403` sem permissão

### `GET /orders/delivery` (novo)
Lista apenas pedidos com `origin = DELIVERY` do restaurante autenticado, ordenados por mais recente.

Permissão: `ADMIN`, `MANAGER`

Respostas esperadas:

- `200` sucesso
- `403` sem permissão

---

### 4) Contrato de resposta

Padrão mantido:

```json
{
  "statusCode": 200,
  "response": {},
  "message": "..."
}
```

ou erro:

```json
{
  "statusCode": 400,
  "response": null,
  "message": "..."
}
```

---

### 5) Permissões e segurança multi-tenant

- Rotas de gestão de zonas: apenas `ADMIN` e `MANAGER`
- Rotas de listagem de pedidos já exigem `ADMIN` e `MANAGER`
- `restaurantId` é sempre aplicado no filtro para impedir acesso cruzado entre restaurantes

---

### 6) Casos de erro cobertos

- criar pedido `DELIVERY` sem `deliveryZoneId`
- criar pedido `DELIVERY` sem `address`
- zona inexistente
- zona de outro restaurante
- zona inativa
- taxa negativa em zona
- bairro duplicado no mesmo restaurante
- filtro `origin` inválido em `GET /orders`

---

### 7) Arquivos alterados e propósito

- `prisma/schema.prisma`
  - novos enums/campos/models para delivery
- `src/modules/order/CreateOrderService.ts`
  - validações e snapshot de delivery no pedido
- `src/modules/order/CreateOrderController.ts`
  - retorno 400 para erros de validação
- `src/modules/order/GetOrdersService.ts`
  - filtro por origem e retorno de campos de delivery
- `src/modules/order/GetOrdersController.ts`
  - validação de query `origin`
- `src/modules/order/GetDeliveryOrdersController.ts`
  - endpoint para pedidos delivery
- `src/modules/order/orderTypes.ts`
  - tipos de `OrderOrigin` e `AddressInput`
- `src/modules/deliveryZone/DeliveryZoneService.ts`
  - regras de CRUD e permissões
- `src/modules/deliveryZone/DeliveryZoneController.ts`
  - camada HTTP para delivery zones
- `src/shared/routes.ts`
  - registro das novas rotas

---

### 8) Migração e observações operacionais

- Foi tentado: `npx prisma migrate dev --name add_delivery_feature`
- Para provider `mongodb`, o Prisma não suporta `migrate dev`
- Fluxo válido usado: `prisma validate` + `prisma generate`

Para aplicar alterações de schema em MongoDB no ambiente real, usar `prisma db push` com cuidado operacional.

---

### 9) Próximos passos recomendados

- Criar testes automatizados (unitários + integração) cobrindo validações críticas
- Adicionar paginação em `GET /orders` e `GET /delivery-zones`
- Evoluir `address` para schema validado por DTO/zod
- Introduzir histórico de alterações de zonas (`audit trail`)
- Preparar módulo de regras de frete avançadas (faixa de distância, cupom, frete grátis)
