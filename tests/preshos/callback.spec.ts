jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/farcaster.provider',
  () => ({ FarcasterProvider: class {} })
);
jest.mock('@gitroom/nestjs-libraries/throttler/throttler.provider', () => ({
  ThrottlerRealIpGuard: class {},
}));
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));
import { AuthController } from '../../apps/backend/src/api/routes/auth.controller';

test('OAuth callback sets the mapped workspace cookie with the auth cookie', async () => {
  process.env.FRONTEND_URL = 'https://social.example.test';
  delete process.env.NOT_SECURED;
  const service = {
    checkExists: jest.fn().mockResolvedValue({
      jwt: 'fixture-jwt',
      addedOrg: { organizationId: 'tenant-workspace' },
    }),
  };
  const response: any = {
    cookie: jest.fn(),
    header: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn(),
  };
  await new AuthController(service as any, {} as any).oauthExists(
    {
      headers: { 'content-type': 'application/json' },
      cookies: { oauth_state: 'nonce' },
    } as any,
    'code',
    undefined as any,
    'nonce',
    'GENERIC',
    response
  );
  expect(service.checkExists).toHaveBeenCalledWith(
    'GENERIC',
    'code',
    undefined,
    'nonce',
    'nonce'
  );
  expect(response.cookie).toHaveBeenCalledWith(
    'showorg',
    'tenant-workspace',
    expect.objectContaining({ httpOnly: true, secure: true })
  );
  expect(response.cookie).toHaveBeenCalledWith(
    'auth',
    'fixture-jwt',
    expect.objectContaining({ httpOnly: true, secure: true })
  );
  expect(response.header).toHaveBeenCalledWith('reload', 'true');
  expect(response.json).toHaveBeenCalledWith({ login: true });
});

test('choice response cannot issue an application session before selection', async () => {
  const result = {
    workspaces: [
      { tenantId: 42, name: 'First' },
      { tenantId: 84, name: 'Second' },
    ],
    selectionToken: 'short-lived-choice',
  };
  const service = { checkExists: jest.fn().mockResolvedValue(result) };
  const response: any = {
    cookie: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  await new AuthController(service as any, {} as any).oauthExists(
    {
      headers: { 'content-type': 'application/json' },
      cookies: { oauth_state: 'nonce' },
    } as any,
    'code',
    undefined as any,
    'nonce',
    'GENERIC',
    response
  );
  expect(response.json).toHaveBeenCalledWith(result);
  expect(response.cookie).not.toHaveBeenCalled();
});
test('selection uses only the signed challenge, selected tenant, and browser nonce', async () => {
  process.env.FRONTEND_URL = 'https://social.example.test';
  const service = {
    selectPreshosWorkspace: jest
      .fn()
      .mockResolvedValue({
        jwt: 'fixture-jwt',
        addedOrg: { organizationId: 'selected-workspace' },
      }),
  };
  const response: any = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    header: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  await new AuthController(service as any, {} as any).selectPreshosWorkspace(
    {
      headers: { 'content-type': 'application/json' },
      cookies: { oauth_state: 'nonce' },
    } as any,
    'signed-choice',
    84,
    response
  );
  expect(service.selectPreshosWorkspace).toHaveBeenCalledWith(
    'signed-choice',
    84,
    'nonce'
  );
  expect(response.cookie).toHaveBeenCalledWith(
    'showorg',
    'selected-workspace',
    expect.objectContaining({ httpOnly: true })
  );
  expect(response.clearCookie).toHaveBeenCalledWith(
    'oauth_state',
    expect.any(Object)
  );
});
