import { createHash } from 'node:crypto';
import { database } from './database';
import { hashPassword } from './password';

export type ActivationResult =
  | 'activated'
  | 'invalid-token'
  | 'weak-password';

export async function activateMemberAccount(
  token: string,
  password: string,
): Promise<ActivationResult> {
  if (!/^[0-9a-f]{64}$/.test(token)) return 'invalid-token';

  const passwordLength = Array.from(password).length;
  if (passwordLength < 15 || passwordLength > 1024) {
    return 'weak-password';
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const pending = database.prepare(`
    SELECT t.account_id
    FROM account_activation_tokens t
    JOIN accounts a ON a.id = t.account_id
    JOIN members m ON m.id = a.member_id
    WHERE t.token_hash = ?
      AND t.used_at IS NULL
      AND t.expires_at > ?
      AND a.role = 'member'
      AND a.status = 'pending'
      AND m.status = 'active'
  `).get(tokenHash, new Date().toISOString()) as
    | { account_id: string }
    | undefined;

  if (!pending) return 'invalid-token';

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  database.exec('BEGIN IMMEDIATE');

  try {
    const claimed = database.prepare(`
      UPDATE account_activation_tokens
      SET used_at = ?
      WHERE token_hash = ?
        AND used_at IS NULL
        AND expires_at > ?
      RETURNING account_id
    `).get(now, tokenHash, now) as
      | { account_id: string }
      | undefined;

    if (!claimed || claimed.account_id !== pending.account_id) {
      database.exec('ROLLBACK');
      return 'invalid-token';
    }

    const updated = database.prepare(`
      UPDATE accounts
      SET password_hash = ?, status = 'active'
      WHERE id = ?
        AND role = 'member'
        AND status = 'pending'
        AND member_id IN (
          SELECT id FROM members WHERE status = 'active'
        )
    `).run(passwordHash, claimed.account_id);

    if (Number(updated.changes) !== 1) {
      database.exec('ROLLBACK');
      return 'invalid-token';
    }

    database.exec('COMMIT');
    return 'activated';
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}