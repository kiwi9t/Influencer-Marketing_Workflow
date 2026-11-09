import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalDb = globalThis as typeof globalThis & { pipelineDb?: PrismaClient };
export const db = globalDb.pipelineDb ?? new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/pipeline.db" }),
});
if (process.env.NODE_ENV !== "production") globalDb.pipelineDb = db;
