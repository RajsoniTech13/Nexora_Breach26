import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from '../types/index.js';
import {
  AccessTokenPayload,
  JwtPayloadBase,
  RefreshTokenPayload,
  TokenType,
} from '../types/auth.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }

  return value;
}

const accessTokenSecret = getRequiredEnv('JWT_ACCESS_SECRET');
const refreshTokenSecret = getRequiredEnv('JWT_REFRESH_SECRET');

const accessTokenTtl = (process.env['JWT_ACCESS_TTL'] ?? '15m') as SignOptions['expiresIn'];
const refreshTokenTtl = (process.env['JWT_REFRESH_TTL'] ?? '30d') as SignOptions['expiresIn'];

function signToken(payload: JwtPayloadBase, secret: string, expiresIn: SignOptions['expiresIn']): string {
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken<T extends JwtPayloadBase>(token: string, secret: string): T {
  try {
    return jwt.verify(token, secret) as T;
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }
}

export function signAccessToken(userId: string, jti: string): string {
  const payload: AccessTokenPayload = { sub: userId, jti, type: 'access' };
  return signToken(payload, accessTokenSecret, accessTokenTtl);
}

export function signRefreshToken(userId: string, jti: string): string {
  const payload: RefreshTokenPayload = { sub: userId, jti, type: 'refresh' };
  return signToken(payload, refreshTokenSecret, refreshTokenTtl);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verifyToken<AccessTokenPayload>(token, accessTokenSecret);
  if (payload.type !== 'access') {
    throw new AppError('Invalid token type', 401);
  }

  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = verifyToken<RefreshTokenPayload>(token, refreshTokenSecret);
  if (payload.type !== 'refresh') {
    throw new AppError('Invalid token type', 401);
  }

  return payload;
}

export function decodeTokenExpiry(token: string): number {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded !== 'object' || typeof decoded['exp'] !== 'number') {
    throw new AppError('Invalid token payload', 401);
  }

  return decoded['exp'];
}

export function parseBearerToken(authHeader?: string): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Missing or invalid authorization header', 401);
  }

  return authHeader.slice(7).trim();
}

export function getRedisKeyForToken(kind: 'refresh' | 'blacklist', jti: string): string {
  return `auth:${kind}:${jti}`;
}

export function assertTokenType(type: TokenType, expected: TokenType): void {
  if (type !== expected) {
    throw new AppError('Invalid token type', 401);
  }
}
