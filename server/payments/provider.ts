export type ProviderPaymentRequest = {
  paymentNo: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

export type ProviderPaymentResult = {
  success: boolean;
  providerTransactionNo?: string;
  failedReason?: string;
  raw: Record<string, string | number | boolean | null>;
};

export type ProviderRefundRequest = {
  refundNo: string;
  providerTransactionNo: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

export type ProviderRefundResult = {
  success: boolean;
  providerRefundNo?: string;
  failedReason?: string;
  raw: Record<string, string | number | boolean | null>;
};

export interface PaymentProvider {
  readonly name: string;
  confirmPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  queryPayment(providerTransactionNo: string): Promise<ProviderPaymentResult>;
  refund(request: ProviderRefundRequest): Promise<ProviderRefundResult>;
}
