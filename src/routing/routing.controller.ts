import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { RoutePreviewDto } from './dto/route-preview.dto';
import { RoutingService } from './routing.service';

@ApiTags('routing')
@ApiBearerAuth()
@Controller('routing')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Roles('owner', 'admin', 'developer', 'support')
  @Post('preview')
  preview(@CurrentUser() user: JwtClaims, @Body() dto: RoutePreviewDto): Promise<unknown> {
    return this.routingService.selectRoute(user.tenantId, dto.phoneNumber, dto.trafficType);
  }
}
