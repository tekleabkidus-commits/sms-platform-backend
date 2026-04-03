import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, from, map, mergeMap, throwError } from 'rxjs';
import { AUDIT_ACTION_KEY } from '../common/decorators/audit.decorator';
import { AuditService } from './audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  private buildAuditEntry(context: ExecutionContext): {
    request: AuthenticatedRequest;
    payload: Parameters<AuditService['write']>[0];
  } {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const routePath = (request as AuthenticatedRequest & { route?: { path?: string } }).route?.path;
    const targetId = (request as AuthenticatedRequest & { params?: Record<string, string> }).params?.id;
    const sourceIp = (request as AuthenticatedRequest & { ip?: string }).ip;
    const method = (request as AuthenticatedRequest & { method?: string }).method;
    const originalUrl = (request as AuthenticatedRequest & { originalUrl?: string }).originalUrl;
    const headers = (request as AuthenticatedRequest & { headers?: Record<string, unknown> }).headers ?? {};
    const action = this.reflector.getAllAndOverride<string | undefined>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return {
      request,
      payload: {
        tenantId: request.user?.tenantId ?? request.apiPrincipal?.tenantId,
        userId: request.user?.sub,
        apiKeyId: request.apiPrincipal?.apiKeyId,
        action: action ?? 'unknown',
        targetType: routePath,
        targetId,
        sourceIp,
        metadata: {
          method,
          path: originalUrl,
          requestId: headers['x-request-id'],
        },
      },
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string | undefined>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!action) {
      return next.handle();
    }

    const { payload } = this.buildAuditEntry(context);

    return next.handle().pipe(
      mergeMap((responseBody) => from(this.auditService.write({
        ...payload,
        metadata: {
          ...payload.metadata,
          outcome: 'success',
        },
      })).pipe(map(() => responseBody))),
      catchError((error) => from(this.auditService.write({
        ...payload,
        metadata: {
          ...payload.metadata,
          outcome: 'error',
          error: error instanceof Error ? error.message : 'unknown',
        },
      })).pipe(mergeMap(() => throwError(() => error)))),
    );
  }
}
