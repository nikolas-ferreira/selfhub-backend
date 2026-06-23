/**
 * Minimal client for Focus NFe's NFC-e API (chosen among Focus NFe/PlugNotas/
 * NFE.io per caixa-pdv-spec.md §4 — Focus NFe has the simplest REST surface).
 *
 * This only covers what the Caixa contract needs (issue + read status) and
 * is intentionally not wired into product data yet: real NFC-e issuance also
 * needs per-product fiscal fields (NCM, CFOP, tax situation) that don't
 * exist on `Product` today, plus the restaurant's digital certificate (A1)
 * and active Inscrição Estadual — see caixa-pdv-spec.md §4 and
 * caixa-backend-spec.md §"Pré-requisitos operacionais". Until those exist,
 * calls here fail fast with a clear error instead of emitting an invalid note.
 */

export interface FocusNfeItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface IssueNfceResult {
  providerInvoiceId: string;
  status: "ISSUED" | "PENDING";
  danfeUrl: string | null;
}

function isConfigured() {
  return Boolean(process.env.FOCUS_NFE_TOKEN);
}

/**
 * Issues an NFC-e for a paid `Bill`.
 * @throws {Error} if the provider isn't configured (no token), the
 * restaurant has no CNPJ/IE on file, or the provider rejects the request.
 */
export async function issueNfce({
  cnpj,
  items,
  total,
  customerEmail,
  customerCpf,
}: {
  cnpj: string;
  items: FocusNfeItem[];
  total: number;
  customerEmail?: string | null;
  customerCpf?: string | null;
}): Promise<IssueNfceResult> {
  if (!isConfigured()) {
    throw new Error("Fiscal provider not configured (missing FOCUS_NFE_TOKEN) — see caixa-backend-spec.md prerequisites");
  }

  const baseUrl = process.env.FOCUS_NFE_BASE_URL || "https://homologacao.focusnfe.com.br";
  const token = process.env.FOCUS_NFE_TOKEN as string;

  const response = await fetch(`${baseUrl}/v2/nfce`, {
    method: "POST",
    headers: {
      // Focus NFe uses HTTP Basic auth with the access token as the username and an empty password.
      Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      natureza_operacao: "Venda",
      cnpj_emitente: cnpj,
      valor_total: total,
      ...(customerCpf ? { cpf_destinatario: customerCpf } : {}),
      ...(customerEmail ? { email_destinatario: customerEmail } : {}),
      items: items.map((item, index) => ({
        numero_item: index + 1,
        descricao: item.productName,
        quantidade: item.quantity,
        valor_unitario: item.unitPrice,
      })),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.mensagem || "Failed to issue NFC-e with the fiscal provider");
  }

  return {
    providerInvoiceId: data.ref || data.id || "",
    status: data.status === "autorizado" ? "ISSUED" : "PENDING",
    danfeUrl: data.caminho_danfe || null,
  };
}
