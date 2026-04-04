import { Global, Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuditService } from '../src/audit/audit.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { MetricsService } from '../src/common/metrics/metrics.service';
import { DatabaseService } from '../src/database/database.service';

@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useValue: {
        query: jest.fn(),
        withTransaction: jest.fn(),
      },
    },
    {
      provide: AuditService,
      useValue: {
        write: jest.fn(),
      },
    },
    {
      provide: MetricsService,
      useValue: {
        recordAuthEvent: jest.fn(),
      },
    },
  ],
  exports: [DatabaseService, AuditService, MetricsService],
})
class AuthTestGlobalsModule {}

describe('AuthModule', () => {
  it('wires JwtService for AuthService and guard providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              auth: {
                jwtPublicKey: 'public-key',
                jwtPrivateKey: 'private-key',
              },
            }),
          ],
        }),
        AuthTestGlobalsModule,
        AuthModule,
      ],
    }).compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
  });

  it('exports JwtModule so ReauthGuard can be consumed from feature modules', () => {
    const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule) as unknown[] | undefined;

    expect(exportsMetadata).toBeDefined();
    expect(exportsMetadata).toContain(JwtModule);
  });
});
