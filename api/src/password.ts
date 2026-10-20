import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 32;
const options = {
  N: 131_072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
};

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt-v1:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const match = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{64})$/.exec(storedHash);
  if (!match) return false;

  const salt = Buffer.from(match[1], 'hex');
  const expectedKey = Buffer.from(match[2], 'hex');
  const actualKey = await deriveKey(password, salt);

  return timingSafeEqual(actualKey, expectedKey);
}