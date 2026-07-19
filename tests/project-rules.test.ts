import { describe, expect, it } from "vitest";
import {
  addScheduleDays,
  applyProjectAmountDelta,
  canCreateQuoteVersion,
  projectAgreementStatus,
  validateProjectFileSize,
} from "../shared/project-rules";

describe("project business rules", () => {
  it("only permits editable quote states to create a new version", () => {
    expect(canCreateQuoteVersion("submitted")).toBe(true);
    expect(canCreateQuoteVersion("negotiating")).toBe(true);
    expect(canCreateQuoteVersion("accepted")).toBe(false);
    expect(canCreateQuoteVersion("withdrawn")).toBe(false);
  });

  it("requires both parties to confirm before payment", () => {
    expect(projectAgreementStatus(true, false)).toBe("pending_agreement");
    expect(projectAgreementStatus(false, true)).toBe("pending_agreement");
    expect(projectAgreementStatus(true, true)).toBe("pending_payment");
  });

  it("never makes project amount negative", () => {
    expect(applyProjectAmountDelta(1000, 500)).toBe(1500);
    expect(applyProjectAmountDelta(1000, -1200)).toBe(0);
  });

  it("applies schedule changes from the current expected date", () => {
    const base = new Date("2026-07-12T00:00:00.000Z");
    expect(addScheduleDays(base, 3)?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("rejects empty and oversized project files", () => {
    expect(() => validateProjectFileSize(0)).toThrow("文件内容为空");
    expect(() => validateProjectFileSize(8 * 1024 * 1024)).not.toThrow();
    expect(() => validateProjectFileSize(8 * 1024 * 1024 + 1)).toThrow("单个文件不能超过8MB");
  });
});
