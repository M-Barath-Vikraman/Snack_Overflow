import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { UserPayload } from '../types';

export function generateToken(payload: UserPayload, expiresIn?: SignOptions['expiresIn']): string {
  const options: SignOptions = {
    expiresIn: expiresIn || (config.jwtExpiresIn as any) || '7d',
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyToken(token: string): UserPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as any;

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Malformed token payload');
  }

  if (!decoded.userId || typeof decoded.userId !== 'string') {
    throw new Error('Token missing required userId claim');
  }

  if (!decoded.email || typeof decoded.email !== 'string') {
    throw new Error('Token missing required email claim');
  }

  if (!decoded.role || (decoded.role !== 'ADMIN' && decoded.role !== 'MEMBER')) {
    throw new Error('Token missing or invalid role claim');
  }

  return {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
  };
}
