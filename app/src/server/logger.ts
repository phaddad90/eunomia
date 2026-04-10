import pino from 'pino';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

let logDir = 'logs';

export function initLogger(projectPath?: string): pino.Logger {
  if (projectPath) {
    logDir = join(projectPath, 'logs');
  }
  mkdirSync(logDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
  const logFile = join(logDir, `yunomia-${today}.log`);

  const logger = pino({
    level: 'info',
    transport: {
      targets: [
        {
          target: 'pino/file',
          options: { destination: logFile, mkdir: true },
          level: 'info',
        },
        {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
          level: 'info',
        },
      ],
    },
  });

  return logger;
}

// Clean up log files older than 7 days
export function rotateLogs(dir: string = logDir): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  try {
    for (const file of readdirSync(dir)) {
      if (!file.startsWith('yunomia-') || !file.endsWith('.log')) continue;
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}
