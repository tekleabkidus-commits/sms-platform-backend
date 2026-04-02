import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @AuditAction('templates.create')
  @Roles('owner', 'admin', 'developer')
  @Post()
  @ApiOperation({ summary: 'Create a versioned template' })
  @ApiOkResponse({
    example: {
      id: 1,
      templateKey: 'd77b4c3f-1ba8-4f51-8d17-93a2fcf4e9d0',
      name: 'otp-login',
      body: 'Your OTP is {{code}}.',
      version: 1,
      mergeFields: ['code'],
      isActive: true,
    },
  })
  create(@CurrentUser() user: JwtClaims, @Body() dto: CreateTemplateDto): Promise<Record<string, unknown>> {
    return this.templatesService.createTemplate(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get()
  list(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.templatesService.listTemplates(user.tenantId);
  }

  @AuditAction('templates.update')
  @Roles('owner', 'admin', 'developer')
  @Put(':id')
  update(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ): Promise<Record<string, unknown>> {
    return this.templatesService.updateTemplate(user.tenantId, id, dto);
  }

  @AuditAction('templates.delete')
  @Roles('owner', 'admin')
  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ success: true }> {
    await this.templatesService.deleteTemplate(user.tenantId, id);
    return { success: true };
  }
}
