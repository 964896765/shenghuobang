import { describe, expect, it, vi } from "vitest";

import { clearAuthScopedQueries } from "../lib/auth-query-cache";

describe("认证账号切换时清理查询缓存", () => {
  it("先取消进行中的请求，再同步移除旧账号数据", async () => {
    const cancelQueries = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();

    clearAuthScopedQueries({ cancelQueries, clear });

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });
});
