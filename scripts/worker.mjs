import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../lib/db.ts";
import { checkWorkerConfig, runAutomation } from "../lib/worker.ts";

const once = process.argv.includes("--once");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => controller.abort());
}

try {
  checkWorkerConfig();
  do {
    try {
      const count = await runAutomation();
      if (count || once) console.log(`Processed ${count} automation jobs.`);
    } catch (error) {
      if (once) throw error;
      console.error("Automation tick failed:", error instanceof Error ? error.name : "Unknown error");
    }
    if (!once && !controller.signal.aborted) await delay(60_000, undefined, { signal: controller.signal });
  } while (!once && !controller.signal.aborted);
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(error instanceof Error ? error.message : "Automation failed.");
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
