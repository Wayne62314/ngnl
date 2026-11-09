CREATE TABLE IF NOT EXISTS blobs (
  id TEXT PRIMARY KEY,          -- derived from the sync code; reveals nothing about it
  token_hash TEXT NOT NULL,     -- SHA-256 of the client token
  version INTEGER NOT NULL,     -- bumped on every write, for conflict detection
  data BLOB NOT NULL,           -- AES-GCM ciphertext
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
