import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PreshosMembership } from '@gitroom/nestjs-libraries/database/prisma/users/preshos-user';

export async function resolvePreshosMembership(
  identity: { id: string; email: string },
  fetchImpl = fetch,
): Promise<PreshosMembership> {
  const unavailable = () =>
    new ServiceUnavailableException(
      'PRESHos sign-in is temporarily unavailable. Please try again.',
    );
  const {
    PRESHOS_MEMBERSHIP_URL: endpoint,
    PRESHOS_MEMBERSHIP_SECRET: secret,
  } = process.env;
  if (!endpoint || !secret || secret.length < 32) throw unavailable();
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw unavailable();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/api/v1/social/postiz-membership'
  )
    throw unavailable();
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'x-preshos-membership-secret': secret,
      },
      body: JSON.stringify({
        workos_user_id: identity.id,
        email: identity.email,
      }),
    });
  } catch {
    throw unavailable();
  }
  if (response.status === 403 || response.status === 404) {
    throw new ForbiddenException(
      "Your workspace isn't set up yet. Ask your PRESHos administrator to check your tenant membership and Social connection.",
    );
  }
  if (!response.ok) throw unavailable();
  let result: PreshosMembership;
  try {
    result = await response.json();
  } catch {
    throw unavailable();
  }
  if (
    !result ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
      result.postizOrgId,
    ) ||
    !['ADMIN', 'USER'].includes(result.role)
  )
    throw unavailable();
  return result;
}
