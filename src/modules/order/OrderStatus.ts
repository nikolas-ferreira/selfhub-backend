/** Mirrors the `OrderStatus` enum in `prisma/schema.prisma`. Keep both in sync. */
export enum OrderStatus {
  CREATED = 'CREATED',
  PREPARING = 'PREPARING',
  COMING = 'COMING',
  IN_ROUTE = 'IN_ROUTE',
  DELIVERED = 'DELIVERED',
  FINISHED = 'FINISHED',
  CANCELED = 'CANCELED',
}
