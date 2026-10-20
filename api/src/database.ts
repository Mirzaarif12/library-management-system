import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDirectory = join(__dirname, '..', 'data');
mkdirSync(dataDirectory, { recursive: true });

export const database = new DatabaseSync(
  join(dataDirectory, 'library.sqlite'),
);

database.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    ic_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT NOT NULL,
    registration_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
    borrowing_limit INTEGER NOT NULL CHECK (borrowing_limit >= 0)
  )`
);

database.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    member_id TEXT UNIQUE REFERENCES members(id),
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'member')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
    created_at TEXT NOT NULL,
    CHECK (role != 'member' OR member_id IS NOT NULL),
    CHECK (status != 'active' OR password_hash IS NOT NULL)
  );

  CREATE TABLE IF NOT EXISTS account_activation_tokens (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
`);
