import { decode, sign, verify } from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import {
  createPreshosChoice,
  readPreshosChoice,
} from '../../apps/backend/src/services/auth/preshos-workspace-choice';

const identity = {
  id: 'user_0123456789ABCDEF',
  email: 'person@example.test',
  emailVerified: true,
};
beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-workspace-choice-signing-secret';
});
test('choice token is short-lived, purpose-scoped, and bound to the OAuth browser', () => {
  const token = createPreshosChoice(identity, 'browser-nonce');
  expect(readPreshosChoice(token, 'browser-nonce')).toEqual(identity);
  const value = decode(token) as any;
  expect(value.exp - value.iat).toBe(300);
  expect(value.aud).toBe('preshos-workspace-selection');
  expect(value).not.toHaveProperty('id');
  expect(() => verify(token, process.env.JWT_SECRET!)).toThrow();
  expect(() => readPreshosChoice(token, 'another-browser')).toThrow();
  expect(() => readPreshosChoice(token)).toThrow();
  expect(() =>
    readPreshosChoice(token + 'tampered', 'browser-nonce')
  ).toThrow();
});
test('expired, wrong-purpose and malformed identity assertions are refused', () => {
  for (const payload of [
    { identity, state: 'nonce', aud: 'preshos-workspace-selection', exp: 1 },
    { identity, state: 'nonce', aud: 'different-purpose' },
    { identity, state: 'nonce', aud: 'preshos-workspace-selection' },
    { identity: {}, state: 'nonce', aud: 'preshos-workspace-selection' },
  ]) {
    expect(() =>
      readPreshosChoice(
        sign(
          payload,
          createHmac('sha256', process.env.JWT_SECRET!)
            .update('preshos-workspace-selection')
            .digest()
        ),
        'nonce'
      )
    ).toThrow();
  }
});
