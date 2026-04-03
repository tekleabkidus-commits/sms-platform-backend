import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from './request-context.service';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService extends ConsoleLogger {
  private readonly environment: string;
  private readonly appRole: string;
  private readonly serviceName: string;
  private readonly podName: string | undefined;

  constructor(
    configService: ConfigService,
    private readonly requestContextService: RequestContextService,
  ) {
    super();
    this.environment = configService.getOrThrow<string>('app.environment');
    this.appRole = configService.getOrThrow<string>('app.role');
    this.serviceName = configService.getOrThrow<string>('app.name');
    this.podName = process.env.HOSTNAME;
  }

  log(message: unknown, context?: string): void {
    this.writeEntry('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.writeEntry('error', { message, trace }, context);
  }

  warn(message: unknown, context?: string): void {
    this.writeEntry('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.writeEntry('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.writeEntry('verbose', message, context);
  }

  fatal(message: unknown, trace?: string, context?: string): void {
    this.writeEntry('fatal', { message, trace }, context);
  }

  private writeEntry(level: LogLevel, payload: unknown, context?: string): void {
    const request = this.requestContextService.get();
    const entry = this.sanitize({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      appRole: this.appRole,
      podName: this.podName,
      context,
      requestId: request?.requestId,
      method: request?.method,
      path: request?.path,
      tenantId: request?.tenantId ?? undefined,
      userId: request?.userId ?? undefined,
      apiKeyId: request?.apiKeyId ?? undefined,
      payload,
    });

    const serialized = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal' || level === 'warn') {
      process.stderr.write(`${serialized}\n`);
      return;
    }

    process.stdout.write(`${serialized}\n`);
  }

  private sanitize(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (/(password|secret|token|authorization|cookie)/i.test(key)) {
          output[key] = '[REDACTED]';
          continue;
        }

        output[key] = this.sanitize(nested);
      }
      return output;
    }

    return value;
  }
}
