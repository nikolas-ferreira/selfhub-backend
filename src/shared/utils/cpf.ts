/** Strips everything but digits — the only format `Customer.cpf`/`phone` are ever stored in. */
export function onlyDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/**
 * Validates a CPF's check digits (standard Receita Federal algorithm). Expects
 * `cpf` already normalized to digits-only (see {@link onlyDigits}). Rejects the
 * well-known all-same-digit values (e.g. "00000000000"), which pass the checksum
 * but are never real CPFs.
 */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);

  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += digits[i] * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}
