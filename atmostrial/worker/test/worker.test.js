import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Request(`https://atmos.example${path}`, {
    method,
    headers: new Headers(headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("health endpoint reports the service without touching D1", async () => {
  const response = await worker.fetch(request("/api/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "atmos-api" });
});

test("preflight only allows configured origins", async () => {
  const allowed = await worker.fetch(request("/api/ingest", {
    method: "OPTIONS", headers: { Origin: "https://dashboard.example" },
  }), { CORS_ORIGINS: "https://dashboard.example" });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://dashboard.example");

  const denied = await worker.fetch(request("/api/ingest", {
    method: "OPTIONS", headers: { Origin: "https://attacker.example" },
  }), { CORS_ORIGINS: "https://dashboard.example" });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("rejects malformed JSON", async () => {
  const response = await worker.fetch(new Request("https://atmos.example/api/ingest", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{bad",
  }), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_json" });
});

test("rejects malformed batch shape before database access", async () => {
  const response = await worker.fetch(request("/api/ingest", {
    method: "POST", body: { device_id: "atmos-01", batch_id: "b-1", samples: [] },
  }), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "samples_must_contain_1_to_240_readings" });
});

test("requires a valid device key for ingestion", async () => {
  const db = { prepare(sql) {
    assert.match(sql, /SELECT secret_hash/);
    return { bind(id) { assert.equal(id, "atmos-01"); return { first: async () => null }; } };
  } };
  const response = await worker.fetch(request("/api/ingest", {
    method: "POST",
    body: { device_id: "atmos-01", batch_id: "b-1", samples: [{ uptime_ms: 0, epoch: 0, temperature_c: 24.5, humidity_pct: 40 }] },
  }), { DB: db });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_device_credentials" });
});

test("device registration requires the administrative secret", async () => {
  const response = await worker.fetch(request("/api/devices", {
    method: "POST", body: { id: "atmos-01", label: "Living room" },
  }), { ADMIN_API_KEY: "configured-secret" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_admin_credentials" });
});

test("limits an oversized upload", async () => {
  const body = "x".repeat(96_001);
  const response = await worker.fetch(new Request("https://atmos.example/api/ingest", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  }), {});
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
});

