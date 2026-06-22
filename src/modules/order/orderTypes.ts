/** Mirrors the `OrderOrigin` enum in `prisma/schema.prisma`. */
export type OrderOrigin = "DELIVERY" | "PICKUP" | "LOCAL";

/** Free-form delivery address snapshot stored as JSON on the order. Required when `origin === "DELIVERY"`. */
export interface AddressInput {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  complement?: string;
  reference?: string;
}
