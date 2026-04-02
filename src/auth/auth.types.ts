import { Request } from 'express';

export interface JwtClaims {
  sub: string;
  tenantId: string;
  role: string;
  email?: string;
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
