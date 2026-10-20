import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { database } from './database';

interface MemberBackup {
  id: string;
  icNo: string;
  name: string;
  email: string;
  phone: string;
  registrationDate: string;
  status: 'active' | 'suspended';
  borrowingLimit: number;
}

function isMemberBackup(value: unknown): value is MemberBackup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  for (const field of [
    'id', 'icNo', 'name', 'email', 'phone', 'registrationDate',
  ]) {
    const text = row[field];
    if (typeof text !== 'string' || text.trim() === '') return false;
  }

  const limit = row['borrowingLimit'];
  return (
    (row['status'] === 'active' || row['status'] === 'suspended') &&
    typeof limit === 'number' &&
    Number.isInteger(limit) &&
    limit >= 0
  );
}

const backupPath = join(__dirname, '..', 'data', 'members-backup.json');
const parsed: unknown = JSON.parse(readFileSync(backupPath, 'utf8'));

if (!Array.isArray(parsed)) {
  throw new Error('The member backup must contain an array.');
}

const members: MemberBackup[] = [];

for (const item of parsed as unknown[]) {
  if (!isMemberBackup(item)) {
    throw new Error('The member backup contains an invalid record.');
  }
  members.push(item);
}

const insert = database.prepare(`
  INSERT INTO members
    (id, ic_no, name, email, phone, registration_date, status, borrowing_limit)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`);

let imported = 0;
database.exec('BEGIN IMMEDIATE');

try {
  for (const member of members) {
    const result = insert.run(
      member.id,
      member.icNo,
      member.name,
      member.email,
      member.phone,
      member.registrationDate,
      member.status,
      member.borrowingLimit,
    );
    imported += Number(result.changes);
  }

  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
}

console.log(`Imported ${imported} of ${members.length} members.`);