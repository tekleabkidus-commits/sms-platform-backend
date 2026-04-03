import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretsService {
  constructor(private readonly configService: ConfigService) {}

  private allowPlainTextSecrets(): boolean {
    const nodeEnv = this.configService.get<string>('nodeEnv');
    const allowInsecurePlainText = this.configService.get<boolean>('secrets.allowInsecurePlainText');
    return ['development', 'test'].includes(nodeEnv ?? '') && Boolean(allowInsecurePlainText);
  }

  resolveSecret(secretRef: string): string {
    if (secretRef.startsWith('env:')) {
      const envName = secretRef.slice(4);
      const value = process.env[envName];
      if (!value) {
        throw new InternalServerErrorException(`Missing secret in environment: ${envName}`);
      }
      return value;
    }

    if (secretRef.startsWith('base64:')) {
      return Buffer.from(secretRef.slice(7), 'base64').toString('utf8');
    }

    if (secretRef.startsWith('plain:')) {
      if (!this.allowPlainTextSecrets()) {
        throw new InternalServerErrorException(
          'plain: secret references are disabled outside explicit development/test configurations',
        );
      }
      return secretRef.slice(6);
    }

    if (this.configService.get<string>('nodeEnv') === 'production') {
      throw new InternalServerErrorException('Unqualified secret references are not allowed in production');
    }

    return secretRef;
  }
}
