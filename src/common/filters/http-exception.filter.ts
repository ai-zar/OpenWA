import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiResponse } from '../interfaces/response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as {
          message?: string | string[];
          error?: string;
          details?: Record<string, unknown>;
        };
        message = typeof resp.message === 'string' ? resp.message : message;
        code = resp.error || this.getErrorCode(status);
        details = resp.details;

        // Handle validation errors
        if (Array.isArray(resp.message)) {
          message = 'Validation failed';
          details = { errors: resp.message };
        }
      }

      // Only set code from status if not already set from response
      if (code === 'INTERNAL_ERROR') {
        code = this.getErrorCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.headers['x-request-id'] as string,
      },
    };

    // Loguear SIEMPRE la excepción (antes no se logueaba nada → los 4xx/5xx eran
    // invisibles en los logs del bridge). 5xx con stack; 4xx con detalle compacto.
    const logCtx = `${request.method} ${request.originalUrl} → ${status} [${code}]`;
    const detailStr = details ? ` ${JSON.stringify(details)}` : '';
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${logCtx} ${message}${detailStr}`, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${logCtx} ${message}${detailStr}`);
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
