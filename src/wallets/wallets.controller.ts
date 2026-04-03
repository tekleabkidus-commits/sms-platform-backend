import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { TenantScopeQueryDto } from '../common/dto/tenant-scope-query.dto';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallet')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Roles('owner', 'admin', 'finance', 'support', 'viewer')
  @Get()
  getWalletSummary(
    @CurrentUser() user: JwtClaims,
    @Query() query: TenantScopeQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.walletsService.getWalletSummary(user, query.tenantId);
  }

  @Roles('owner', 'admin', 'finance', 'support', 'viewer')
  @Get('transactions')
  listTransactions(
    @CurrentUser() user: JwtClaims,
    @Query() query: WalletTransactionsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.walletsService.listTransactions(user, query);
  }
}
