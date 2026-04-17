/**
 * Logging utility with rotation and comprehensive formatting.
 */

import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LoggerOptions {
  name: string;
  level?: LogLevel;
  logDir?: string;
}

export class Logger {
  private name: string;
  private level: number;
  private logDir?: string;
  private logStream?: fs.WriteStream;

  constructor(options: LoggerOptions) {
    this.name = options.name;
    this.level = LOG_LEVELS[options.level ?? 'info'];
    this.logDir = options.logDir;

    if (this.logDir) {
      this.initializeLogFile();
    }
  }

  private initializeLogFile(): void {
    if (!this.logDir) return;

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const logFile = path.join(this.logDir, 'orchestrator.log');
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    } catch (err) {
      console.error(`Failed to initialize log file: ${err}`);
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} | ${level.toUpperCase().padEnd(5)} | ${this.name} | ${message}`;
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVELS[level] < this.level) return;

    const formattedArgs = args.map((arg) =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    );
    const fullMessage = formattedArgs.length > 0 ? `${message} ${formattedArgs.join(' ')}` : message;
    const logLine = this.formatMessage(level, fullMessage);

    // Console output
    switch (level) {
      case 'error':
        console.error(logLine);
        break;
      case 'warn':
        console.warn(logLine);
        break;
      default:
        console.log(logLine);
    }

    // File output
    if (this.logStream) {
      this.logStream.write(logLine + '\n');
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

// Logger registry
const loggers: Map<string, Logger> = new Map();
let globalLogDir: string | undefined;
let globalLogLevel: LogLevel = 'info';

/**
 * Set up global logging configuration.
 */
export function setupLogging(options: { logDir?: string; logLevel?: LogLevel }): void {
  globalLogDir = options.logDir;
  globalLogLevel = options.logLevel ?? 'info';
}

/**
 * Get a logger instance with the specified name.
 */
export function getLogger(name: string): Logger {
  if (!loggers.has(name)) {
    loggers.set(
      name,
      new Logger({
        name,
        level: globalLogLevel,
        logDir: globalLogDir,
      })
    );
  }
  return loggers.get(name)!;
}

/**
 * Close all loggers (for cleanup).
 */
export function closeAllLoggers(): void {
  for (const logger of loggers.values()) {
    logger.close();
  }
  loggers.clear();
}
