import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from './auth.types';
import { AuthService } from './auth.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @AuditAction('api_keys.create')
  @Roles('owner', 'admin', 'developer')
  @Post()
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

  @Roles('owner', 'admin', 'developer')
  @Get()
  listApiKeys(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.authService.listApiKeys(user.tenantId);
  }

  @AuditAction('api_keys.rotate')
  @Roles('owner', 'admin')
  @Post(':id/rotate')
  rotateApiKey(
    @CurrentUser() user: JwtClaims,
    @Param('id') apiKeyId: string,
    @Body() dto: RotateApiKeyDto,
  ): Promise<Record<string, unknown>> {
    return this.authService.rotateApiKey(user.tenantId, apiKeyId, dto);
  }

  @AuditAction('api_keys.disable')
  @Roles('owner', 'admin')
  @Delete(':id')
  async disableApiKey(
    @CurrentUser() user: JwtClaims,
    @Param('id') apiKeyId: string,
  ): Promise<{ success: true }> {
    await this.authService.disableApiKey(user.tenantId, apiKeyId);
    return { success: true };
  }
}
