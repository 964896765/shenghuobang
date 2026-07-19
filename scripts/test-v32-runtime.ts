import "dotenv/config";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { SignJWT } from "jose";
import WebSocket from "ws";

const DATABASE_NAME = "shenghuobang_v32_runtime";
const PORT = 31521;
const ORIGIN = "http://allowed.test";
const JWT_SECRET = "v321-runtime-jwt-secret-at-least-32-characters";
const FILE_SECRET = "v321-runtime-file-secret-at-least-32-characters";
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(`V3.2 runtime failed: ${message}`); }
async function apply(connection: mysql.Connection, file: string) {
  const sql = (await readFile(path.resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", "");
  await connection.query(sql);
}
async function waitForHealth(port: number, output: () => string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/health`); if (response.ok) return; } catch { /* server still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not start: ${output()}`);
}
function startServer(databaseUrl: string, port: number, uploadDir: string, extra: Record<string, string | undefined> = {}) {
  const tsx = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
  let output = "";
  const child = spawn(process.execPath, [tsx, path.resolve("server", "_core", "index.ts")], {
    cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extra, NODE_ENV: "production", PORT: String(port), DATABASE_URL: databaseUrl, JWT_SECRET, FILE_SIGNING_SECRET: FILE_SECRET, CORS_ORIGINS: ORIGIN, WS_ALLOW_NATIVE_WITHOUT_ORIGIN: "false", PAYMENT_PROVIDER: "sandbox", STORAGE_PROVIDER: "local", LOCAL_UPLOAD_DIR: uploadDir, PUSH_PROVIDER: "log" },
  });
  child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}
async function stop(child: ChildProcess) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode == null) child.kill();
}
async function token(userId: number, openId: string) {
  return new SignJWT({ userId, openId, role: "user" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(String(userId)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(JWT_SECRET));
}
async function rejectedWebSocket(url: string, origin?: string) {
  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(url, origin ? { origin } : undefined);
    let opened = false;
    const timer = setTimeout(() => { ws.terminate(); resolve(!opened); }, 3000);
    ws.on("open", () => { opened = true; ws.close(); });
    ws.on("unexpected-response", (_request, response) => { clearTimeout(timer); resolve(response.statusCode !== 101); });
    ws.on("error", () => undefined);
    ws.on("close", () => { clearTimeout(timer); resolve(!opened); });
  });
}
async function connectWebSocket(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, { origin: ORIGIN });
    const timer = setTimeout(() => reject(new Error("websocket connect timeout")), 3000);
    ws.once("open", () => { clearTimeout(timer); resolve(ws); });
    ws.once("error", reject);
  });
}
async function nextMessage(ws: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket message timeout")), 3000);
    ws.once("message", (value) => { clearTimeout(timer); resolve(JSON.parse(value.toString())); });
  });
}

