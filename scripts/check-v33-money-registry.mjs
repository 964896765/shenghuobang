import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/domain/money-migration.ts", import.meta.url), "utf8");
const moneyColumnPattern = /^(startingPrice|budgetMin|budgetMax|totalPrice|totalAmount|amount|amountDelta|price|minAcceptPrice|expectedPrice|adjustedAmount|purchasePrice|fundedAmount|releasedAmount|refundedAmount|refundAmount|releaseAmount)$/;

const tableStarts = [...schema.matchAll(/export const \w+ = mysqlTable\("([^"]+)"/g)];
const discovered = [];
for (let index = 0; index < tableStarts.length; index += 1) {
  const match = tableStarts[index];
  const table = match[1];
  const start = match.index ?? 0;
  const end = tableStarts[index + 1]?.index ?? schema.length;
  const block = schema.slice(start, end);
  for (const columnMatch of block.matchAll(/^\s*(\w+):\s*(?:int|decimal|bigint)\("([^"]+)"/gm)) {
    const property = columnMatch[1];
    const column = columnMatch[2];
    if (moneyColumnPattern.test(property)) discovered.push(`${table}.${column}`);
  }
}

const registered = [...registrySource.matchAll(/\{ table: "([^"]+)", column: "([^"]+)"/g)]
  .map((match) => `${match[1]}.${match[2]}`);
const discoveredSet = new Set(discovered);
const registeredSet = new Set(registered);
const missing = [...discoveredSet].filter((key) => !registeredSet.has(key)).sort();
const stale = [...registeredSet].filter((key) => !discoveredSet.has(key)).sort();
const duplicates = registered.filter((key, index) => registered.indexOf(key) !== index);

const report = {
  status: missing.length || stale.length || duplicates.length ? "FAILED" : "PASSED",
  discovered: discoveredSet.size,
  registered: registeredSet.size,
  missing,
  stale,
  duplicates: [...new Set(duplicates)],
};
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASSED") process.exit(1);
