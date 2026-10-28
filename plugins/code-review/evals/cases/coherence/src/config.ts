function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  smtpUrl: required('SMTP_URL'),
};
