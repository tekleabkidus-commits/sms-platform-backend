import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ReauthGuard } from '../common/guards/reauth.guard';
import { ProvidersService } from './providers.service';
import { UpdateProviderCircuitDto } from './dto/update-provider-circuit.dto';

@ApiTags('providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Roles('admin', 'support')
  @Get()
  listProviders(): Promise<Record<string, unknown>[]> {
    return this.providersService.listProviders();
  }

  @Roles('admin', 'support')
  @Get(':id')
  getProviderDetail(@Param('id', ParseIntPipe) providerId: number): Promise<Record<string, unknown>> {
    return this.providersService.getProviderDetail(providerId);
  }

  @Roles('admin', 'support')
  @Get(':id/health')
  getProviderHealth(@Param('id', ParseIntPipe) providerId: number): Promise<Record<string, unknown>[]> {
    return this.providersService.getProviderHealthHistory(providerId);
  }

  @AuditAction('providers.circuit.override')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Post(':id/circuit')
  async updateCircuitState(
    @Param('id', ParseIntPipe) providerId: number,
    @Body() dto: UpdateProviderCircuitDto,
  ): Promise<{ success: true }> {
    await this.providersService.setCircuitState(providerId, dto.state, dto.reason);
    return { success: true };
  }
}
