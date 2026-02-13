import { ModuleMocker } from 'jest-mock';

const moduleMocker = new ModuleMocker(global);

export const createMocker = (token: unknown): Record<string, unknown> => {
  if (typeof token === 'function') {
    const metadata = moduleMocker.getMetadata(token as Function);
    if (metadata) {
      const Mock = moduleMocker.generateFromMetadata(metadata);
      return new Mock();
    }
  }

  return {};
};
