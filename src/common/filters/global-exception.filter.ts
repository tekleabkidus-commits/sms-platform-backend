import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      message: 'Internal server error',
      error: 'InternalServerError',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      body = typeof exceptionResponse === 'string'
        ? { message: exceptionResponse, error: exception.name }
        : exceptionResponse as Record<string, unknown>;
    } else if (exception instanceof Error) {
      body = {
        message: exception.message,
        error: exception.name,
      };
    }

    this.logger.error(
      `${request.method} ${request.url} failed`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      ...body,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'],
    });
  }
}
