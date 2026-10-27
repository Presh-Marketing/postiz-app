import { resolvePreshosMembership } from '../../apps/backend/src/services/auth/preshos-membership';
import { provisionPreshosUser } from '../../libraries/nestjs-libraries/src/database/prisma/users/preshos-user';
const membership = {
  postizOrgId: '11111111-2222-4333-8444-555555555555',
  role: 'ADMIN' as const,
};
const identity = {
  id: 'user_0123456789ABCDEF',
  email: 'person@example.test',
  emailVerified: true,
};
function database(linked: any[] = [], matches: any[] = []) {
  const tx = {
    organization: {
      findFirst: jest.fn().mockResolvedValue({ id: membership.postizOrgId }),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(linked)
        .mockResolvedValueOnce(matches),
      create: jest.fn().mockResolvedValue({ id: 'new-user' }),
    },
    userOrganization: { upsert: jest.fn().mockResolvedValue({}) },
  };
  return tx;
}
beforeEach(() => {
  process.env.PRESHOS_MEMBERSHIP_URL =
    'https://preshos.example.test/api/v1/social/postiz-membership';
  process.env.PRESHOS_MEMBERSHIP_SECRET = 'test-only-secret-'.repeat(4);
});
test('existing provider user joins exactly the tenant org and refreshes role', async () => {
  const tx = database([{ id: 'existing' }]);
  expect((await provisionPreshosUser(tx as any, identity, membership)).id).toBe(
    'existing'
  );
  expect(tx.user.create).not.toHaveBeenCalled();
  expect(tx.userOrganization.upsert).toHaveBeenCalledWith({
    where: {
      userId_organizationId: {
        userId: 'existing',
        organizationId: membership.postizOrgId,
      },
    },
    create: {
      userId: 'existing',
      organizationId: membership.postizOrgId,
      role: 'ADMIN',
      disabled: false,
    },
    update: { role: 'ADMIN', disabled: false },
  });
});
test('new OAuth identity reuses verified email without overwriting existing credentials', async () => {
  const tx = database([], [{ id: 'local-user', providerName: 'LOCAL' }]);
  expect((await provisionPreshosUser(tx as any, identity, membership)).id).toBe(
    'local-user'
  );
  expect(tx.user.create).not.toHaveBeenCalled();
  expect(tx.user.findMany.mock.calls[1][0].where.email).toEqual({
    equals: identity.email,
    mode: 'insensitive',
  });
});
test('new user without email match is created with membership and no personal organization', async () => {
  const tx = database();
  await provisionPreshosUser(tx as any, identity, membership);
  expect(tx.user.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      providerId: identity.id,
      providerName: 'GENERIC',
      activated: true,
      timezone: 0,
    }),
  });
  expect(tx.user.create.mock.calls[0][0].data).not.toHaveProperty(
    'organizations'
  );
  expect(
    tx.userOrganization.upsert.mock.calls[0][0].create.organizationId
  ).toBe(membership.postizOrgId);
});
test('unverified email cannot take over an existing account', async () => {
  const tx = database([], [{ id: 'local-user' }]);
  await provisionPreshosUser(
    tx as any,
    { ...identity, emailVerified: false },
    membership
  );
  expect(tx.user.findMany).toHaveBeenCalledTimes(1);
  expect(tx.user.create).toHaveBeenCalled();
});
test('missing Postiz workspace causes no user or membership write', async () => {
  const tx = database();
  tx.organization.findFirst.mockResolvedValue(null);
  await expect(
    provisionPreshosUser(tx as any, identity, membership)
  ).rejects.toThrow("workspace isn't set up yet");
  expect(tx.user.create).not.toHaveBeenCalled();
  expect(tx.userOrganization.upsert).not.toHaveBeenCalled();
});
test('ambiguous email and another bound WorkOS id are refused', async () => {
  for (const matches of [
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'a', providerName: 'GENERIC', providerId: 'another' }],
  ]) {
    const tx = database([], matches);
    await expect(
      provisionPreshosUser(tx as any, identity, membership)
    ).rejects.toThrow();
    expect(tx.userOrganization.upsert).not.toHaveBeenCalled();
  }
});
for (const status of [403, 404])
  test(`no tenant / no configured workspace (${status}) refuses sign-in`, async () => {
    await expect(
      resolvePreshosMembership(
        identity,
        jest.fn().mockResolvedValue(new Response('{}', { status }))
      )
    ).rejects.toThrow("workspace isn't set up yet");
  });
