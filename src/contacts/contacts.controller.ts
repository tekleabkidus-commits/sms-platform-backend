import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtClaims } from '../auth/auth.types';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { CreateContactGroupDto } from './dto/create-contact-group.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UploadContactsDto } from './dto/upload-contacts.dto';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @AuditAction('contacts.create')
  @Roles('owner', 'admin', 'developer', 'support')
  @Post('contacts')
  createContact(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateContactDto,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.createContact(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('contacts')
  listContacts(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.contactsService.listContacts(user.tenantId);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('contacts/:id')
  getContact(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) contactId: number,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.getContact(user.tenantId, contactId);
  }

  @AuditAction('contacts.update')
  @Roles('owner', 'admin', 'developer', 'support')
  @Put('contacts/:id')
  updateContact(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) contactId: number,
    @Body() dto: UpdateContactDto,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.updateContact(user.tenantId, contactId, dto);
  }

  @AuditAction('contact_groups.create')
  @Roles('owner', 'admin', 'developer', 'support')
  @Post('contact-groups')
  createGroup(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateContactGroupDto,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.createGroup(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('contact-groups')
  listGroups(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.contactsService.listGroups(user.tenantId);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('contact-groups/:id')
  getGroupDetail(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) groupId: number,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.getGroupDetail(user.tenantId, groupId);
  }

  @AuditAction('contact_uploads.import_inline')
  @Roles('owner', 'admin', 'developer', 'support')
  @Post('contact-uploads/inline')
  uploadInlineCsv(
    @CurrentUser() user: JwtClaims,
    @Body() dto: UploadContactsDto,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.importInlineCsv(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('contact-uploads')
  listUploads(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.contactsService.listUploads(user.tenantId);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('contact-uploads/:id/errors')
  listUploadErrors(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) uploadId: number,
  ): Promise<Record<string, unknown>[]> {
    return this.contactsService.listUploadErrors(user.tenantId, uploadId);
  }
}
