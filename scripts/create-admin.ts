import "dotenv/config";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { hashPassword } from "../server/_core/password";

const roles = ["admin", "verification_reviewer", "complaint_operator", "finance_operator", "customer_service"] as const;
type AdminRole = (typeof roles)[number];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const phone = process.env.ADMIN_PHONE?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const role = (process.env.ADMIN_ROLE ?? "admin") as AdminRole;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!phone || !/^\+?\d{6,20}$/.test(phone)) throw new Error("ADMIN_PHONE is invalid");
  if (!password || password.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
  if (!roles.includes(role)) throw new Error(`ADMIN_ROLE must be one of: ${roles.join(", ")}`);

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>("SELECT id FROM users WHERE phone = ? LIMIT 1", [phone]);
    const passwordHash = await hashPassword(password);
    let userId: number;
    if (rows[0]) {
      userId = rows[0].id;
      await connection.execute("UPDATE users SET passwordHash = ?, role = ?, accountStatus = 'active' WHERE id = ?", [passwordHash, role, userId]);
    } else {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users (openId, phone, passwordHash, name, loginMethod, role, accountStatus) VALUES (?,?,?,?,?,?,?)",
        [`local:${phone}`, phone, passwordHash, "本地管理员", "phone_password", role, "active"],
      );
      userId = result.insertId;
      await connection.execute("INSERT INTO user_profiles (userId, nickname, currentRole) VALUES (?,?,?)", [userId, "本地管理员", "user"]);
    }
    console.log(`管理员已就绪：userId=${userId}, phone=${phone}, role=${role}`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "创建管理员失败");
  process.exitCode = 1;
});
