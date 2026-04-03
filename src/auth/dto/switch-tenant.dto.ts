import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchTenantDto {
  @ApiProperty({ example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799' })
  @IsUUID()
  tenantId!: string;
}
