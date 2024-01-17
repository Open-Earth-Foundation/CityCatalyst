import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL
    || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
    timestamp: pino.stdTimeFunctions.isoTime,
    level: LOG_LEVEL,
    formatters: {
        level(label, number) {
            return { level: label };
        },
        log(object) {
            return object;
        }
    }
});