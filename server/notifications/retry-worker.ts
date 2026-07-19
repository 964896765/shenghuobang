import { retryDueNotificationDeliveries } from "../db";
import { logger } from "../_core/logger";

export function startNotificationRetryWorker(intervalMs = 30_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const count = await retryDueNotificationDeliveries();
      if (count > 0) logger.info("notification.retry_completed", { count });
    } catch (error) {
      logger.warn("notification.retry_failed", { error });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  void run();
  return () => clearInterval(timer);
}
