jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} }),
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} }),
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
      { getProvider: () => provider } as any,
    ),
    users,
    organizations,
    provider,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(resolvePreshosMembership).mockResolvedValue(membership as any);
});
test('OAuth callback provisions both existing and new users before issuing JWT, bypassing company onboarding', async () => {
  const { auth, users, organizations } = service();
  const result = await auth.checkExists(
    'GENERIC',
    'code',
    undefined,
    'nonce',
    'nonce',
  );
  expect(result).toEqual({
    jwt: 'signed-jwt',
    addedOrg: { organizationId: membership.postizOrgId },
  });
  expect(result).not.toHaveProperty('token');
  expect(users.loginPreshosUser).toHaveBeenCalledWith(
    expect.objectContaining(identity),
    membership,
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
    { orgId: 'unrelated', role: 'ADMIN', id: 'invite' },
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
    auth.checkExists('GENERIC', 'code', undefined, 'nonce', 'nonce'),
  ).rejects.toThrow('workspace not configured');
  expect(users.loginPreshosUser).not.toHaveBeenCalled();
  expect(organizations.createOrgAndUser).not.toHaveBeenCalled();
});
test('invalid OAuth state cannot reach the membership service', async () => {
  const { auth } = service();
  await expect(
    auth.checkExists('GENERIC', 'code', undefined, 'wrong', 'nonce'),
  ).rejects.toThrow('Invalid state');
  expect(resolvePreshosMembership).not.toHaveBeenCalled();
});
