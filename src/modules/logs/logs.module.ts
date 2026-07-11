import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';

/**
 * Exposes GET /api/logs-raw. No providers: the controller reads the process-wide
 * log buffer singleton and effective env directly. Auth (API key + admin role)
 * is enforced by the global ApiKeyGuard.
 */
@Module({
  controllers: [LogsController],
})
export class LogsModule {}
