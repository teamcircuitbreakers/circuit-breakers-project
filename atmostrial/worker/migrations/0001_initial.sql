CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE batches (
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count BETWEEN 1 AND 240),
  received_at TEXT NOT NULL,
  PRIMARY KEY (device_id, batch_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE readings (
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  sample_index INTEGER NOT NULL CHECK (sample_index BETWEEN 0 AND 239),
  observed_at TEXT NOT NULL,
  uptime_ms INTEGER NOT NULL CHECK (uptime_ms >= 0),
  temperature_c REAL NOT NULL CHECK (temperature_c BETWEEN -40 AND 85),
  humidity_pct REAL NOT NULL CHECK (humidity_pct BETWEEN 0 AND 100),
  PRIMARY KEY (device_id, batch_id, sample_index),
  FOREIGN KEY (device_id, batch_id) REFERENCES batches(device_id, batch_id) ON DELETE CASCADE
);

CREATE INDEX readings_device_observed ON readings(device_id, observed_at DESC);
CREATE INDEX batches_received ON batches(received_at DESC);

