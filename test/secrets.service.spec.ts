import { InternalServerErrorException } from '@nestjs/common';
import { SecretsService } from '../src/secrets/secrets.service';

describe('SecretsService', () => {
  const buildService = (nodeEnv: string, allowPlain = false) => new SecretsService({
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'nodeEnv') {
        return nodeEnv;
      }
      if (key === 'secrets.allowInsecurePlainText') {
        return allowPlain;
      }
      return undefined;
    }),
  } as never);

  it('allows plain secrets only in explicit development/test mode', () => {
    const service = buildService('development', true);
    expect(service.resolveSecret('plain:secret-value')).toBe('secret-value');
  });

  it('rejects plain secrets in production', () => {
    const service = buildService('production', false);
    expect(() => service.resolveSecret('plain:secret-value')).toThrow(InternalServerErrorException);
  });

  it('continues to resolve env and base64 secret modes', () => {
    process.env.TEST_SECRET_ENV = 'from-env';
    const service = buildService('production', false);

    expect(service.resolveSecret('env:TEST_SECRET_ENV')).toBe('from-env');
    expect(service.resolveSecret(`base64:${Buffer.from('hello', 'utf8').toString('base64')}`)).toBe('hello');
  });
});
