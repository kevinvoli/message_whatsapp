/**
 * Tests unitaires — CallEventApiKeyGuard
 */

import { UnauthorizedException } from '@nestjs/common';
import { CallEventApiKeyGuard } from '../guards/call-event-api-key.guard';

function makeContext(headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as any;
}

describe('CallEventApiKeyGuard', () => {
  const guard = new CallEventApiKeyGuard();
  const originalEnv = process.env.CALL_EVENT_API_KEY;

  afterEach(() => {
    process.env.CALL_EVENT_API_KEY = originalEnv;
  });

  it('laisse passer si CALL_EVENT_API_KEY non configuré (mode dev)', () => {
    delete process.env.CALL_EVENT_API_KEY;
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('autorise si la clé est correcte', () => {
    process.env.CALL_EVENT_API_KEY = 'secret-123';
    expect(guard.canActivate(makeContext({ 'x-api-key': 'secret-123' }))).toBe(true);
  });

  it('rejette si la clé est incorrecte', () => {
    process.env.CALL_EVENT_API_KEY = 'secret-123';
    expect(() => guard.canActivate(makeContext({ 'x-api-key': 'wrong' }))).toThrow(UnauthorizedException);
  });

  it('rejette si le header est absent', () => {
    process.env.CALL_EVENT_API_KEY = 'secret-123';
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });
});
