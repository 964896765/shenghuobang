import crypto from "node:crypto";
import type { PaymentProvider, ProviderPaymentRequest, ProviderPaymentResult, ProviderRefundRequest, ProviderRefundResult } from "./provider";

/** Deterministic local provider. It never contacts a real payment network. */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = "sandbox";

  async confirmPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    const suffix = crypto.createHash("sha256").update(`pay:${request.paymentNo}:${request.idempotencyKey}`).digest("hex").slice(0, 24);
    return { success: true, providerTransactionNo: `SBX-PAY-${suffix}`, raw: { sandbox: true, paymentNo: request.paymentNo } };
  }

  async queryPayment(providerTransactionNo: string): Promise<ProviderPaymentResult> {
    return { success: providerTransactionNo.startsWith("SBX-PAY-"), providerTransactionNo, raw: { sandbox: true } };
  }

  async refund(request: ProviderRefundRequest): Promise<ProviderRefundResult> {
    const suffix = crypto.createHash("sha256").update(`refund:${request.refundNo}:${request.idempotencyKey}`).digest("hex").slice(0, 24);
    return { success: true, providerRefundNo: `SBX-REF-${suffix}`, raw: { sandbox: true, refundNo: request.refundNo } };
  }
}

export const sandboxPaymentProvider = new SandboxPaymentProvider();
