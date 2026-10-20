import { createHash, randomBytes } from 'node:crypto';
import { database } from './database';

export interface IssuedActivationToken {
  token: string;
  expiresAt: string;
}

export function issueActivationToken(
  accountId: string,
): IssuedActivationToken {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString();

  database.exec('BEGIN IMMEDIATE');

  try {
    database
      .prepare('DELETE FROM account_activation_tokens WHERE account_id = ?')
      .run(accountId);

    database
      .prepare(`
        INSERT INTO account_activation_tokens
          (token_hash, account_id, expires_at)
        VALUES (?, ?, ?)
      `)
      .run(tokenHash, accountId, expiresAt);

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return { token, expiresAt };
}