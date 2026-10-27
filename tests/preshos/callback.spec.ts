jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/farcaster.provider',
  () => ({ FarcasterProvider: class {} }),
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
    checkExists: jest
      .fn()
      .mockResolvedValue({
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
    response,
  );
  expect(service.checkExists).toHaveBeenCalledWith(
    'GENERIC',
    'code',
    undefined,
    'nonce',
    'nonce',
  );
  expect(response.cookie).toHaveBeenCalledWith(
    'showorg',
    'tenant-workspace',
    expect.objectContaining({ httpOnly: true, secure: true }),
  );
  expect(response.cookie).toHaveBeenCalledWith(
    'auth',
    'fixture-jwt',
    expect.objectContaining({ httpOnly: true, secure: true }),
  );
  expect(response.header).toHaveBeenCalledWith('reload', 'true');
  expect(response.json).toHaveBeenCalledWith({ login: true });
});
