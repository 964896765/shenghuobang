import "./load-env.cjs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { MONEY_FIELD_REGISTRY, evaluateMoneyInvariantCounts, getMoneyInventorySummary, moneyFieldKey } from "../server/domain/money-migration";

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`非法数据库标识符：${value}`);
  return `\`${value}\``;
}

async function scalar(connection: mysql.Connection, sql: string): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL；金额迁移预检只读取指定的 MySQL 8 数据库");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [databaseRows] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS databaseName");
    const databaseName = String(databaseRows[0]?.databaseName ?? "");
    if (!databaseName) throw new Error("DATABASE_URL 未指定数据库名称");

    const [columnRows] = await connection.execute<RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?`,
      [databaseName],
    );
    const columns = new Map(columnRows.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row]));
    const schemaFailures: string[] = [];
    const fieldStats: Record<string, unknown>[] = [];

    for (const field of MONEY_FIELD_REGISTRY) {
      const key = moneyFieldKey(field);
      const actual = columns.get(key);
      if (!actual) {
        schemaFailures.push(`${key}: 字段不存在`);
        continue;
      }
      const expectedType = field.storage === "legacy_int_yuan" ? "int" : "decimal";
      if (String(actual.DATA_TYPE).toLowerCase() !== expectedType) {
        schemaFailures.push(`${key}: 预期 ${expectedType}，实际 ${actual.COLUMN_TYPE}`);
      }
      if ((String(actual.IS_NULLABLE) === "YES") !== field.nullable) {
        schemaFailures.push(`${key}: nullable 定义与注册表不一致`);
      }

      const table = quoteIdentifier(field.table);
      const column = quoteIdentifier(field.column);
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS totalRows,
                SUM(${column} IS NULL) AS nullRows,
                MIN(${column}) AS minValue,
                MAX(${column}) AS maxValue
         FROM ${table}`,
      );
      fieldStats.push({ key, storage: field.storage, ...rows[0] });
    }

    const unsignedFields = MONEY_FIELD_REGISTRY.filter((field) => !field.allowNegative);
    const negativeQueries = unsignedFields.map((field) =>
      `SELECT '${moneyFieldKey(field)}' AS fieldKey, COUNT(*) AS count FROM ${quoteIdentifier(field.table)} WHERE ${quoteIdentifier(field.column)} < 0`,
    );
    const [negativeRows] = await connection.query<RowDataPacket[]>(negativeQueries.join(" UNION ALL "));
    const negativeUnsignedMoney = negativeRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);

    const counts = {
      negative_unsigned_money: negativeUnsignedMoney,
      need_budget_reversed: await scalar(connection, "SELECT COUNT(*) AS count FROM needs WHERE budgetMin IS NOT NULL AND budgetMax IS NOT NULL AND budgetMin > budgetMax"),
      listing_min_above_price: await scalar(connection, "SELECT COUNT(*) AS count FROM listings WHERE minAcceptPrice IS NOT NULL AND price IS NOT NULL AND minAcceptPrice > price"),
      milestone_sum_above_project: await scalar(connection, `SELECT COUNT(*) AS count FROM (SELECT p.id FROM projects p JOIN milestones m ON m.projectId = p.id GROUP BY p.id, p.totalAmount HAVING SUM(COALESCE(m.amount, 0)) > p.totalAmount) x`),
      payment_order_mismatch: await scalar(connection, "SELECT COUNT(*) AS count FROM payments p JOIN orders o ON o.id = p.orderId WHERE p.amount <> CAST(o.amount AS DECIMAL(14,2))"),
      refund_above_payment: await scalar(connection, `SELECT COUNT(*) AS count FROM (SELECT p.id FROM payments p JOIN refunds r ON r.paymentId = p.id AND r.status = 'success' GROUP BY p.id, p.amount HAVING SUM(r.amount) > p.amount) x`),
      escrow_components_invalid: await scalar(connection, `SELECT COUNT(*) AS count FROM escrow_records WHERE fundedAmount < 0 OR releasedAmount < 0 OR refundedAmount < 0 OR fundedAmount > totalAmount OR releasedAmount + refundedAmount > totalAmount`),
      zero_required_money: await scalar(connection, `SELECT
        (SELECT COUNT(*) FROM quotes WHERE totalPrice = 0) +
        (SELECT COUNT(*) FROM quote_versions WHERE totalPrice = 0) +
        (SELECT COUNT(*) FROM projects WHERE totalAmount = 0) +
        (SELECT COUNT(*) FROM offers WHERE amount = 0) +
        (SELECT COUNT(*) FROM recycling_quotes WHERE amount = 0) +
        (SELECT COUNT(*) FROM payments WHERE amount = 0) +
        (SELECT COUNT(*) FROM refunds WHERE amount = 0) AS count`),
    };

    const findings = evaluateMoneyInvariantCounts(counts);
    const report = {
      status: schemaFailures.length === 0 && findings.every((item) => item.severity !== "error") ? "PASSED" : "FAILED",
      mode: "READ_ONLY",
      database: databaseName,
      inventory: getMoneyInventorySummary(),
      schemaFailures,
      invariantCounts: counts,
      findings,
      fieldStats,
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASSED") process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
