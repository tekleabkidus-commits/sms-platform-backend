import { ForbiddenException } from '@nestjs/common';
import { JwtClaims } from '../../auth/auth.types';

const CROSS_TENANT_ROLES = new Set(['admin', 'support']);

export function resolveTenantScope(user: JwtClaims, requestedTenantId?: string): string {
  if (!requestedTenantId || requestedTenantId === user.tenantId) {
    return user.tenantId;
  }

  if (!CROSS_TENANT_ROLES.has(user.role)) {
    throw new ForbiddenException('Cross-tenant access is not allowed for this role');
  }

  return requestedTenantId;
}

export function canUseCrossTenantScope(user: JwtClaims): boolean {
  return CROSS_TENANT_ROLES.has(user.role);
}
