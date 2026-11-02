// src/config/index.ts
import fs from 'node:fs';
import path from 'node:path';

// Minimal zero-dependency .env loader fallback
function loadEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
        if (match) {
          const key = match[1];
          let val = (match[2] || '').trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (_e) {
    // Continue if file reading fails
  }
}

loadEnvFile();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  mongoUri: string;
  dbName: string;
  adminEmail: string;
  adminPass: string;
  corsOrigin: string;
  backendPublicUrl: string;
  workerIntervalMs: number;
  leaseTimeoutMs: number;
}

export function validateConfig(): AppConfig {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const port = parseInt(process.env.PORT || '3000', 10);

  return {
    port: isNaN(port) ? 3000 : port,
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri,
    dbName: process.env.DB_NAME || 'Leetcode-Extension',
    adminEmail: process.env.ADMIN_EMAIL || '',
    adminPass: process.env.ADMIN_PASS || '',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    backendPublicUrl: process.env.BACKEND_PUBLIC_URL || 'http://localhost:3000',
    workerIntervalMs: 60 * 1000, // Check every minute in background
    leaseTimeoutMs: 5 * 60 * 1000, // 5 minute lock lease timeout
  };
}

export const config = validateConfig();

