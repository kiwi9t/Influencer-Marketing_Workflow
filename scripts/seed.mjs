import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/pipeline.db" }),
});
try {
  await db.deal.upsert({
    where: { id: "first-collaboration" },
    update: {},
    create: {
      id: "first-collaboration",
      topicNotes: "A 30–45 second Instagram Reel featuring the product in a morning routine. Open with a quick before-and-after, then show how to use it. Include one clear call to action in the caption.",
      creator: { create: { id: "primary-creator", name: "Avery Chen", handle: "@averycreates", email: "avery@example.com", platform: "Instagram" } },
    },
  });
  console.log("Creator pipeline is ready.");
} finally {
  await db.$disconnect();
}
