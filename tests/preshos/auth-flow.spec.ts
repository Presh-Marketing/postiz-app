jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/newsletter/newsletter.service', () => ({
  NewsletterService: class {},
}));
jest.mock('@gitroom/backend/services/auth/providers/providers.manager', () => ({
  AuthProviderManager: class {},
}));
jest.mock('@gitroom/helpers/auth/auth.service', () => ({
  AuthService: { signJWT: jest.fn(() => 'signed-jwt') },
}));
jest.mock('../../apps/backend/src/services/auth/preshos-membership', () => ({
  resolvePreshosMembership: jest.fn(),
}));
import { AuthService } from '../../apps/backend/src/services/auth/auth.service';
import { resolvePreshosMembership } from '../../apps/backend/src/services/auth/preshos-membership';
import { Provider } from '@prisma/client';
const identity = {
  id: 'user_0123456789ABCDEF',
  email: 'person@example.test',
  emailVerified: true,
};
const membership = {
  postizOrgId: '11111111-2222-4333-8444-555555555555',
  role: 'USER',
};
function service() {
  const users = {
    loginPreshosUser: jest
      .fn()
      .mockResolvedValue({ id: 'existing-or-new', email: identity.email }),
    getUserByProvider: jest.fn(),
  };
  const organizations = {
    createOrgAndUser: jest.fn(),
    addUserToOrg: jest.fn(),
  };
  const provider = {
    getUser: jest.fn().mockResolvedValue(identity),
    getToken: jest.fn().mockResolvedValue('provider-token'),
  };
  return {
    auth: new AuthService(
      users as any,
      organizations as any,
      {} as any,
      { getProvider: () => provider } as any
    ),
    users,
    organizations,
    provider,
  };
}
beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-workspace-choice-signing-secret';
  jest.clearAllMocks();
  jest.mocked(resolvePreshosMembership).mockResolvedValue(membership as any);
});
test('multiple tenants require a choice without creating a user or session', async () => {
  const { auth, users, organizations } = service();
  const workspaces = [
    { tenantId: 42, name: 'First' },
    { tenantId: 84, name: 'Second' },
  ];
  jest.mocked(resolvePreshosMembership).mockResolvedValueOnce({ workspaces });
  const result = await auth.checkExists(
    'GENERIC',
    'code',
    undefined,
    'nonce',
    'nonce'
  );
  expect(result).toEqual({ workspaces, selectionToken: expect.any(String) });
  expect(result).not.toHaveProperty('jwt');
  expect(users.loginPreshosUser).not.toHaveBeenCalled();
  expect(organizations.createOrgAndUser).not.toHaveBeenCalled();
  const selected = await auth.selectPreshosWorkspace(
    (result as any).selectionToken,
    84,
    'nonce'
  );
  expect(resolvePreshosMembership).toHaveBeenLastCalledWith(
    identity,
    undefined,
    84
  );
  expect(selected.addedOrg.organizationId).toBe(membership.postizOrgId);
  expect(users.loginPreshosUser).toHaveBeenCalledTimes(1);
});
test('revoked tenant selection cannot create a user or session', async () => {
  const { auth, users } = service();
  jest.mocked(resolvePreshosMembership).mockResolvedValueOnce({
    workspaces: [
      { tenantId: 42, name: 'First' },
      { tenantId: 84, name: 'Second' },
    ],
  });
  const result = await auth.checkExists(
    'GENERIC',
    'code',
    undefined,
    'nonce',
    'nonce'
  );
  jest
    .mocked(resolvePreshosMembership)
    .mockRejectedValueOnce(new Error('membership revoked'));
  await expect(
    auth.selectPreshosWorkspace((result as any).selectionToken, 84, 'nonce')
  ).rejects.toThrow('membership revoked');
  expect(users.loginPreshosUser).not.toHaveBeenCalled();
});
test('OAuth callback provisions both existing and new users before issuing JWT, bypassing company onboarding', async () => {
  const { auth, users, organizations } = service();
  const result = await auth.checkExists(
    'GENERIC',
    'code',
    undefined,
    'nonce',
    'nonce'
  );
  expect(result).toEqual({
    jwt: 'signed-jwt',
    addedOrg: { organizationId: membership.postizOrgId },
  });
  expect(result).not.toHaveProperty('token');
  expect(users.loginPreshosUser).toHaveBeenCalledWith(
    expect.objectContaining(identity),
    membership
  );
  expect(organizations.createOrgAndUser).not.toHaveBeenCalled();
});
test('direct generic login ignores invitation cookie and selects the PRESHos-mapped workspace', async () => {
  const { auth, organizations } = service();
  const result = await auth.routeAuth(
    Provider.GENERIC,
    { providerToken: 'token' } as any,
    '',
    '',
    { orgId: 'unrelated', role: 'ADMIN', id: 'invite' }
  );
  expect(result.addedOrg).toEqual({ organizationId: membership.postizOrgId });
  expect(organizations.addUserToOrg).not.toHaveBeenCalled();
});
test('membership rejection prevents all user/org writes and JWT creation', async () => {
  const { auth, users, organizations } = service();
  jest
    .mocked(resolvePreshosMembership)
    .mockRejectedValue(new Error('workspace not configured'));
  await expect(
    auth.checkExists('GENERIC', 'code', undefined, 'nonce', 'nonce')
  ).rejects.toThrow('workspace not configured');
  expect(users.loginPreshosUser).not.toHaveBeenCalled();
  expect(organizations.createOrgAndUser).not.toHaveBeenCalled();
});
test('invalid OAuth state cannot reach the membership service', async () => {
  const { auth } = service();
  await expect(
    auth.checkExists('GENERIC', 'code', undefined, 'wrong', 'nonce')
  ).rejects.toThrow('Invalid state');
  expect(resolvePreshosMembership).not.toHaveBeenCalled();
});
