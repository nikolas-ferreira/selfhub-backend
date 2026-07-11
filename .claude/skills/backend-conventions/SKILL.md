---
name: backend-conventions
description: Convenções obrigatórias de arquitetura, autenticação e tratamento de erros do selfhub-backend (Fastify + Prisma + MongoDB). Use esta skill sempre que for escrever, revisar ou alterar qualquer código sob `src/` neste repositório — rotas, controllers, services, validação de entrada, ou qualquer coisa que toque autenticação/autorização/dados de outro tenant. O conteúdo completo e o racional de cada regra estão em `docs/RFC-001-architecture.md`; esta skill resume o que é necessário pra escrever código correto sem reler o RFC inteiro toda vez.
---

# Convenções do selfhub-backend

Este projeto tem um RFC interno (`docs/RFC-001-architecture.md`) resultado de uma auditoria de segurança e arquitetura (2026-06-21). Ele existe porque features anteriores reinventaram cada uma sua própria forma de validar, autorizar e responder — o objetivo agora é parar de repetir esses erros. Sempre que estiver mexendo em código de rota/controller/service, siga o resumo abaixo; para o racional completo, exemplos e as duas pegadinhas documentadas (Mongo `null` em filtro, CORS preflight 404), leia `docs/RFC-001-architecture.md` diretamente.

## Camadas

```
routes.ts → Controller → Service → Prisma
```

Controller só toca `FastifyRequest`/`FastifyReply` (parse de `body`/`params`/`query`, chama o Service, traduz o resultado em `reply.status().send()`). Nunca chama Prisma direto nem contém regra de negócio. Service tem toda a regra de negócio e toda chamada ao Prisma, não conhece Fastify.

(`GetCategoriesController`, `GetProductsController`, `GetRestaurantController` quebram essa regra hoje — é dívida técnica conhecida, não copie esse padrão em código novo.)

## Autenticação e autorização

- Rota autenticada = `preHandler: [verifyToken]`, que popula `request.user = { id, role, restaurantId }`. Nunca confie em `restaurantId`/`role` vindos do `body`/`query`.
- Toda query/mutação que toca dado específico de um tenant filtra por `restaurantId: loggedUser.restaurantId` (direto ou via relação). Recurso de outro tenant retorna 404, nunca 403 — não revelar que o recurso existe.
- Hierarquia de papel: `WAITER < MANAGER < ADMIN`. WAITER só lê o próprio escopo. MANAGER gerencia catálogo/pedidos do restaurante e só edita perfis `WAITER`. ADMIN tem acesso total dentro do restaurante — nunca entre restaurantes.
- Registro público (`/auth/register`) nunca aceita `role` do cliente — sempre cria `WAITER`. Promoção de papel é sempre uma ação autenticada via `PUT /profile/:id`.
- Nova feature de emissão de token usa `issueTokenPair`/`hashRefreshToken` de `src/modules/auth/issueTokens.ts` — não assine JWT nem gere token na mão.

## Contrato de resposta

Toda resposta (sucesso ou erro) usa o envelope `{ statusCode, response, message }` via os helpers de `src/shared/utils/httpResponse.ts` (`successResponse`, `badRequest`, `unauthorized`, `notFound`, `internalError`, `errorResponse`). Nunca devolva uma entidade crua sem envelope.

## Tratamento de erros

- Erro operacional (`statusCode < 500`): `message` pode ir literal ao cliente.
- Erro inesperado (`statusCode >= 500`): nunca exponha `error.message`/stack — use `respondInternalError(request, reply, error, "<mensagem pública>")` (já loga estruturado com `errorId` e devolve `errorId` na resposta).
- Dentro de um Service, erro operacional é `throw { statusCode: 404, message: "..." }` — deixe subir sem capturar; o controller loga com contexto via `respondInternalError`.
- Nunca `console.log`/`console.error` em código de request — use `request.log.error(...)`. `console.*` só é aceitável em diagnóstico de boot (ex.: `src/shared/env.ts`).

## Validação de entrada

- Não há zod/joi ainda — validação manual no início do Service: presença/tipo de campo obrigatório, formato de `ObjectId` antes de passar ao Prisma, listas não-vazias com cada elemento validado.
- **Nunca confie em preço/valor total vindo do cliente** — recalcule sempre a partir do catálogo (`Product.price`, etc.).

## Checklist antes de abrir/aceitar um PR

- [ ] Rota nova decide explicitamente: pública ou `preHandler: [verifyToken]`?
- [ ] Toda query/mutação filtrada por `restaurantId` do usuário autenticado?
- [ ] Resposta usa o envelope via `httpResponse.ts`?
- [ ] Nenhum erro 500 expõe `error.message`/stack?
- [ ] `catch` de erro inesperado usa `respondInternalError(...)`?
- [ ] Nenhum valor monetário aceito do cliente sem recálculo contra o catálogo?
- [ ] Checagem de papel segue `WAITER < MANAGER < ADMIN`?
- [ ] Campo opcional que será filtrado depois como `campo: null` foi escrito explicitamente como `null` no `create()`? (ver RFC §6.1 — omitir o campo faz o filtro não casar, silenciosamente)

Para o detalhe de cada pegadinha (Mongo, CORS) e a lista de dívida técnica conhecida (§7), leia `docs/RFC-001-architecture.md`.
