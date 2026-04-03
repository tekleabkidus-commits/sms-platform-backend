import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest, ReauthClaims } from '../../auth/auth.types';

@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const currentUser = request.user;
    if (!currentUser) {
      throw new UnauthorizedException('A valid session is required before password confirmation can be checked');
    }

    const tokenHeader = request.headers['x-reauth-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    if (!token) {
      throw new UnauthorizedException('Password confirmation is required for this action');
    }

    try {
      const payload = await this.jwtService.verifyAsync<ReauthClaims>(token, {
        publicKey: this.configService.getOrThrow<string>('auth.jwtPublicKey'),
        algorithms: ['RS256', 'HS256'],
      });

      if (payload.kind !== 'reauth' || payload.scope !== 'dangerous_action') {
        throw new UnauthorizedException('Invalid re-authentication token scope');
      }

      if (
        payload.sub !== currentUser.sub
        || payload.tenantId !== currentUser.tenantId
        || (payload.homeTenantId ?? null) !== (currentUser.homeTenantId ?? null)
      ) {
        throw new UnauthorizedException('Re-authentication token does not match the active session context');
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Re-authentication token is invalid or expired');
    }
  }
}
