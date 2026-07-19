import type { Express } from "express";
export function registerStorageProxy(app: Express) {
  app.use("/uploads", (_req, res) => res.status(403).json({ error: "Files require an authenticated, signed access link" }));
}
