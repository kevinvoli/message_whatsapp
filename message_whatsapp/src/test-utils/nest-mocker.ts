import { ModuleMocker } from 'jest-mock';
import { ConfigService } from '@nestjs/config';

const moduleMocker = new ModuleMocker(global);

export const createMocker = (token: unknown): Record<string, unknown> => {
  // ConfigService has generic overloads that jest-mock cannot auto-generate.
  // The mock reads from process.env to preserve test semantics (tests that set
  // process.env.KEY before calling the service continue to work as expected).
  if (token === ConfigService) {
    return {
      get: jest.fn().mockImplementation((key: string) => process.env[key]),
    } as unknown as Record<string, unknown>;
  }

  if (typeof token === 'function') {
    const metadata = moduleMocker.getMetadata(token);
    if (metadata) {
      return moduleMocker.generateFromMetadata(metadata) as unknown as Record<
        string,
        unknown
      >;
    }
  }

  return {};
};
