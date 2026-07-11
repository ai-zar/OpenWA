/**
 * In-memory ring buffer that captures everything written to stdout/stderr
 * (the custom JSON logger, Nest's built-in logger and raw stack traces such as
 * puppeteer's "Target closed"). Exposed — redacted — via GET /api/logs-raw for
 * quick production debugging without SSH access to `docker compose logs`.
 *
 * Capture is installed by patching process.stdout/stderr.write once at bootstrap
 * (see installLogCapture, called from main.ts). Nothing is persisted to disk;
 * the buffer lives only in the process and is dropped on restart.
 */

export type LogLevel = 'error' | 'warn' | 'info';

export interface BufferedLine {
  ts: string;
  level: LogLevel;
  line: string;
}

const CAPACITY = 2000;

class LogRingBuffer {
  private readonly lines: BufferedLine[] = [];

  push(rawLine: string, source: 'stdout' | 'stderr'): void {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) return;
    this.lines.push({ ts: new Date().toISOString(), level: detectLevel(line, source), line });
    if (this.lines.length > CAPACITY) this.lines.shift();
  }

  /** Most-recent `limit` lines, oldest first, optionally filtered by minimum severity. */
  tail(limit: number, minLevel?: LogLevel): BufferedLine[] {
    const filtered = minLevel ? this.lines.filter(l => severity(l.level) >= severity(minLevel)) : this.lines;
    return filtered.slice(-limit);
  }
}

export const logBuffer = new LogRingBuffer();

function severity(level: LogLevel): number {
  return level === 'error' ? 3 : level === 'warn' ? 2 : 1;
}

function detectLevel(line: string, source: 'stdout' | 'stderr'): LogLevel {
  if (/"level":"error"/.test(line) || /\bERROR\b/.test(line) || /Error:|Exception|\bat\s+\w/.test(line)) {
    return 'error';
  }
  if (/"level":"warn"/.test(line) || /\bWARN\b/.test(line)) return 'warn';
  return source === 'stderr' ? 'warn' : 'info';
}

let installed = false;

/**
 * Tee process.stdout/stderr into the ring buffer. Idempotent; the original
 * write is always called so normal `docker logs` output is unaffected.
 */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  const patch = (stream: NodeJS.WriteStream, source: 'stdout' | 'stderr'): void => {
    const original = stream.write.bind(stream);
    stream.write = ((chunk: unknown, ...args: unknown[]): boolean => {
      try {
        const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
        if (text) for (const l of text.split('\n')) logBuffer.push(l, source);
      } catch {
        // never let capture break real logging
      }
      return (original as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof stream.write;
  };

  patch(process.stdout, 'stdout');
  patch(process.stderr, 'stderr');
}

/**
 * Redact secrets from a text blob before it leaves the process. Covers OpenWA
 * API keys, bearer/x-api-key headers and JSON/env-style secret fields. Keeps a
 * short prefix so lines stay correlatable.
 */
export function redactSecrets(text: string): string {
  return (
    text
      // OpenWA API keys: owa_k1_<hex> — keep prefix + 4 chars
      .replace(/(owa_k\d+_[A-Za-z0-9]{4})[A-Za-z0-9]+/g, '$1***')
      // Bearer tokens
      .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***')
      // x-api-key header values
      .replace(/(x-api-key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, '$1***')
      // JSON/env secret fields: password/secret/token/key/credential = value
      .replace(
        /("?\b(?:\w*(?:password|secret|token|credential|apikey|api_key|master_key|masterkey))\b"?\s*[:=]\s*"?)([^",}\s]+)/gi,
        '$1***',
      )
  );
}

/** Sensitive config keys whose *value* must never be shown, matched by name. */
const SENSITIVE_KEY = /(PASS|PASSWORD|SECRET|TOKEN|CREDENTIAL|_KEY|APIKEY|API_KEY|PWD|PRIVATE)/i;

/** Config keys worth surfacing (the docker-compose env surface), matched by prefix. */
const CONFIG_KEY =
  /^(NODE_ENV|PORT|LOG_LEVEL|DATABASE_|ENGINE_|SESSION_|PUPPETEER_|STORAGE_|S3_|REDIS_|WEBHOOK_|RATE_LIMIT_|PLUGINS_|API_|CORS_|QUEUE_|MINIO_|POSTGRES_|DASHBOARD_|MAX_|DEBUG|TZ)/;

/**
 * Snapshot of the effective runtime config (the env the container actually runs
 * with — "docker config"), filtered to relevant keys and with secret values
 * masked by key name. This is the safe source of truth for "what config is live".
 */
export function getEffectiveConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(process.env).sort()) {
    if (!CONFIG_KEY.test(key)) continue;
    const value = process.env[key] ?? '';
    out[key] = SENSITIVE_KEY.test(key) && value ? '***REDACTED***' : value;
  }
  return out;
}
