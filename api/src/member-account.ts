import { randomUUID } from 'node:crypto';
import { issueActivationToken } from './activation-token';
import { database } from './database';

interface MemberRow {
  email: string;
  status: 'active' | 'suspended';
}

interface AccountRow {
  id: string;
  status: 'pending' | 'active' | 'disabled';
}

export function prepareMemberActivation(memberId: string) {
  const member = database
    .prepare('SELECT email, status FROM members WHERE id = ?')
    .get(memberId) as MemberRow | undefined;

  if (!member) throw new Error('Member not found.');
  if (member.status !== 'active') {
    throw new Error('A suspended member cannot activate an account.');
  }

  const account = database
    .prepare('SELECT id, status FROM accounts WHERE member_id = ?')
    .get(memberId) as AccountRow | undefined;

  if (account && account.status !== 'pending') {
    throw new Error('This member already has an account.');
  }

  const accountId = account?.id ?? randomUUID();

  if (account) {
    database
      .prepare('UPDATE accounts SET email = ? WHERE id = ?')
      .run(member.email, accountId);
  } else {
    database
      .prepare(`
        INSERT INTO accounts
          (id, member_id, email, role, status, created_at)
        VALUES (?, ?, ?, 'member', 'pending', ?)
      `)
      .run(accountId, memberId, member.email, new Date().toISOString());
  }

  const { token, expiresAt } = issueActivationToken(accountId);
  return { email: member.email, token, expiresAt };
}