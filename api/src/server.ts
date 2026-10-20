import express from 'express';
import './database';
import { activateMemberAccount } from './activate-member';

const app = express();
const port = 3000;

app.use(express.json({ limit: '8kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/auth/activate-member', async (request, response) => {
  const body: unknown = request.body;

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    response.status(400).json({ error: 'Token and password are required.' });
    return;
  }

  const values = body as Record<string, unknown>;
  const { token, password } = values;

  if (typeof token !== 'string' || typeof password !== 'string') {
    response.status(400).json({ error: 'Token and password are required.' });
    return;
  }

  try {
    const result = await activateMemberAccount(token, password);

    if (result === 'weak-password') {
      response.status(400).json({
        error: 'Use a password between 15 and 1024 characters.',
      });
      return;
    }

    if (result === 'invalid-token') {
      response.status(400).json({
        error: 'The activation link is invalid or expired.',
      });
      return;
    }

    response.json({ message: 'Member account activated.' });
  } catch {
    response.status(500).json({ error: 'Could not activate the account.' });
  }
});

app.listen(port, () => {
  console.log(`Library API running at http://localhost:${port}`);
});