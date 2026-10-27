import { ForbiddenException } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import type { PreshosIdentity } from '@gitroom/nestjs-libraries/database/prisma/users/preshos-user';

const audience = 'preshos-workspace-selection';
const signingKey = () => {
  if (!process.env.JWT_SECRET)
    throw new Error('PRESHos sign-in is unavailable.');
  // Domain separation prevents this pending assertion from being a Postiz JWT.
  return createHmac('sha256', process.env.JWT_SECRET).update(audience).digest();
};

/** A short-lived, OAuth-browser-bound identity assertion; never an app session. */
export function createPreshosChoice(identity: PreshosIdentity, state: string) {
  return sign(
    {
      identity: {
        id: identity.id,
        email: identity.email,
        emailVerified: identity.emailVerified === true,
      },
      state,
    },
    signingKey(),
    { algorithm: 'HS256', audience, expiresIn: '5m' }
  );
}

export function readPreshosChoice(
  token: string,
  stateCookie?: string
): PreshosIdentity {
  const denied = () =>
    new ForbiddenException('Your sign-in expired. Please sign in again.');
  if (typeof token !== 'string' || token.length > 8192 || !stateCookie)
    throw denied();
  try {
    const value = verify(token, signingKey(), {
      audience,
      algorithms: ['HS256'],
    });
    if (
      typeof value === 'string' ||
      !Number.isInteger(value.exp) ||
      value.state !== stateCookie ||
      !value.identity ||
      typeof value.identity.id !== 'string' ||
      typeof value.identity.email !== 'string' ||
      typeof value.identity.emailVerified !== 'boolean'
    )
      throw denied();
    return {
      id: value.identity.id,
      email: value.identity.email,
      emailVerified: value.identity.emailVerified,
    };
  } catch {
    throw denied();
  }
}
