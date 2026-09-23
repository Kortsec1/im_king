CREATE TABLE IF NOT EXISTS dataset_samples (
 sample_id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL,
 metadata TEXT NOT NULL,
 detail TEXT NOT NULL,
 record TEXT NOT NULL,
 image BLOB NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dataset_samples_item ON dataset_samples(item_id, created_at);
CREATE TABLE IF NOT EXISTS dataset_photo_exclusions (
 sample_id TEXT PRIMARY KEY, item_id TEXT NOT NULL, removed_at INTEGER NOT NULL, removed_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dataset_metadata (
 item_id TEXT PRIMARY KEY, name TEXT NOT NULL, group_name TEXT NOT NULL, description TEXT NOT NULL,
 updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL
);
