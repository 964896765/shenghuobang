const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

for (const filename of [".env.local", ".env"]) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) continue;
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
