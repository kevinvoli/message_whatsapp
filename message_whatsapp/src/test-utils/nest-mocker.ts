import { ModuleMocker } from 'jest-mock';

const moduleMocker = new ModuleMocker(global);

export const createMocker = (token: unknown): Record<string, unknown> => {
  if (typeof token === 'function') {
    const metadata = moduleMocker.getMetadata(token as Function);
    if (metadata) {
      return moduleMocker.generateFromMetadata(metadata) as unknown as Record<string, unknown>;
    }
  }

  return {};
};
