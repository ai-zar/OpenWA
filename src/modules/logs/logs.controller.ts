import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { logBuffer, redactSecrets, getEffectiveConfig, LogLevel } from '../../common/services/log-buffer';

/**
 * GET /api/logs-raw — debug snapshot: effective (redacted) runtime config plus
 * the tail of the in-memory log buffer. Protected by API key + admin role
 * (inherited from the global ApiKeyGuard; NOT @Public). Secrets are redacted
 * regardless, so a leaked response never exposes keys/passwords.
 */
@ApiTags('health')
@ApiSecurity('X-API-Key')
@Controller('logs-raw')
@RequireRole(ApiKeyRole.ADMIN)
export class LogsController {
  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Raw debug snapshot: effective config + recent logs (redacted, admin only)' })
  @ApiQuery({ name: 'lines', required: false, description: 'How many recent log lines to return (default 200, max 2000)' })
  @ApiQuery({ name: 'level', required: false, enum: ['error', 'warn', 'info'], description: 'Minimum severity (default error)' })
  @ApiQuery({ name: 'config', required: false, description: 'Include the effective config block (default true)' })
  @ApiResponse({ status: 200, description: 'Plain-text snapshot' })
  getRaw(
    @Query('lines') linesRaw?: string,
    @Query('level') levelRaw?: string,
    @Query('config') configRaw?: string,
  ): string {
    const lines = clamp(parseInt(linesRaw ?? '', 10) || 200, 1, 2000);
    const level = ['error', 'warn', 'info'].includes(levelRaw ?? '') ? (levelRaw as LogLevel) : 'error';
    const withConfig = configRaw !== 'false' && configRaw !== '0';

    const parts: string[] = [];
    parts.push(`# OpenWA /logs-raw — ${new Date().toISOString()}`);
    parts.push(`# pid ${process.pid} · uptime ${Math.round(process.uptime())}s · node ${process.version}`);

    if (withConfig) {
      const cfg = getEffectiveConfig();
      parts.push('', '## CONFIG (effective env — secrets redacted)');
      for (const [k, v] of Object.entries(cfg)) parts.push(`${k}=${v}`);
    }

    const tail = logBuffer.tail(lines, level);
    parts.push('', `## LOGS (last ${tail.length}, min level: ${level})`);
    for (const entry of tail) parts.push(redactSecrets(entry.line));

    return parts.join('\n') + '\n';
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
