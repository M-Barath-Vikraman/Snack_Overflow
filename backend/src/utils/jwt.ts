import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { UserPayload } from '../types';

export function generateToken(payload: UserPayload, expiresIn: SignOptions['expiresIn'] = '7d'): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export function verifyToken(token: string): UserPayload {
  return jwt.verify(token, config.jwtSecret) as UserPayload;
}
