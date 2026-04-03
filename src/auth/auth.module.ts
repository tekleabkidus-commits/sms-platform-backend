import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ReauthGuard } from '../common/guards/reauth.guard';

@Module({
  providers: [AuthService, ReauthGuard],
  controllers: [AuthController],
  exports: [AuthService, ReauthGuard],
})
export class AuthModule {}
