import 'dotenv/config'
import { validateBoolean } from 'expresso-core'

/**
 *
 * @param value
 * @param fallback
 * @returns
 */
function getEnv(value: any, fallback?: any): any {
  const result = process.env[value]

  // check env value
  if ([undefined, null, ''].includes(result)) {
    // check fallback
    if (fallback) {
      return fallback
    }

    return undefined
  }

  return result
}

/**
 * App Env
 */
const appEnv = {
  // Application
  NODE_ENV: getEnv('NODE_ENV', 'development'),

  APP_KEY: getEnv('APP_KEY'),
  APP_NAME: getEnv('APP_NAME', 'expresso'),
  APP_LANG: getEnv('APP_LANG', 'id'),
  APP_PORT: Number(getEnv('APP_PORT', 8000)),

  // Config
  AXIOS_TIMEOUT: getEnv('AXIOS_TIMEOUT', '5m'),
  RATE_LIMIT: Number(getEnv('RATE_LIMIT', 100)),
  RATE_DELAY: getEnv('RATE_DELAY', '5m'),
}

/**
 * Secret Env
 */
const secretEnv = {
  // OTP
  SECRET_OTP: getEnv('SECRET_OTP'),
  EXPIRED_OTP: getEnv('EXPIRED_OTP', '5m'),

  // JWT
  JWT_SECRET_ACCESS_TOKEN: getEnv('JWT_SECRET_ACCESS_TOKEN'),
  JWT_ACCESS_TOKEN_EXPIRED: getEnv('JWT_ACCESS_TOKEN_EXPIRED', '1d'),

  JWT_SECRET_REFRESH_TOKEN: getEnv('JWT_SECRET_REFRESH_TOKEN'),
  JWT_REFRESH_TOKEN_EXPIRED: getEnv('JWT_REFRESH_TOKEN_EXPIRED', '30d'),
}

/**
 * Base URL Env
 */
const baseURLEnv = {
  // Base URL
  URL_CLIENT_STAGING: getEnv(
    'URL_CLIENT_STAGING',
    'https://sandbox.example.com'
  ),
  URL_SERVER_STAGING: getEnv(
    'URL_SERVER_STAGING',
    'https://api-sandbox.example.com'
  ),

  URL_CLIENT_PRODUCTION: getEnv('URL_CLIENT_PRODUCTION', 'https://example.com'),
  URL_SERVER_PRODUCTION: getEnv(
    'URL_SERVER_PRODUCTION',
    'https://api.example.com'
  ),
}

/**
 * Database Env
 */
const databaseEnv = {
  TYPEORM_CONNECTION: getEnv('TYPEORM_CONNECTION', 'postgres'),
  TYPEORM_HOST: getEnv('TYPEORM_HOST', '127.0.0.1'),
  TYPEORM_PORT: Number(getEnv('TYPEORM_PORT', 5432)),
  TYPEORM_DATABASE: getEnv('TYPEORM_DATABASE', 'expresso'),
  TYPEORM_USERNAME: getEnv('TYPEORM_USERNAME', 'postgres'),
  TYPEORM_PASSWORD: getEnv('TYPEORM_PASSWORD', 'postgres'),
  TYPEORM_SYNCHRONIZE: validateBoolean(getEnv('TYPEORM_SYNCHRONIZE', true)),
  TYPEORM_LOGGING: validateBoolean(getEnv('TYPEORM_LOGGING', true)),
  TYPEORM_MIGRATIONS_RUN: validateBoolean(
    getEnv('TYPEORM_MIGRATIONS_RUN', true)
  ),
  TYPEORM_TIMEZONE: getEnv('TYPEORM_TIMEZONE', 'Asia/Jakarta'),
}

/**
 * SMTP Env
 */
const mailEnv = {
  // default smtp
  MAIL_DRIVER: getEnv('MAIL_DRIVER', 'smtp'),
  MAIL_HOST: getEnv('MAIL_HOST', 'smtp.mailtrap.io'),
  MAIL_PORT: Number(getEnv('MAIL_PORT', 2525)),
  MAIL_AUTH_TYPE: getEnv('MAIL_AUTH_TYPE'),
  MAIL_USERNAME: getEnv('MAIL_USERNAME'),
  MAIL_PASSWORD: getEnv('MAIL_PASSWORD'),
  MAIL_ENCRYPTION: getEnv('MAIL_ENCRYPTION'),

  // mailgun smtp
  MAILGUN_API_KEY: getEnv('MAILGUN_API_KEY'),
  MAILGUN_DOMAIN: getEnv('MAILGUN_DOMAIN'),

  // google OAuth smtp
  OAUTH_CLIENT_ID: getEnv('OAUTH_CLIENT_ID'),
  OAUTH_CLIENT_SECRET: getEnv('OAUTH_CLIENT_SECRET'),
  OAUTH_REDIRECT_URL: getEnv('OAUTH_REDIRECT_URL'),
  OAUTH_REFRESH_TOKEN: getEnv('OAUTH_REFRESH_TOKEN'),
}

/**
 * Storage Env
 */
const storageEnv = {
  STORAGE_PROVIDER: getEnv('STORAGE_PROVIDER', 'minio'),
  STORAGE_HOST: getEnv('STORAGE_HOST', '127.0.0.1'),
  STORAGE_PORT: getEnv('STORAGE_PORT', 9000),
  STORAGE_ACCESS_KEY: getEnv('STORAGE_ACCESS_KEY'),
  STORAGE_SECRET_KEY: getEnv('STORAGE_SECRET_KEY'),
  STORAGE_BUCKET_NAME: getEnv('STORAGE_BUCKET_NAME', 'expresso'),
  STORAGE_REGION: getEnv('STORAGE_REGION', 'ap-southeast-1'),
  STORAGE_SIGN_EXPIRED: getEnv('STORAGE_SIGN_EXPIRED', '7d'),
}

export const env = {
  ...appEnv,
  ...secretEnv,
  ...baseURLEnv,
  ...databaseEnv,
  ...mailEnv,
  ...storageEnv,
}
