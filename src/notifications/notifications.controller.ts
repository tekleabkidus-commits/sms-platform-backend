import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtClaims } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { NotificationsQueryDto } from './dto/notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Roles('owner', 'admin', 'finance', 'support', 'developer', 'viewer')
  @Get()
  list(
    @CurrentUser() user: JwtClaims,
    @Query() query: NotificationsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.notificationsService.list(user, query);
  }
}