test('only sends identity by POST with secret header and rejects redirects', async () => {
  const request = jest.fn().mockResolvedValue(Response.json(membership));
  expect(await resolvePreshosMembership(identity, request)).toEqual(membership);
  const [url, init] = request.mock.calls[0];
  expect(String(url)).not.toContain(identity.email);
  expect(init.method).toBe('POST');
  expect(init.redirect).toBe('error');
  expect(init.headers['x-preshos-membership-secret']).toBe(
    process.env.PRESHOS_MEMBERSHIP_SECRET
  );
  expect(JSON.parse(init.body)).toEqual({
    workos_user_id: identity.id,
    email: identity.email,
  });
});
test('misconfiguration, outages and malformed responses fail closed', async () => {
  const request = jest.fn();
  delete process.env.PRESHOS_MEMBERSHIP_SECRET;
  await expect(resolvePreshosMembership(identity, request)).rejects.toThrow(
    'temporarily unavailable'
  );
  expect(request).not.toHaveBeenCalled();
  process.env.PRESHOS_MEMBERSHIP_SECRET = 'test-only-secret-'.repeat(4);
  for (const result of [
    Response.json({}, { status: 429 }),
    Response.json({ ...membership, role: 'SUPERADMIN' }),
    Response.json({ postizOrgId: 'bad', role: 'USER' }),
  ]) {
    await expect(
      resolvePreshosMembership(identity, jest.fn().mockResolvedValue(result))
    ).rejects.toThrow('temporarily unavailable');
  }
});

test('workspace choices contain only validated tenant IDs and names', async () => {
  const workspaces = [
    { tenantId: 42, name: 'First tenant' },
    { tenantId: 84, name: 'Second tenant' },
  ];
  expect(
    await resolvePreshosMembership(
      identity,
      jest.fn().mockResolvedValue(Response.json({ workspaces }))
    )
  ).toEqual({ workspaces });
  for (const invalid of [
    [],
    [{ tenantId: -1, name: 'Invalid' }],
    [workspaces[0], workspaces[0]],
  ]) {
    await expect(
      resolvePreshosMembership(
        identity,
        jest.fn().mockResolvedValue(Response.json({ workspaces: invalid }))
      )
    ).rejects.toThrow('temporarily unavailable');
  }
});
test('selected tenant is sent back to PRESHos and a second choice list is refused', async () => {
  const request = jest.fn().mockResolvedValue(Response.json(membership));
  await resolvePreshosMembership(identity, request, 84);
  expect(JSON.parse(request.mock.calls[0][1].body).tenant_id).toBe(84);
  await expect(
    resolvePreshosMembership(
      identity,
      jest.fn().mockResolvedValue(
        Response.json({
          workspaces: [
            { tenantId: 42, name: 'First' },
            { tenantId: 84, name: 'Second' },
          ],
        })
      ),
      84
    )
  ).rejects.toThrow('temporarily unavailable');
});

test('verified email completes pending local email activation', async () => {
  const tx = database(
    [],
    [{ id: 'local-user', providerName: 'LOCAL', activated: false }]
  );
  const update = jest
    .fn()
    .mockResolvedValue({ id: 'local-user', activated: true });
  (tx.user as any).update = update;
  await provisionPreshosUser(tx as any, identity, membership);
  expect(update).toHaveBeenCalledWith({
    where: { id: 'local-user' },
    data: { activated: true },
  });
});
