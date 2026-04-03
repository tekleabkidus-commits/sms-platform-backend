import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtClaims } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Roles('owner', 'admin', 'finance', 'support', 'developer', 'viewer')
  @Get('global')
  globalSearch(
    @CurrentUser() user: JwtClaims,
    @Query() query: GlobalSearchQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.searchService.globalSearch(user, query);
  }
}
