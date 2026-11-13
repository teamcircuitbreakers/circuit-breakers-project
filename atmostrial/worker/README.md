# Atmos Cloudflare Worker

An isolated Worker and D1 schema for the Atmos ESP32-C6 + DHT11 project. The backend is deployed at `https://atmos-api.devteam-circuitbreakers.workers.dev`. The single-file dashboard is in `atmostrial/index.html` in `teamcircuitbreakers/circuit-breakers-project`.

## API

- `GET /api/health` — service health.
- `POST /api/devices` — admin-only device registration. Requires `X-Admin-Key`; returns a 256-bit `device_key` once. Only its SHA-256 hash is stored.
- `POST /api/ingest` — ESP32 batch upload. Requires `X-Device-Key`; accepts the firmware's `device_id`, `batch_id`, and `samples` fields. Retries are idempotent by `(device_id, batch_id)`.
- `GET /api/devices` — public device list, excluding credentials.
- `GET /api/devices/:id/latest`
- `GET /api/devices/:id/history?days=7&limit=500`
- `GET /api/devices/:id/analytics?days=7`
- `GET /api/devices/:id/insights?days=7`
- `GET /api/devices/:id/status`

The write payload matches the firmware in the referenced conversation:

```json
{
  "device_id": "atmos-xiao-c6-01",
  "batch_id": "12345-3723450",
  "samples": [
    { "uptime_ms": 60000, "epoch": 0, "temperature_c": 24.5, "humidity_pct": 56.0 }
  ]
}
```

The analytics response includes period-wide min/max/mean values and hourly mean values for charting. The API caps a batch at 240 readings, validates sensor ranges, rejects oversized bodies, and derives timestamps from the sample epoch or relative device uptime when epoch is zero. The public data endpoints are read-only. CORS should name the dashboard's exact origin.

## Local checks

Node.js 20 or newer is recommended.

```sh
npm test
```

## Cloudflare resources

The connected account already has unrelated Workers and `rfid-wallet-db`. The isolated resources created for Atmos are:

- Worker: `atmos-api` at `https://atmos-api.devteam-circuitbreakers.workers.dev`
- D1 database: `atmos-db` (`e523f59e-2e3b-4065-b855-fe5b00758367`, APAC)
- D1 migration: `0001_initial.sql` applied

The dashboard origins were set to the custom site and GitHub Pages origins. `ADMIN_API_KEY` is **not yet configured**, so device registration remains closed until the owner sets it with Wrangler's secret command. Do not commit the key. The endpoint is published and the API read endpoints are available. The live-data dashboard changes are on the `codex/atmos-backend` branch and have not been merged into the site's published branch.

To configure the admin key from a trusted local terminal, run `npx wrangler secret put ADMIN_API_KEY` from this directory, then paste a newly generated high-entropy value into Wrangler's hidden prompt. Configure the ESP32 URL and one-time device key out of band. Register the device with `POST /api/devices`, store the returned key securely on the ESP32, and discard the one-time response.

No credentials are stored in this package. The earlier unrelated Worker and database were not modified.

## Security and operational notes

- No device key or admin secret is placed in source control.
- Device keys are returned once and stored as SHA-256 hashes; rotate by disabling/re-registering through an admin workflow before production use.
- Registration currently rejects duplicate IDs and has no update/disable route; those actions should be added behind admin authentication before managing more than a prototype device.
- Add rate limiting at the Cloudflare edge before public rollout. CORS is not an access control mechanism.
- `status` treats a device as online when its latest sample is within 90 minutes, consistent with the hourly upload cadence.
- The dashboard should call the read endpoints above and present empty states until real measurements arrive; the mock UI was not modified.

