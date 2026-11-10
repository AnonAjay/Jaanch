/**
 * Spike 4 Test: Starts the health server, issues fetch calls from Node, and verifies connectivity + CORS headers.
 */

import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const TEST_PORT = 8089;
const HEALTH_URL = `http://127.0.0.1:${TEST_PORT}/health`;
const BUDGET_URL = `http://127.0.0.1:${TEST_PORT}/budget`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("Spike 4: Proxy /health and /budget are reachable and CORS-enabled", async () => {
  // Spawn Python health server
  const serverProc = spawn("python", ["spikes/spike4_health_server.py", String(TEST_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProc.stdout.on("data", (d) => {
    // console.log(`[server stdout] ${d}`);
  });

  // Give server 500ms to bind
  await sleep(500);

  try {
    console.log(`\n[Spike 4 Evidence] Querying proxy endpoint at ${HEALTH_URL}...`);
    const healthRes = await fetch(HEALTH_URL);

    assert.equal(healthRes.status, 200, "Health status must be 200 OK");
    const corsHeader = healthRes.headers.get("access-control-allow-origin");
    assert.ok(corsHeader, "Must include Access-Control-Allow-Origin header");
    console.log(` - CORS Header: ${corsHeader}`);

    const healthData = await healthRes.json();
    console.log(` - Health Payload: ${JSON.stringify(healthData)}`);
    assert.equal(healthData.ok, true, "Payload ok must be true");
    assert.equal(healthData.service, "jaanch-proxy");

    console.log(`[Spike 4 Evidence] Querying budget endpoint at ${BUDGET_URL}...`);
    const budgetRes = await fetch(BUDGET_URL);
    assert.equal(budgetRes.status, 200, "Budget status must be 200 OK");

    const budgetData = await budgetRes.json();
    console.log(` - Budget Payload: ${JSON.stringify(budgetData)}`);
    assert.equal(budgetData.cap, 4500.0);
    assert.equal(budgetData.remaining, 4500.0);

    console.log("\n[Spike 4 Result]: PASS - Proxy server is reachable, returns valid JSON, and supports CORS.");
  } finally {
    serverProc.kill("SIGTERM");
  }
});
