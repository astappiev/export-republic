import { pino, type Logger } from 'pino'
import pretty from 'pino-pretty';

const stream = pretty({
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
    sync: true,
});

export const logger: Logger = pino({
    level: process.env.LOG_LEVEL || 'info',
}, stream);
