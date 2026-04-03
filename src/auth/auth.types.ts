import { Request } from 'express';

export interface JwtClaims {
  sub: string;
  tenantId: string;
  homeTenantId?: string;
  role: string;
  email?: string;
}

export interface ReauthClaims extends JwtClaims {
  kind: 'reauth';
  scope: 'dangerous_action';
  reauthAt: number;
}

export interface ApiPrincipal {
  apiKeyId: string;
  tenantId: string;
  name: string;
  scopes: string[];
  rateLimitRps: number | null;
  dailyQuota: number | null;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtClaims;
  apiPrincipal?: ApiPrincipal;
}
