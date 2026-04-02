import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    response.on('finish', () => {
      this.metricsService.recordHttpRequest(
        request.method,
        request.route?.path ?? request.path,
        response.statusCode,
        Date.now() - startedAt,
      );
    });
    next();
  }
}
