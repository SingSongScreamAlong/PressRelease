import winston from 'winston';
import config from './config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

/**
 * Custom log format
 */
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    if (stack) {
        log += `\n${stack}`;
    }

    if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
    }

    return log;
});

/**
 * Winston logger instance
 */
export const logger = winston.createLogger({
    level: config.logging.level,
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    defaultMeta: { service: 'engine' },
    transports: [
        // Console output (colorized in development)
        new winston.transports.Console({
            format: config.isDev
                ? combine(colorize(), logFormat)
                : logFormat,
        }),
    ],
});

// Add file transport in production
if (!config.isDev) {
    logger.add(
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        })
    );
    logger.add(
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    );
}

/**
 * Create a child logger with additional context
 */
export function createLogger(context: string): winston.Logger {
    return logger.child({ context });
}

export default logger;
