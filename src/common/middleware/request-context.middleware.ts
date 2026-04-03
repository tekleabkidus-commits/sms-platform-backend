import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AppLoggerService } from '../logging/app-logger.service';
import { RequestContextService } from '../logging/request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly logger: AppLoggerService,
  ) {}

  use(
    request: Request & { user?: { sub?: string; tenantId?: string }; apiPrincipal?: { apiKeyId?: string; tenantId?: string } },
    response: Response,
    next: NextFunction,
  ): void {
    const requestId = request.headers['x-request-id']?.toString() ?? randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);
    const startedAt = Date.now();

    this.requestContextService.run({
      requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
    }, () => {
      response.on('finish', () => {
        this.requestContextService.update({
          tenantId: request.user?.tenantId ?? request.apiPrincipal?.tenantId,
          userId: request.user?.sub,
          apiKeyId: request.apiPrincipal?.apiKeyId,
        });

        this.logger.log({
          event: 'http_request_completed',
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          tenantId: request.user?.tenantId ?? request.apiPrincipal?.tenantId,
          userId: request.user?.sub,
          apiKeyId: request.apiPrincipal?.apiKeyId,
          userAgent: request.headers['user-agent'],
        }, 'HTTP');
      });

      next();
    });
  }
}
