import prisma from "../../shared/prisma";
import { badRequest, conflict, forbidden, notFound } from "../../shared/utils/httpResponse";
import { issueNfce } from "./focusNfe";

type Role = "WAITER" | "MANAGER" | "ADMIN" | "CASHIER";

interface LoggedUser {
  id: string;
  role: Role;
  restaurantId: string;
}

const CAN_ISSUE: Role[] = ["CASHIER", "MANAGER", "ADMIN"];

const formatFiscalDocument = (doc: {
  id: string;
  billId: string;
  status: string;
  providerInvoiceId: string | null;
  danfeUrl: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCpf: string | null;
  issuedAt: Date | null;
  error: string | null;
}) => ({
  id: doc.id,
  billId: doc.billId,
  status: doc.status,
  providerInvoiceId: doc.providerInvoiceId,
  danfeUrl: doc.danfeUrl,
  customerEmail: doc.customerEmail,
  customerPhone: doc.customerPhone,
  customerCpf: doc.customerCpf,
  issuedAt: doc.issuedAt,
  error: doc.error,
});

/** NFC-e issuance for a paid `Bill` — see caixa-backend-spec.md §"Nota fiscal". */
export class FiscalDocumentService {
  /**
   * `POST /bills/:id/fiscal-document` — only callable once the bill is fully
   * paid. Returns `PENDING` immediately; the provider call happens in the
   * background (fire-and-forget) and lands the final `ISSUED`/`FAILED`
   * state via {@link issueAsync}, polled by the front through `getStatus`.
   */
  async issue({
    billId,
    customerEmail,
    customerPhone,
    customerCpf,
    loggedUser,
  }: {
    billId: string;
    customerEmail?: string;
    customerPhone?: string;
    customerCpf?: string;
    loggedUser: LoggedUser;
  }) {
    if (!CAN_ISSUE.includes(loggedUser.role)) {
      return forbidden("Only CASHIER, MANAGER or ADMIN can issue a fiscal document");
    }

    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    if (bill.status !== "PAID") {
      return badRequest("Bill must be fully paid before issuing a fiscal document");
    }

    const existing = await prisma.fiscalDocument.findUnique({ where: { billId } });
    if (existing && existing.status !== "FAILED") {
      return conflict("Fiscal document already requested for this bill");
    }

    const doc = existing
      ? await prisma.fiscalDocument.update({
          where: { billId },
          data: { status: "PENDING", error: null, customerEmail, customerPhone, customerCpf },
        })
      : await prisma.fiscalDocument.create({
          data: { billId, customerEmail, customerPhone, customerCpf },
        });

    const restaurant = await prisma.restaurant.findUnique({ where: { id: loggedUser.restaurantId } });

    this.issueAsync(doc.id, bill, restaurant?.cnpj, customerEmail, customerCpf);

    return { statusCode: 201, response: formatFiscalDocument(doc), message: "Fiscal document issuance requested" };
  }

  /** Background completion of {@link issue} — never awaited by the controller, errors land on the row, not the response. */
  private async issueAsync(
    docId: string,
    bill: { items: { productName: string; quantity: number; unitPrice: number }[]; total: number },
    cnpj: string | undefined,
    customerEmail?: string,
    customerCpf?: string
  ) {
    try {
      if (!cnpj) {
        throw new Error("Restaurant has no CNPJ on file");
      }

      const result = await issueNfce({
        cnpj,
        items: bill.items,
        total: bill.total,
        customerEmail,
        customerCpf,
      });

      await prisma.fiscalDocument.update({
        where: { id: docId },
        data: {
          status: result.status,
          providerInvoiceId: result.providerInvoiceId,
          danfeUrl: result.danfeUrl,
          issuedAt: result.status === "ISSUED" ? new Date() : null,
        },
      });
    } catch (err: any) {
      await prisma.fiscalDocument.update({
        where: { id: docId },
        data: { status: "FAILED", error: String(err?.message || "Unknown error").slice(0, 500) },
      });
    }
  }

  /** `GET /bills/:id/fiscal-document` — 404 if issuance was never requested for this bill. */
  async getStatus({ billId, loggedUser }: { billId: string; loggedUser: LoggedUser }) {
    const bill = await prisma.bill.findFirst({ where: { id: billId, restaurantId: loggedUser.restaurantId } });
    if (!bill) {
      return notFound("Bill not found");
    }

    const doc = await prisma.fiscalDocument.findUnique({ where: { billId } });
    if (!doc) {
      return notFound("Fiscal document not found");
    }

    return { statusCode: 200, response: formatFiscalDocument(doc) };
  }
}
