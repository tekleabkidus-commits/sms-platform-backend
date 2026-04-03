import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [AuthModule],
  providers: [CampaignsService],
  controllers: [CampaignsController],
})
export class CampaignsModule {}
