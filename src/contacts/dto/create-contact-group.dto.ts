import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateContactGroupDto {
  @ApiProperty({ example: 'VIP Customers' })
  @IsString()
  @MaxLength(100)
  name!: string;
}
