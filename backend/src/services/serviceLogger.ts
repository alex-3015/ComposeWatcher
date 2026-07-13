export interface ServiceLogger {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export const consoleServiceLogger: ServiceLogger = {
  warn(context, message) {
    console.warn(message, context);
  },
  error(context, message) {
    console.error(message, context);
  },
};
