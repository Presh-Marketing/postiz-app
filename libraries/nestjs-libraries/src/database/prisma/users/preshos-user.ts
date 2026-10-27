import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export interface PreshosIdentity {
  id: string;
  email: string;
  emailVerified?: boolean;
  ip?: string;
  userAgent?: string;
}
export interface PreshosMembership {
  postizOrgId: string;
  role: 'ADMIN' | 'USER';
}

/** Called only after the authenticated PRESHos membership lookup succeeds. */
export async function provisionPreshosUser(
  tx: Prisma.TransactionClient,
  identity: PreshosIdentity,
  membership: PreshosMembership,
) {
  const denied = () =>
    new ForbiddenException(
      "Your workspace isn't set up yet. Contact your PRESHos administrator.",
    );
  const org = await tx.organization.findFirst({
    where: { id: membership.postizOrgId, deletedAt: null },
  });
  if (!org) throw denied();

  const linked = await tx.user.findMany({
    where: {
      providerName: 'GENERIC',
      providerId: identity.id,
      deletedAt: null,
    },
    take: 2,
  });
  if (linked.length > 1) throw denied();
  let user = linked[0];
  if (!user && identity.emailVerified === true) {
    const matches = await tx.user.findMany({
      where: {
        email: { equals: identity.email, mode: 'insensitive' },
        deletedAt: null,
      },
      take: 2,
    });
    // Never choose an arbitrary account if upstream contains email duplicates.
    if (matches.length > 1) throw denied();
    user = matches[0];
    // A different bound WorkOS identity must not be claimed via email.
    if (user?.providerName === 'GENERIC' && user.providerId !== identity.id)
      throw denied();
  }
  if (!user) {
    user = await tx.user.create({
      data: {
        email: identity.email.toLowerCase(),
        providerName: 'GENERIC',
        providerId: identity.id,
        activated: true,
        timezone: 0,
        ip: identity.ip,
        agent: identity.userAgent,
      },
    });
  }
  // WorkOS verified this mailbox; complete pending email activation when
  // reusing a local account, otherwise the normal auth middleware rejects it.
  if (user.activated === false) {
    if (identity.emailVerified !== true) throw denied();
    user = await tx.user.update({
      where: { id: user.id },
      data: { activated: true },
    });
  }
  await tx.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: user.id, organizationId: org.id },
    },
    create: {
      userId: user.id,
      organizationId: org.id,
      role: membership.role,
      disabled: false,
    },
    update: { role: membership.role, disabled: false },
  });
  return user;
}
