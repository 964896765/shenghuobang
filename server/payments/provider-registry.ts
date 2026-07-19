import type { PaymentProvider } from "./provider";
import { sandboxPaymentProvider } from "./sandbox-provider";

export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  register(provider: PaymentProvider) {
    this.providers.set(provider.name, provider);
    return this;
  }

  resolve(name = process.env.PAYMENT_PROVIDER ?? "sandbox") {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`不支持的支付提供商：${name}`);
    return provider;
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry().register(sandboxPaymentProvider);

export function getPaymentProvider() {
  return paymentProviderRegistry.resolve();
}
