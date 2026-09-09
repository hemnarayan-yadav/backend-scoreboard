import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3001),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-this-secret',
  jwtTtl: process.env.JWT_TTL || '8h',
  corsOrigins: process.env.CORS_ORIGIN?.split(',').map(value => value.trim()).filter(Boolean) || []
};
