import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  providers: [RequestContextService, AppLoggerService],
  exports: [RequestContextService, AppLoggerService],
})
export class LoggingModule {}
