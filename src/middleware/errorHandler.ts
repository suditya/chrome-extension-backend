// src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
  const isProd = process.env.NODE_ENV === 'production';

  console.error('[Error]', {
    message: err.message,
    statusCode,
    stack: isProd ? undefined : err.stack,
  });

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(isProd ? {} : { stack: err.stack }),
  });
}

