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
  latencyMs?: number;
  retryable?: boolean;
  uncertain?: boolean;
}

@Injectable()
export class HttpProviderService {
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    this.timeoutMs = configService.getOrThrow<number>('providers.httpTimeoutMs');
  }

  async submit(request: HttpDispatchRequest): Promise<DispatchResult> {
    const startedAt = Date.now();
    try {
      const response = await axios.post(request.url, request.payload, {
        timeout: this.timeoutMs,
        headers: request.headers,
        validateStatus: () => true,
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          accepted: true,
          providerMessageId: response.data?.messageId ?? response.data?.id,
          statusCode: response.status,
          rawResponse: response.data,
          latencyMs: Date.now() - startedAt,
        };
      }

      if (response.status === 429) {
        return {
          accepted: false,
          statusCode: response.status,
          rawResponse: response.data,
          errorCode: 'throttle',
          errorMessage: 'HTTP provider throttled the request',
          latencyMs: Date.now() - startedAt,
          retryable: true,
        };
      }

      if (response.status >= 500) {
        return {
          accepted: false,
          statusCode: response.status,
          rawResponse: response.data,
          errorCode: 'http_provider_error',
          errorMessage: 'HTTP provider returned a server error',
          latencyMs: Date.now() - startedAt,
          retryable: true,
        };
      }

      return {
        accepted: false,
        statusCode: response.status,
        rawResponse: response.data,
        errorCode: `http_${response.status}`,
        errorMessage: 'HTTP provider rejected the request',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!error.response || error.code === 'ECONNABORTED') {
          return {
            accepted: false,
            statusCode: error.response?.status,
            rawResponse: error.response?.data,
            errorCode: 'unknown_submit_outcome',
            errorMessage: error.message,
            latencyMs: Date.now() - startedAt,
            retryable: false,
            uncertain: true,
          };
        }

        return {
          accepted: false,
          statusCode: error.response?.status,
          rawResponse: error.response?.data,
          errorCode: 'http_provider_error',
          errorMessage: error.message,
          latencyMs: Date.now() - startedAt,
          retryable: true,
        };
      }

      throw new ServiceUnavailableException('HTTP provider request failed unexpectedly');
    }
  }
}
