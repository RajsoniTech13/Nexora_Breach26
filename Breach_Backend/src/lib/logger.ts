export const logger = {
  debug: (...args: unknown[]) => {
    if (process.env['NODE_ENV'] !== 'production') {
      console.debug(`[DEBUG] ${new Date().toISOString()}:`, ...args);
    }
  },
  info: (...args: unknown[]) => {
    console.info(`[INFO] ${new Date().toISOString()}:`, ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(`[WARN] ${new Date().toISOString()}:`, ...args);
  },
  error: (...args: unknown[]) => {
    console.error(`[ERROR] ${new Date().toISOString()}:`, ...args);
  },
  fatal: (...args: unknown[]) => {
    console.error(`[FATAL] ${new Date().toISOString()}:`, ...args);
  },
};
