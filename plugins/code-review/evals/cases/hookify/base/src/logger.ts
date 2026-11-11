type Fields = Record<string, unknown>;

export const logger = {
  info(message: string, fields: Fields = {}): void {
    process.stdout.write(JSON.stringify({ level: 'info', message, ...fields }) + '\n');
  },
  debug(message: string, fields: Fields = {}): void {
    process.stdout.write(JSON.stringify({ level: 'debug', message, ...fields }) + '\n');
  },
};
