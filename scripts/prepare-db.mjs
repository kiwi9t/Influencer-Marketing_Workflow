import "dotenv/config";
import { closeSync, openSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "file:./prisma/pipeline.db";
if (!url.startsWith("file:") || !url.slice(5) || url === "file::memory:") {
  throw new Error("DATABASE_URL must point to a local SQLite file.");
}
// Create an empty file for a first-run migration without truncating existing data.
closeSync(openSync(url.slice(5), "a"));
