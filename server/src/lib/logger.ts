import pino from 'pino';
import { env, isProduction } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  /** Pretty output locally; structured JSON in production for log aggregators. */
  transport: isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true } },
  /** Access tokens and passwords must never reach the log stream. */
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.accessToken',
      '*.access_token',
      '*.password',
      '*.passwordHash',
      '*.accessTokenEncrypted',
    ],
    censor: '[redacted]',
  },
});
