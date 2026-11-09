import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const execAsync = promisify(execFile);

test("automates one deal from pitch through seven daily snapshots", { timeout: 60_000 }, async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "relay-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const env = {
    ...process.env, DATABASE_URL: `file:${join(scratch, "workflow.db")}`, NEXT_TELEMETRY_DISABLED: "1",
    EMAIL_MODE: "preview", CREATOR_SUBMISSION_SECRET: "fixture-only-creator-submission-secret",
    METRICS_PROVIDER_URL: "", OPS_EMAIL: "ops@example.test",
  };
  execFileSync("npm", ["run", "db:setup"], { env, stdio: "pipe" });
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  env.CREATOR_SUBMISSION_URL = `http://127.0.0.1:${port}`;
  await new Promise((resolve) => probe.close(resolve));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  try {
    const endpoint = `http://127.0.0.1:${port}/api/deal`;
    let ready;
    for (let attempt = 0; attempt < 60 && server.exitCode === null; attempt++) {
      ready = await fetch(endpoint).catch(() => null);
      if (ready?.ok) break;
      await delay(200);
    }
    assert.ok(ready?.ok, `Server never became ready.\n${logs}`);
    const load = async () => (await fetch(endpoint)).json();
    const runWorker = (config = {}) => execAsync("npm", ["run", "worker", "--", "--once"], { env: { ...env, ...config } });
    let deal = await ready.json();
    assert.equal(deal.status, "PITCHING");

    async function update(action, fields, status = 200, revision = deal.revision) {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fields, revision }),
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      if (status === 200) deal = result;
      else {
        assert.equal(typeof result.error, "string");
        assert.equal((await (await fetch(endpoint)).json()).revision, deal.revision);
      }
      return result;
    }

    const numbers = { views: 502, comments: 23, clicks: 10, orders: 2 };
    await update("metric", { dayNumber: 1, ...numbers }, 409);
    await update("creator", { name: "Taylor Quinn", handle: "@taylor.test", email: "taylor@example.com", platform: "YouTube" });
    assert.equal(deal.creator.name, "Taylor Quinn");
    await update("advance", { topicNotes: " " }, 400);
    await update("advance", { topicNotes: "One tutorial and a clear CTA." }, 200);
    assert.equal(deal.status, "NEGOTIATION");
    await runWorker();
    deal = await load();
    const quote = deal.jobs.find((job) => job.subject.includes("quote request"));
    assert.equal(quote.status, "PREVIEW");
    const submission = quote.preview.match(/http:\/\/[^\s]+/)[0];
    const submitURL = new URL(submission);
    assert.equal((await fetch(submitURL)).status, 200);
    assert.equal((await fetch(new URL("/submit?token=invalid", submission))).status, 403);
    const portalPost = (fields, token = submitURL.searchParams.get("token")) => fetch(new URL("/submit", submission), {
      method: "POST",
      body: new URLSearchParams({ token, revision: String(deal.revision), ...fields }),
    });
    assert.equal((await portalPost({ askingRate: "1200.00" }, "invalid")).status, 403);
    assert.equal((await portalPost({ askingRate: "1200.00" })).status, 200);
    assert.equal((await portalPost({ askingRate: "50" })).status, 409);
    deal = await load();
    assert.equal(deal.askingRate, 1200);
    await update("save", { askingRate: "1200.00" }, 409, 1);
    await update("advance", { askingRate: "1200.00", agreedRate: "-3" }, 400);
    await update("save", { askingRate: "1200.00", targetBudget: "1000", offerRate: "900", negotiationNote: "First counteroffer" });
    assert.equal(deal.status, "NEGOTIATION");
    await update("advance", { askingRate: "1200.00", agreedRate: "945.50", targetBudget: "1000", negotiationNote: "Final acceptance" });
    assert.equal(deal.status, "LOGISTICS_CONTRACT");
    assert.equal(deal.agreedRate, 945.5);
    assert.equal(deal.targetBudget, 1000);
    assert.ok(deal.lockedAt);
    assert.match(deal.contractDraft, /945\.50/);
    assert.ok(deal.negotiationHistory.some((entry) => entry.offerRate === 900 && entry.note === "First counteroffer"));

    const pastDate = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    const logistics = {
      contractUrl: "https://example.com/contract", contractSigned: true, briefUrl: "https://example.com/brief",
      shippingAddress: "123 Example Street", targetLiveDate: pastDate, plannedShipDate: pastDate, expectedDeliveryDate: pastDate,
    };
    await update("advance", { ...logistics, contractSigned: false }, 400);
    await update("save", logistics);
    assert.equal(deal.status, "LOGISTICS_CONTRACT");
    await runWorker();
    await runWorker();
    deal = await load();
    for (const subject of ["Product brief and publication schedule", "Sample shipment is due", "Reminder to submit your script", "Reminder to submit your video draft"]) {
      assert.equal(deal.jobs.filter((job) => job.subject === subject && job.status === "PREVIEW").length, 1);
    }

    await update("save", { ...logistics, shippingTrackingNumber: "TEST123" });
    await runWorker();
    deal = await load();
    assert.equal(deal.jobs.find((job) => job.subject === "Confirm the sample delivery").status, "PREVIEW");
    assert.equal((await portalPost({ delivered: "on", scriptUrl: "https://example.com/script" })).status, 200);
    deal = await load();
    await update("save", { ...logistics, shippingTrackingNumber: "TEST123", deliveredAt: deal.deliveredAt, sampleStatus: "FAILED" });
    assert.equal(deal.status, "LOGISTICS_CONTRACT");
    await update("save", { ...logistics, shippingTrackingNumber: "TEST123", deliveredAt: deal.deliveredAt, sampleStatus: "PASSED" });
    assert.equal(deal.status, "DRAFT_REVIEW");
    assert.equal(deal.targetLiveDate, pastDate);
    assert.ok(deal.deliverables.some((row) => row.kind === "SCRIPT" && row.status === "SUBMITTED"));
    assert.ok(deal.deliverables.some((row) => row.kind === "SAMPLE" && row.status === "FAILED"));

    const requested = { draftUrl: "https://example.com/v1", reviewStatus: "REVISION_REQUESTED", reviewNotes: "Show the CTA on-screen." };
    await update("save", requested);
    assert.equal(deal.reviewStatus, "REVISION_REQUESTED");
    await update("advance", requested, 400);
    await runWorker();
    deal = await load();
    assert.equal(deal.jobs.find((job) => job.subject.includes("Changes requested")).status, "PREVIEW");
    const destinationUrl = "https://example.com/product?sku=42&utm_source=old#buy";
    await update("save", {
      draftUrl: "https://example.com/v2", reviewStatus: "APPROVED", reviewNotes: "Ready to publish.",
      destinationUrl, requiredTags: "@brand #campaign #ad", affiliateUrl: "https://example.com/aff",
    });
    assert.equal(deal.status, "LIVE_PENDING");
    assert.ok(deal.deliverables.some((row) => row.status === "APPROVED"));
    await runWorker();
    deal = await load();
    const assets = deal.jobs.find((job) => job.subject.includes("publication assets"));
    assert.equal(assets.status, "PREVIEW");
    assert.match(assets.preview, /Affiliate link: https:\/\/example.com\/aff/);
    const link = new URL(deal.trackingLink);
    assert.equal(link.searchParams.get("sku"), "42");
    assert.equal(link.searchParams.get("utm_source"), "youtube");
    assert.equal(link.searchParams.get("utm_medium"), "influencer");
    assert.equal(link.searchParams.get("utm_campaign"), deal.id);
    assert.equal(link.searchParams.get("utm_content"), "taylor.test");
    assert.equal(link.hash, "#buy");
    assert.equal(deal.hashtags, "@brand #campaign #ad");

    await update("advance", { destinationUrl }, 400);
    const publishedAt = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const liveVideoUrl = "https://example.com/live";
    assert.equal((await portalPost({ liveVideoUrl, publishedAt })).status, 200);
    deal = await load();
    assert.equal(deal.status, "LIVE_PENDING");
    assert.equal(deal.liveVideoUrl, liveVideoUrl);
    await update("advance", { destinationUrl, liveVideoUrl, publishedAt });
    assert.equal(deal.status, "COMPLETED");
    await update("advance", {}, 409);
    await update("metric", { dayNumber: 8, ...numbers }, 400);
    await update("metric", { dayNumber: 1, ...numbers, orders: -1 }, 400);
    await update("metric", { dayNumber: 1, ...numbers, views: 999 });
    const requests = [];
    const metricsServer = createHttpServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      requests.push(payload);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ...numbers, views: numbers.views + payload.dayNumber }));
    }).listen(0, "127.0.0.1");
    await once(metricsServer, "listening");
    try {
      await runWorker();
      assert.equal((await load()).jobs.filter((job) => job.kind === "METRICS" && job.status === "PENDING").length, 6);
      const config = { METRICS_PROVIDER_URL: `http://127.0.0.1:${metricsServer.address().port}` };
      await runWorker(config);
      await runWorker(config);
    } finally {
      await new Promise((resolve) => metricsServer.close(resolve));
    }
    assert.equal(requests.length, 6);
    assert.equal(requests[0].dayNumber, 2);
    assert.equal(requests[0].liveVideoUrl, liveVideoUrl);
    assert.equal(new Date(requests[0].to) - new Date(requests[0].from), 86_400_000);
    const reloaded = await load();
    assert.equal(reloaded.metrics.length, 7);
    assert.equal(reloaded.metrics[0].views, 999);
    assert.equal(reloaded.metrics[0].source, "MANUAL");
    assert.equal(reloaded.metrics[6].views, 509);
    assert.equal(reloaded.metrics[6].source, "PROVIDER");
    assert.equal(reloaded.stageHistory.length, 5);
    const createdResponse = await fetch(endpoint.replace("/api/deal", "/api/collaborations"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Second campaign", name: "Jordan Test", handle: "@jordantest", email: "jordan@example.com", platform: "TikTok", targetLiveDate: "2026-11-21" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const secondEndpoint = endpoint + "?id=" + created.id;
    const second = await (await fetch(secondEndpoint)).json();
    assert.equal(second.status, "PITCHING");
    assert.equal(second.creator.name, "Jordan Test");
    const advanced = await fetch(secondEndpoint, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance", revision: second.revision, fields: { topicNotes: "Second creator tutorial." } }),
    });
    assert.equal(advanced.status, 200);
    const updatedSecond = await advanced.json();
    assert.equal(updatedSecond.status, "NEGOTIATION");
    assert.equal(updatedSecond.stageHistory.length, 2);
    assert.equal((await load()).status, "COMPLETED");
    assert.equal((await load()).creator.name, "Taylor Quinn");

  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const closed = once(server, "close");
      server.kill();
      await closed;
    }
  }
});
