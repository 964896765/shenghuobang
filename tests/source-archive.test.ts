import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("源码交付包", () => {
  it("当前 HEAD 不跟踪密钥、依赖、构建或验证产物", () => {
    const tracked = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { encoding: "utf8" });
    const files = tracked.trim().split("\n");
    expect(files.filter((path) => path !== ".env.example" && /(^|\/)\.env(?:\.|$)/.test(path))).toEqual([]);
    expect(tracked).not.toMatch(/(^|\/)(node_modules|artifacts|dist|web-dist|\.expo)(\/|$)/m);
    expect(tracked).not.toMatch(/\.(apk|aab|jks|keystore|log|zip)$/im);
  });

  it("只从干净 HEAD 创建且拒绝覆盖源码包", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/create-source-archive.mjs"), "utf8");
    expect(source).toContain('"--untracked-files=all"');
    expect(source).toContain('"git", ["archive"');
    expect(source).toContain('"HEAD"');
    expect(source).toContain("拒绝覆盖已有源码包");
  });
});
