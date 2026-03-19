export type OrderOrigin = "DELIVERY" | "PICKUP" | "LOCAL";

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