async function main() {
  const source = new URL(process.env.MYSQL_INTEGRATION_URL ?? process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/mysql");
  const admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true });
  const target = new URL(source.toString()); target.pathname = `/${DATABASE_NAME}`;
  const uploadDir = path.resolve(".tmp-v321-runtime-uploads");
  let server: ReturnType<typeof startServer> | undefined;
  try {
    await rm(uploadDir, { recursive: true, force: true }); await mkdir(uploadDir, { recursive: true });
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${DATABASE_NAME}\`;`);
    const migrationFiles = (await import("node:fs/promises")).readdir(path.resolve("drizzle"));
    for (const file of (await migrationFiles).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) await apply(admin, file);
    const [userA] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES ('runtime:a','18800000701','integration','运行甲')");
    const [userB] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES ('runtime:b','18800000702','integration','运行乙')");
    const [userC] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES ('runtime:c','18800000703','integration','运行丙')");
    const [conversation] = await admin.execute<ResultSetHeader>("INSERT INTO conversations (userAId,userBId) VALUES (?,?)", [userB.insertId, userC.insertId]);
    server = startServer(target.toString(), PORT, uploadDir);
    await waitForHealth(PORT, server.output);
    const health = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    check(JSON.stringify(await health.json()) === JSON.stringify({ ok: true, status: "alive" }), "/health response mismatch");
    const ready = await fetch(`http://127.0.0.1:${PORT}/api/ready`);
    const readyBody = await ready.json() as { ok?: boolean; status?: string };
    check(ready.status === 200 && readyBody.ok && readyBody.status === "ready", "/ready was not ready");
    const userAToken = await token(userA.insertId, "runtime:a");
    const userBToken = await token(userB.insertId, "runtime:b");
    const wsUrl = `ws://127.0.0.1:${PORT}/api/ws`;
    check(await rejectedWebSocket(`${wsUrl}?token=${encodeURIComponent(userAToken)}`), "native client without Origin was accepted");
    check(await rejectedWebSocket(`${wsUrl}?token=${encodeURIComponent(userAToken)}`, "http://evil.test"), "bad Origin was accepted");
    check(await rejectedWebSocket(`${wsUrl}?token=invalid`, ORIGIN), "invalid JWT was accepted");
    const ws = await connectWebSocket(`${wsUrl}?token=${encodeURIComponent(userAToken)}`);
    await nextMessage(ws);
    ws.send(JSON.stringify({ action: "subscribe", conversationId: conversation.insertId }));
    check((await nextMessage(ws)).code === "CONVERSATION_ACCESS_DENIED", "unauthorized conversation subscription was accepted");
    ws.close();
    const authorized = await connectWebSocket(`${wsUrl}?token=${encodeURIComponent(userBToken)}`);
    await nextMessage(authorized);
    authorized.send(JSON.stringify({ action: "subscribe", conversationId: conversation.insertId }));
    check((await nextMessage(authorized)).type === "subscribed", "authorized subscription failed");
    authorized.close();

    const pdf = Buffer.from("%PDF-1.4\nV3.2.1 integration\n");
    const upload = await fetch(`http://127.0.0.1:${PORT}/api/files/upload`, { method: "POST", headers: { authorization: `Bearer ${userAToken}`, "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ fileName: "report.pdf", mimeType: "application/pdf", base64: pdf.toString("base64"), privacyLevel: "business" }) });
    const uploadBody = await upload.json() as { id?: number };
    check(upload.status === 201 && uploadBody.id, "valid PDF upload failed");
    const access = await fetch(`http://127.0.0.1:${PORT}/api/files/${uploadBody.id}/access`, { headers: { authorization: `Bearer ${userAToken}`, origin: ORIGIN } });
    const accessBody = await access.json() as { url?: string };
    check(access.ok && accessBody.url, "signed access link was not created");
    const content = await fetch(`http://127.0.0.1:${PORT}${accessBody.url}`, { headers: { authorization: `Bearer ${userAToken}`, origin: ORIGIN } });
    check(content.ok && Buffer.from(await content.arrayBuffer()).equals(pdf), "signed content download failed");
    const otherUser = await fetch(`http://127.0.0.1:${PORT}${accessBody.url}`, { headers: { authorization: `Bearer ${userBToken}`, origin: ORIGIN } });
    check(otherUser.status === 403, "signed URL was reusable by another user");
    const expiredUrl = new URL(`http://127.0.0.1:${PORT}${accessBody.url}`); expiredUrl.searchParams.set("expires", "1");
    const expired = await fetch(expiredUrl, { headers: { authorization: `Bearer ${userAToken}`, origin: ORIGIN } });
    check(expired.status === 403, "expired/tampered signed URL was accepted");
    const doubleExtension = await fetch(`http://127.0.0.1:${PORT}/api/files/upload`, { method: "POST", headers: { authorization: `Bearer ${userAToken}`, "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ fileName: "invoice.exe.pdf", mimeType: "application/pdf", base64: pdf.toString("base64") }) });
    check(doubleExtension.status === 400, "double extension was accepted");
    const [accessLogs] = await admin.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) count FROM file_access_logs WHERE fileId=? AND result IN ('success','denied')", [uploadBody.id]);
    check(Number(accessLogs[0]?.count) >= 3, "file success/denial audits missing");

    const badServer = startServer("mysql://root@127.0.0.1:1/unavailable", PORT + 1, `${uploadDir}-bad`);
    try {
      await waitForHealth(PORT + 1, badServer.output);
      const badHealth = await fetch(`http://127.0.0.1:${PORT + 1}/api/health`);
      const badReady = await fetch(`http://127.0.0.1:${PORT + 1}/api/ready`);
      check(badHealth.status === 200 && badReady.status === 503, "database outage did not split health/readiness");
    } finally { await stop(badServer.child); }
    const [audits] = await admin.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) count FROM audit_logs WHERE action='websocket.handshake' AND result='denied'");
    check(Number(audits[0]?.count) >= 3, "rejected WebSocket handshake audits missing");
    console.log("V3.2 runtime integration passed: health/ready 3, WebSocket security 6, file security 7 checks");
  } finally {
    if (server) await stop(server.child);
    await rm(uploadDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(`${uploadDir}-bad`, { recursive: true, force: true }).catch(() => undefined);
    if (process.env.KEEP_INTEGRATION_DB !== "1") await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    await admin.end();
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
