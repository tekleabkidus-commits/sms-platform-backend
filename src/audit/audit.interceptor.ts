import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_ACTION_KEY } from '../common/decorators/audit.decorator';
import { AuditService } from './audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string | undefined>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!action) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const routePath = (request as AuthenticatedRequest & { route?: { path?: string } }).route?.path;
    const targetId = (request as AuthenticatedRequest & { params?: Record<string, string> }).params?.id;
    const sourceIp = (request as AuthenticatedRequest & { ip?: string }).ip;
    const method = (request as AuthenticatedRequest & { method?: string }).method;
    const originalUrl = (request as AuthenticatedRequest & { originalUrl?: string }).originalUrl;
    const headers = (request as AuthenticatedRequest & { headers?: Record<string, unknown> }).headers ?? {};

    return next.handle().pipe(
      tap(async () => {
        await this.auditService.write({
          tenantId: request.user?.tenantId ?? request.apiPrincipal?.tenantId,
          userId: request.user?.sub,
          apiKeyId: request.apiPrincipal?.apiKeyId,
          action,
          targetType: routePath,
          targetId,
          sourceIp,
          metadata: {
            method,
            path: originalUrl,
            requestId: headers['x-request-id'],
          },
        });
      }),
    );
  }
}
