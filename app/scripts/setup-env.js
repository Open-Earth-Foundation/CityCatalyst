
import { writeFileSync } from 'fs';
import { URL } from 'url';

// Read DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable not found');
  process.exit(1);
}

// Parse the DATABASE_URL
const parsed = new URL(databaseUrl);

const envVars = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: databaseUrl,
  DATABASE_HOST: parsed.hostname,
  DATABASE_NAME: parsed.pathname.slice(1), // Remove leading slash
  DATABASE_USER: parsed.username,
  DATABASE_PASSWORD: parsed.password,
  DATABASE_PORT: parsed.port || '5432',
  DATABASE_SSL: 'true',
  DATABASE_DIALECT: 'postgres',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "TiK4b44DchsoV5009j0qf0jUnFzVloWem8WHZfgnWVU=",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  HOST: process.env.HOST || "http://localhost:3000",
  SMTP_HOST: process.env.SMTP_HOST || "smtp.ethereal.email",
  SMTP_PORT: process.env.SMTP_PORT || "587",
  SMTP_USER: process.env.SMTP_USER || "user",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "password",
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || "ethereal.user@ethereal.email",
  RESET_TOKEN_SECRET: process.env.RESET_TOKEN_SECRET || "WwjFGhcP8VikgsmtcPv+ufPhTGS8t7e+/aN5k2qY4ms=",
  NEXT_PUBLIC_SUPPORT_EMAILS: process.env.NEXT_PUBLIC_SUPPORT_EMAILS || "info@openearth.org,greta@openearth.org",
  VERIFICATION_TOKEN_SECRET: process.env.VERIFICATION_TOKEN_SECRET || "80c70dfdeedf2c01757b880d39c79214e915c786dd48d5473c9c0aecf81d67cf",
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || "hf_MY_SECRET_KEY",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-MY_SECRET_KEY",
  OPENAI_ASSISTANT_ID: process.env.OPENAI_ASSISTANT_ID || "asst_ASSISTANT_ID",
  CHAT_PROVIDER: process.env.CHAT_PROVIDER || "huggingface",
  OPEN_AI_MODEL: process.env.OPEN_AI_MODEL || "gpt-4o-mini",
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || "admin@mail.com",
  ADMIN_NAMES: process.env.ADMIN_NAMES || "John doe",
  NEXT_PUBLIC_OPENCLIMATE_API_URL: process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL || "https://openclimate.openearth.dev",
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || "johndoe@example.com",
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || "password",
  NEXT_AWS_REGION: process.env.NEXT_AWS_REGION || "us-east-2",
  NEXT_AWS_ACCESS_KEY_ID: process.env.NEXT_AWS_ACCESS_KEY_ID || "NEXT_AWS_ACCESS_KEY_ID",
  NEXT_AWS_SECRET_ACCESS_KEY: process.env.NEXT_AWS_SECRET_ACCESS_KEY || "NEXT_AWS_SECRET_ACCESS_KEY",
  NEXT_AWS_S3_BUCKET_ID: process.env.NEXT_AWS_S3_BUCKET_ID || "openearth.cap"
};

// Create .env file content
const envContent = Object.entries(envVars)
  .map(([key, value]) => `${key}="${value}"`)
  .join('\n');

// Write to .env file
writeFileSync('app/.env', envContent);

console.log('Environment variables set up successfully!');
console.log('Database connection configured for:', parsed.hostname);
