import { describe, expect, it } from "vitest";
import { DevelopmentFileScanner } from "../server/storage/scanner";
import { emitRealtimeEvent, subscribeRealtimeEvents } from "../server/event-bus";

describe("V3.2 文件与实时事件基础", () => {
  it("拒绝可执行文件", async () => {
    const scanner = new DevelopmentFileScanner();
    await expect(scanner.scan(Buffer.from("test"), "virus.exe")).resolves.toMatchObject({ status: "rejected" });
  });

  it("拒绝双重扩展名欺骗", async () => {
    const scanner = new DevelopmentFileScanner();
    await expect(scanner.scan(Buffer.from("test"), "invoice.exe.pdf")).resolves.toMatchObject({ status: "rejected" });
  });

  it("开发环境对普通文件明确返回未接入真实病毒扫描", async () => {
    const scanner = new DevelopmentFileScanner();
    await expect(scanner.scan(Buffer.from("test"), "report.pdf")).resolves.toMatchObject({ status: "unavailable" });
  });

  it("领域事件只投递一次给每个订阅者", () => {
    const events: string[] = [];
    const unsubscribe = subscribeRealtimeEvents((event) => events.push(event.type));
    emitRealtimeEvent({ type: "order.updated", userId: 1, payload: { id: 7 } });
    unsubscribe();
    emitRealtimeEvent({ type: "order.updated", userId: 1, payload: { id: 8 } });
    expect(events).toEqual(["order.updated"]);
  });
});
