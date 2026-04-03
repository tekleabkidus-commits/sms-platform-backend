import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AppLoggerService } from './common/logging/app-logger.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './audit/audit.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const apiPrefix = configService.getOrThrow<string>('apiPrefix');
  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  app.use(helmet());
  app.getHttpAdapter().getInstance().set('trust proxy', configService.get<boolean>('app.trustProxy'));
  const allowedOrigins = configService.get<string[]>('app.corsAllowedOrigins') ?? [];
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
      exposedHeaders: ['x-request-id'],
    });
  }
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  app.useGlobalGuards(app.get(JwtAuthGuard), app.get(RolesGuard));
  app.useGlobalInterceptors(app.get(AuditInterceptor));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SMS Platform Backend')
    .setDescription('Carrier-grade SMS SaaS API with templates, routing, campaigns, analytics, and fraud controls.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(
    configService.getOrThrow<number>('app.port'),
    configService.getOrThrow<string>('app.host'),
  );
  logger.log({
    event: 'app_started',
    apiPrefix,
    port: configService.getOrThrow<number>('app.port'),
    host: configService.getOrThrow<string>('app.host'),
    role: configService.getOrThrow<string>('app.role'),
  }, 'Bootstrap');
}

bootstrap();
