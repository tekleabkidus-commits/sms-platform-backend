import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateSenderIdDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  providerId!: number;

  @ApiProperty({ example: 'MYAPP' })
  @IsString()
  @MaxLength(20)
  senderName!: string;
}
