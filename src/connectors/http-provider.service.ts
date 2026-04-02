import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface HttpDispatchRequest {
  url: string;
  headers?: Record<string, string>;
  payload: Record<string, unknown>;
}

export interface DispatchResult {
  accepted: boolean;
  providerMessageId?: string;
  statusCode?: number;
  rawResponse?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class HttpProviderService {
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    this.timeoutMs = configService.getOrThrow<number>('providers.httpTimeoutMs');
  }

  async submit(request: HttpDispatchRequest): Promise<DispatchResult> {
    try {
      const response = await axios.post(request.url, request.payload, {
        timeout: this.timeoutMs,
        headers: request.headers,
      });

      return {
        accepted: response.status >= 200 && response.status < 300,
        providerMessageId: response.data?.messageId ?? response.data?.id,
        statusCode: response.status,
        rawResponse: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          accepted: false,
          statusCode: error.response?.status,
          rawResponse: error.response?.data,
          errorCode: 'http_provider_error',
          errorMessage: error.message,
        };
      }

      throw new ServiceUnavailableException('HTTP provider request failed unexpectedly');
    }
  }
}
