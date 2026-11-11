import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CONSOLE_TOKEN_PARAM } from './hostProtocol';

export const createConsoleToken = (): string => randomBytes(24).toString('base64url');

export const hasConsoleToken = (url: URL, token: string): boolean => {
  const given = url.searchParams.get(CONSOLE_TOKEN_PARAM);

  if (given === null) return false;

  const expected = Buffer.from(token);
  const actual = Buffer.from(given);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
