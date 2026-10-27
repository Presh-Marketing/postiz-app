import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PreshosMembership } from '@gitroom/nestjs-libraries/database/prisma/users/preshos-user';

export type PreshosWorkspaceChoices = {
  workspaces: Array<{ tenantId: number; name: string }>;
};
export type PreshosMembershipResult =
  | PreshosMembership
  | PreshosWorkspaceChoices;

export async function resolvePreshosMembership(
  identity: { id: string; email: string },
  fetchImpl = fetch,
  tenantId?: number
): Promise<PreshosMembershipResult> {
  const unavailable = () =>
    new ServiceUnavailableException(
      'PRESHos sign-in is temporarily unavailable. Please try again.'
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
        ...(tenantId === undefined ? {} : { tenant_id: tenantId }),
      }),
    });
  } catch {
    throw unavailable();
  }
  if (response.status === 403 || response.status === 404) {
    throw new ForbiddenException(
      "Your workspace isn't set up yet. Ask your PRESHos administrator to check your tenant membership and Social connection."
    );
  }
  if (!response.ok) throw unavailable();
  let result: PreshosMembershipResult;
  try {
    result = await response.json();
  } catch {
    throw unavailable();
  }
  if (!result || typeof result !== 'object') throw unavailable();
  if ('workspaces' in result) {
    if (
      tenantId !== undefined ||
      !Array.isArray(result.workspaces) ||
      result.workspaces.length < 2 ||
      result.workspaces.length > 100 ||
      result.workspaces.some(
        (item) =>
          !item ||
          !Number.isSafeInteger(item.tenantId) ||
          item.tenantId <= 0 ||
          typeof item.name !== 'string' ||
          !item.name ||
          item.name.length > 200
      ) ||
      new Set(result.workspaces.map((item) => item.tenantId)).size !==
        result.workspaces.length
    ) {
      throw unavailable();
    }
    return {
      workspaces: result.workspaces.map(({ tenantId, name }) => ({
        tenantId,
        name,
      })),
    };
  }
  if (
    !result ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
      result.postizOrgId
    ) ||
    !['ADMIN', 'USER'].includes(result.role)
  )
    throw unavailable();
  return result;
}
