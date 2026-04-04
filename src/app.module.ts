import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import configuration from './config/configuration';
import { configurationValidationSchema } from './config/validation';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ComplianceModule } from './compliance/compliance.module';
import { HttpMetricsMiddleware } from './common/middleware/http-metrics.middleware';
import { LoggingModule } from './common/logging/logging.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { ContactsModule } from './contacts/contacts.module';
import { DatabaseModule } from './database/database.module';
import { DlrModule } from './dlr/dlr.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OperationsModule } from './operations/operations.module';
import { OutboxModule } from './outbox/outbox.module';
import { ProvidersModule } from './providers/providers.module';
import { RedisModule } from './redis/redis.module';
import { RoutingModule } from './routing/routing.module';
import { SenderIdsModule } from './sender-ids/sender-ids.module';
import { TemplatesModule } from './templates/templates.module';
import { FraudModule } from './fraud/fraud.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { SecretsModule } from './secrets/secrets.module';
import { SearchModule } from './search/search.module';
import { WalletsModule } from './wallets/wallets.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RuntimeModule } from './runtime/runtime.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configurationValidationSchema,
    }),
    JwtModule.register({}),
    RuntimeModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    KafkaModule,
    SecretsModule,
    AuditModule,
    HealthModule,
    AuthModule,
    ComplianceModule,
    ContactsModule,
    TemplatesModule,
    DashboardModule,
    SearchModule,
    NotificationsModule,
    RoutingModule,
    FraudModule,
    SenderIdsModule,
    ProvidersModule,
    OutboxModule,
    MessagesModule,
    AnalyticsModule,
    CampaignsModule,
    WalletsModule,
    OperationsModule,
    DlrModule,
    ReconciliationModule,
  ],
  providers: [JwtAuthGuard, RolesGuard, GlobalExceptionFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, HttpMetricsMiddleware).forRoutes('*');
  }
}
