// Structured Logging Subsystem
export class Logger {
  private static getTimestamp(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  static info(origin: string, message: string): void {
    console.log(`[${this.getTimestamp()}] [INFO] [${origin}] ${message}`);
  }

  static warn(origin: string, message: string): void {
    console.warn(`[${this.getTimestamp()}] [WARN] [${origin}] ${message}`);
  }

  static error(origin: string, message: string): void {
    console.error(`[${this.getTimestamp()}] [ERROR] [${origin}] ${message}`);
  }

  static audit(origin: string, message: string): void {
    console.log(`[${this.getTimestamp()}] [AUDIT] [${origin}] ${message}`);
  }

  static debug(origin: string, message: string): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${this.getTimestamp()}] [DEBUG] [${origin}] ${message}`);
    }
  }
}
