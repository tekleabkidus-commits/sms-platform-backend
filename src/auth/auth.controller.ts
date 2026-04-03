import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from './auth.types';
import { AuthService } from './auth.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { LoginDto } from './dto/login.dto';
import { ReauthDto } from './dto/reauth.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { ReauthGuard } from '../common/guards/reauth.guard';

@ApiTags('auth', 'api-keys')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Authenticate a control-plane user with tenant code, email, and password' })
  @ApiOkResponse({
    example: {
      accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
      expiresIn: '12h',
      user: {
        id: '4fa1c55c-2f87-41af-b117-d9d04fe3e711',
        email: 'owner@acme.et',
        role: 'owner',
      },
      tenant: {
        id: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799',
        code: 'acme-et',
        name: 'Acme Ethiopia',
        timezone: 'Africa/Addis_Ababa',
        status: 'active',
      },
    },
  })
  login(@Body() dto: LoginDto): Promise<Record<string, unknown>> {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @Get('auth/me')
  @ApiOperation({ summary: 'Resolve the current bearer-token session' })
  me(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>> {
    return this.authService.getCurrentUser(user);
  }

  @ApiBearerAuth()
  @Post('auth/re-auth')
  @ApiOperation({ summary: 'Confirm the current session password before dangerous control-plane changes' })
  reauthenticate(
    @CurrentUser() user: JwtClaims,
    @Body() dto: ReauthDto,
  ): Promise<Record<string, unknown>> {
    return this.authService.reauthenticate(user, dto);
  }

  @ApiBearerAuth()
  @Roles('admin', 'support')
  @Post('auth/switch-tenant')
  @ApiOperation({ summary: 'Switch control-plane tenant context for cross-tenant operational roles' })
  switchTenant(
    @CurrentUser() user: JwtClaims,
    @Body() dto: SwitchTenantDto,
  ): Promise<Record<string, unknown>> {
    return this.authService.switchTenant(user, dto);
  }

  @ApiBearerAuth()
  @AuditAction('api_keys.create')
  @Roles('owner', 'admin', 'developer')
  @Post('api-keys')
  @ApiOperation({ summary: 'Create a tenant-scoped API key' })
  @ApiOkResponse({
    example: {
      id: '2a8d26d7-2f80-4f65-a6ee-66533aa1f962',
      keyPrefix: 'a1b2c3d4e5f6',
      apiKey: 'sk_live_a1b2c3d4e5f6_abcdefgh',
      createdAt: '2026-04-02T19:00:00.000Z',
    },
  })
  createApiKey(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateApiKeyDto,
  ): Promise<Record<string, unknown>> {
    return this.authService.createApiKey(user.tenantId, dto);
  }

  @ApiBearerAuth()
  @Roles('owner', 'admin', 'developer')
  @Get('api-keys')
  listApiKeys(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.authService.listApiKeys(user.tenantId);
  }

  @ApiBearerAuth()
  @AuditAction('api_keys.rotate')
  @Roles('owner', 'admin')
  @UseGuards(ReauthGuard)
  @Post('api-keys/:id/rotate')
  rotateApiKey(
    @CurrentUser() user: JwtClaims,
    @Param('id') apiKeyId: string,
    @Body() dto: RotateApiKeyDto,
  ): Promise<Record<string, unknown>> {
    return this.authService.rotateApiKey(user.tenantId, apiKeyId, dto);
  }

  @ApiBearerAuth()
  @AuditAction('api_keys.disable')
  @Roles('owner', 'admin')
  @UseGuards(ReauthGuard)
  @Delete('api-keys/:id')
  async disableApiKey(
    @CurrentUser() user: JwtClaims,
    @Param('id') apiKeyId: string,
  ): Promise<{ success: true }> {
    await this.authService.disableApiKey(user.tenantId, apiKeyId);
    return { success: true };
  }
}
