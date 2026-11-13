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

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
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

test("registration returns a one-time device key and stores only its hash", async () => {
  let inserted;
  const db = { prepare(sql) {
    return { bind(...values) { return { run: async () => { assert.match(sql, /INSERT INTO devices/); inserted = values; }, first: async () => null }; } };
  } };
  const response = await worker.fetch(request("/api/devices", {
    method: "POST", headers: { "X-Admin-Key": "admin-secret" }, body: { id: "atmos-01", label: "Living room" },
  }), { ADMIN_API_KEY: "admin-secret", DB: db });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.id, "atmos-01");
  assert.equal(body.device_key.length, 64);
  assert.equal(inserted[2], await sha256Hex(body.device_key));
  assert.notEqual(inserted[2], body.device_key);
});

test("accepts a valid authenticated reading batch", async () => {
  const secretHash = await sha256Hex("device-secret");
  let committed;
  const db = {
    prepare(sql) {
      return { bind(...values) {
        return {
          first: async () => sql.includes("secret_hash") ? { secret_hash: secretHash } : null,
          run: async () => ({ success: true }),
          sql, values,
        };
      } };
    },
    batch: async (statements) => { committed = statements; return statements.map(() => ({ success: true })); },
  };
  const response = await worker.fetch(request("/api/ingest", {
    method: "POST", headers: { "X-Device-Key": "device-secret" },
    body: { device_id: "atmos-01", batch_id: "batch-1", samples: [
      { uptime_ms: 60_000, epoch: 0, temperature_c: 23.5, humidity_pct: 50 },
      { uptime_ms: 120_000, epoch: 0, temperature_c: 23.7, humidity_pct: 49 },
    ] },
  }), { DB: db });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, duplicate: false, accepted: 2 });
  assert.equal(committed.length, 4);
});

test("limits an oversized upload", async () => {
  const body = "x".repeat(96_001);
  const response = await worker.fetch(new Request("https://atmos.example/api/ingest", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  }), {});
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
});

