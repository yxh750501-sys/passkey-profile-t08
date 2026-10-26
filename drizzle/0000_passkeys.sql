CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE credentials (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX credentials_account ON credentials(account_id);
CREATE TABLE challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, account_id TEXT, username TEXT, challenge TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at TEXT NOT NULL);
CREATE TABLE private_items (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), title TEXT NOT NULL, body TEXT NOT NULL);
