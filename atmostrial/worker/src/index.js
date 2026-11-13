const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY_BYTES = 96_000;
const MAX_SAMPLES = 240;
const DEFAULT_HISTORY_LIMIT = 500;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function fail(status, error) {
  return json({ error }, status);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.CORS_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!origin || allowed.includes("*") || allowed.includes(origin)) {
    return {
      "access-control-allow-origin": origin || "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Device-Key, X-Admin-Key",
      "access-control-max-age": "86400",
      vary: "Origin",
    };
  }
  return {};
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  try { return JSON.parse(text); } catch { throw new Error("invalid_json"); }
}

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value);
}

function validBatchId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
}

function finiteRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function newDeviceSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function constantTimeHexEqual(a, b) {
  const [left, right] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function authenticateDevice(request, env, deviceId) {
  const secret = request.headers.get("X-Device-Key") || "";
  if (!secret || secret.length > 256) return false;
  const row = await env.DB.prepare("SELECT secret_hash FROM devices WHERE id = ? AND enabled = 1").bind(deviceId).first();
  if (!row) return false;
  return constantTimeHexEqual(await sha256Hex(secret), row.secret_hash);
}

async function ingest(request, env) {
  const body = await readJson(request);
  if (!body || !validId(body.device_id) || !validBatchId(body.batch_id)) return fail(400, "invalid_device_or_batch_id");
  if (!Array.isArray(body.samples) || body.samples.length < 1 || body.samples.length > MAX_SAMPLES) return fail(400, "samples_must_contain_1_to_240_readings");
  if (!(await authenticateDevice(request, env, body.device_id))) return fail(401, "invalid_device_credentials");

  const now = Date.now();
  const clean = [];
  let maxUptime = 0;
  for (let index = 0; index < body.samples.length; index++) {
    const sample = body.samples[index];
    if (!sample || !Number.isSafeInteger(sample.uptime_ms) || sample.uptime_ms < 0 ||
      !(sample.epoch === 0 || (Number.isSafeInteger(sample.epoch) && sample.epoch > 0)) ||
      !finiteRange(sample.temperature_c, -40, 85) || !finiteRange(sample.humidity_pct, 0, 100)) {
      return fail(400, `invalid_sample_at_index_${index}`);
    }
    maxUptime = Math.max(maxUptime, sample.uptime_ms);
    clean.push(sample);
  }
  const statements = [
    env.DB.prepare("INSERT INTO batches (device_id, batch_id, sample_count, received_at) VALUES (?, ?, ?, ?)")
      .bind(body.device_id, body.batch_id, clean.length, new Date(now).toISOString()),
  ];
  for (let index = 0; index < clean.length; index++) {
    const sample = clean[index];
    const time = sample.epoch > 0
      ? new Date(sample.epoch * 1000).toISOString()
      : new Date(now - (maxUptime - sample.uptime_ms)).toISOString();
    statements.push(env.DB.prepare(
      "INSERT INTO readings (device_id, batch_id, sample_index, observed_at, uptime_ms, temperature_c, humidity_pct) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(body.device_id, body.batch_id, index, time, sample.uptime_ms, sample.temperature_c, sample.humidity_pct));
  }
  statements.push(env.DB.prepare("UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?")
    .bind(new Date(now).toISOString(), new Date(now).toISOString(), body.device_id));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    // A duplicate batch is a successful retry. Other database errors remain visible as a generic 500.
    const existing = await env.DB.prepare("SELECT 1 AS found FROM batches WHERE device_id = ? AND batch_id = ?")
      .bind(body.device_id, body.batch_id).first();
    if (existing) return json({ ok: true, duplicate: true, accepted: 0 });
    console.error("Atmos ingest database error", error instanceof Error ? error.name : "unknown");
    return fail(500, "ingest_failed");
  }
  return json({ ok: true, duplicate: false, accepted: clean.length }, 201);
}

async function registerDevice(request, env) {
  const adminKey = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_API_KEY || !(await constantTimeHexEqual(adminKey, env.ADMIN_API_KEY))) return fail(401, "invalid_admin_credentials");
  const body = await readJson(request);
  if (!body || !validId(body.id)) return fail(400, "invalid_device_id");
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : body.id;
  if (!label) return fail(400, "invalid_device_label");
  const secret = newDeviceSecret();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO devices (id, label, secret_hash, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
      .bind(body.id, label, await sha256Hex(secret), now, now).run();
  } catch (error) {
    const exists = await env.DB.prepare("SELECT 1 AS found FROM devices WHERE id = ?").bind(body.id).first();
    if (exists) return fail(409, "device_id_already_exists");
    console.error("Atmos registration database error", error instanceof Error ? error.name : "unknown");
    return fail(500, "device_registration_failed");
  }
  // Returned only once; only the SHA-256 hash is stored.
  return json({ id: body.id, label, device_key: secret, warning: "Copy this key to the device now. It cannot be retrieved later." }, 201);
}

function rangeDays(url) {
  const value = Number(url.searchParams.get("days") || 7);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 90)) : 7;
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (request.method === "GET" && path === "/api/health") return json({ ok: true, service: "atmos-api" });
  if (request.method === "POST" && path === "/api/devices") return registerDevice(request, env);
  if (request.method === "POST" && path === "/api/ingest") return ingest(request, env);
  if (request.method === "GET" && path === "/api/devices") {
    const result = await env.DB.prepare("SELECT id, label, enabled, created_at, updated_at, last_seen_at FROM devices ORDER BY created_at DESC LIMIT 200").all();
    return json({ data: result.results || [] });
  }

  const match = path.match(/^\/api\/devices\/([^/]+)(?:\/(latest|history|analytics|insights|status))?$/);
  if (!match) return fail(404, "not_found");
  const deviceId = decodeURIComponent(match[1]);
  if (!validId(deviceId)) return fail(400, "invalid_device_id");
  const device = await env.DB.prepare("SELECT id, label, enabled, created_at, last_seen_at FROM devices WHERE id = ?")
    .bind(deviceId).first();
  if (!device) return fail(404, "device_not_found");
  const action = match[2] || "status";

  if (action === "status") {
    const latest = await env.DB.prepare("SELECT observed_at FROM readings WHERE device_id = ? ORDER BY observed_at DESC LIMIT 1").bind(deviceId).first();
    const last = latest?.observed_at || device.last_seen_at || null;
    const age = last ? Date.now() - Date.parse(last) : Infinity;
    return json({ device_id: deviceId, enabled: Boolean(device.enabled), last_seen_at: device.last_seen_at || null,
      last_reading_at: latest?.observed_at || null, online: age <= 90 * 60 * 1000,
      status: age <= 90 * 60 * 1000 ? "online" : last ? "stale" : "never_seen" });
  }
  if (action === "latest") {
    const result = await env.DB.prepare("SELECT observed_at, temperature_c, humidity_pct, batch_id FROM readings WHERE device_id = ? ORDER BY observed_at DESC LIMIT 1").bind(deviceId).first();
    return json({ device_id: deviceId, data: result || null });
  }
  const days = rangeDays(url);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (action === "history") {
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || DEFAULT_HISTORY_LIMIT) || DEFAULT_HISTORY_LIMIT, 1000));
    const result = await env.DB.prepare("SELECT observed_at, temperature_c, humidity_pct, batch_id FROM readings WHERE device_id = ? AND observed_at >= ? ORDER BY observed_at DESC LIMIT ?")
      .bind(deviceId, since, limit).all();
    return json({ device_id: deviceId, days, data: result.results || [] });
  }
  const aggregate = await env.DB.prepare(
    "SELECT COUNT(*) AS count, AVG(temperature_c) AS temperature_mean, MIN(temperature_c) AS temperature_min, MAX(temperature_c) AS temperature_max, AVG(humidity_pct) AS humidity_mean, MIN(humidity_pct) AS humidity_min, MAX(humidity_pct) AS humidity_max FROM readings WHERE device_id = ? AND observed_at >= ?",
  ).bind(deviceId, since).first();
  if (action === "analytics") {
    const hourly = await env.DB.prepare(
      "SELECT CAST(strftime('%H', observed_at) AS INTEGER) AS hour, COUNT(*) AS count, AVG(temperature_c) AS temperature_mean, AVG(humidity_pct) AS humidity_mean FROM readings WHERE device_id = ? AND observed_at >= ? GROUP BY hour ORDER BY hour",
    ).bind(deviceId, since).all();
    return json({ device_id: deviceId, days, ...aggregate, hourly: hourly.results || [] });
  }
  if (action === "insights") {
    const count = Number(aggregate?.count || 0);
    const insights = [];
    if (!count) insights.push({ type: "info", message: "No readings are available for this period." });
    else {
      if (aggregate.temperature_max >= 30) insights.push({ type: "notice", metric: "temperature", message: "Temperature reached 30°C or higher." });
      if (aggregate.humidity_max >= 70) insights.push({ type: "notice", metric: "humidity", message: "Humidity reached 70% or higher." });
      if (aggregate.humidity_min <= 30) insights.push({ type: "notice", metric: "humidity", message: "Humidity reached 30% or lower." });
      if (!insights.length) insights.push({ type: "info", message: "No threshold observations for this period." });
    }
    return json({ device_id: deviceId, days, insights, summary: aggregate });
  }
  return fail(404, "not_found");
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_json") return fail(400, "invalid_json");
      if (error instanceof Error && error.message === "payload_too_large") return fail(413, "payload_too_large");
      console.error("Atmos request failed", error instanceof Error ? error.name : "unknown");
      return fail(500, "internal_error");
    }
  },
};

