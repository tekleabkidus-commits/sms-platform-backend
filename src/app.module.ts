import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import configuration from './config/configuration';
import { configurationValidationSchema } from './config/validation';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { HttpMetricsMiddleware } from './common/middleware/http-metrics.middleware';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { DatabaseModule } from './database/database.module';
import { DlrModule } from './dlr/dlr.module';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { MessagesModule } from './messages/messages.module';
import { OutboxModule } from './outbox/outbox.module';
import { ProvidersModule } from './providers/providers.module';
import { RedisModule } from './redis/redis.module';
import { RoutingModule } from './routing/routing.module';
import { SenderIdsModule } from './sender-ids/sender-ids.module';
import { TemplatesModule } from './templates/templates.module';
import { FraudModule } from './fraud/fraud.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configurationValidationSchema,
    }),
    JwtModule.register({}),
    DatabaseModule,
    RedisModule,
    KafkaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    TemplatesModule,
    RoutingModule,
    FraudModule,
    SenderIdsModule,
    ProvidersModule,
    OutboxModule,
    MessagesModule,
    AnalyticsModule,
    CampaignsModule,
    DlrModule,
  ],
  providers: [JwtAuthGuard, RolesGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, HttpMetricsMiddleware).forRoutes('*');
  }
}
