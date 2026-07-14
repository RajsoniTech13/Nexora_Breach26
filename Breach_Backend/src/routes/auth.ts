import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../db/pool.js';
import { AppError } from '../types/index.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  decodeTokenExpiry,
  getRedisKeyForToken,
  parseBearerToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt.js';
import { redis } from '../redis/client.js';
import { requireAuth } from '../middleware/auth.js';

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  password_hash: string;
}

const router = Router();

const googleClientId = process.env['GOOGLE_CLIENT_ID'];
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `
      SELECT id, email, username, display_name, avatar_url, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );

  return result.rows[0] ?? null;
}

async function generateUniqueUsername(email: string): Promise<string> {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  const fallback = base.length > 0 ? base : 'user';

  for (let i = 0; i < 6; i += 1) {
    const suffix = i === 0 ? '' : `_${Math.floor(Math.random() * 10_000)}`;
    const candidate = `${fallback}${suffix}`.slice(0, 50);

    const result = await query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM users WHERE username = $1)', [
      candidate,
    ]);

    if (!result.rows[0]?.exists) {
      return candidate;
    }
  }

  return `${fallback}_${randomUUID().slice(0, 8)}`.slice(0, 50);
}

function userToResponse(user: Pick<UserRow, 'id' | 'email' | 'username' | 'display_name' | 'avatar_url'>): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
  };
}

async function persistRefreshToken(jti: string, userId: string, token: string): Promise<void> {
  const refreshExp = decodeTokenExpiry(token);
  const ttl = Math.max(1, refreshExp - Math.floor(Date.now() / 1000));
  const key = getRedisKeyForToken('refresh', jti);
  await redis.set(key, userId, 'EX', ttl);
}

async function revokeRefreshToken(jti: string): Promise<void> {
  const key = getRedisKeyForToken('refresh', jti);
  await redis.del(key);
}

async function issueTokenPair(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessToken = signAccessToken(userId, accessJti);
  const refreshToken = signRefreshToken(userId, refreshJti);

  await persistRefreshToken(refreshJti, userId, refreshToken);

  return {
    accessToken,
    refreshToken,
  };
}

router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''));
    const password = String(req.body.password || '');

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    validatePassword(password);

    const existing = await findUserByEmail(email);
    if (existing) {
      throw new AppError('Email is already registered', 409);
    }

    const passwordHash = await hashPassword(password);
    const username = await generateUniqueUsername(email);
    const displayName = email.split('@')[0] || username;

    const inserted = await query<UserRow>(
      `
        INSERT INTO users (email, username, password_hash, display_name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, username, display_name, avatar_url, password_hash
      `,
      [email, username, passwordHash, displayName],
    );

    const user = inserted.rows[0];

    // Issue tokens so the frontend can auto-login after registration
    const tokens = await issueTokenPair(user.id);

    res.status(201).json({
      status: 'success',
      data: {
        user: userToResponse(user),
        ...tokens,
        message: 'Registration successful.',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''));
    const password = String(req.body.password || '');

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const user = await findUserByEmail(email);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      throw new AppError('Invalid credentials', 401);
    }

    const tokens = await issueTokenPair(user.id);

    res.json({
      status: 'success',
      data: {
        user: userToResponse(user),
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/oauth/google', async (req: Request, res: Response, next) => {
  try {
    const idToken = String(req.body.idToken || '');
    if (!idToken) {
      throw new AppError('idToken is required', 400);
    }

    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;

    // Strategy 1: Try verifying as a proper Google ID token (from GoogleLogin component)
    if (googleClient && googleClientId) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: googleClientId,
        });
        const payload = ticket.getPayload();
        if (payload?.email) {
          email = payload.email;
          name = payload.name;
          picture = payload.picture;
        }
      } catch {
        // Not a valid ID token — fall through to Strategy 2
      }
    }

    // Strategy 2: Treat it as a Google access token (from useGoogleLogin hook)
    // Verify by calling Google's userinfo endpoint server-side
    if (!email) {
      try {
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!googleRes.ok) {
          throw new AppError('Invalid Google token', 401);
        }

        const profile = await googleRes.json() as {
          email?: string;
          name?: string;
          picture?: string;
          sub?: string;
        };

        if (!profile.email) {
          throw new AppError('Google account email is required', 401);
        }

        email = profile.email;
        name = profile.name;
        picture = profile.picture;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('Failed to verify Google token', 401);
      }
    }

    if (!email) {
      throw new AppError('Could not verify Google token', 401);
    }

    const normalizedEmail = normalizeEmail(email);
    let user = await findUserByEmail(normalizedEmail);

    if (!user) {
      const username = await generateUniqueUsername(normalizedEmail);
      const displayName = name || normalizedEmail.split('@')[0] || username;
      const avatarUrl = picture || null;
      const randomPasswordHash = await hashPassword(randomUUID());

      const inserted = await query<UserRow>(
        `
          INSERT INTO users (email, username, password_hash, display_name, avatar_url, is_verified)
          VALUES ($1, $2, $3, $4, $5, true)
          RETURNING id, email, username, display_name, avatar_url, password_hash
        `,
        [normalizedEmail, username, randomPasswordHash, displayName, avatarUrl],
      );

      user = inserted.rows[0];
    } else if (picture && !user.avatar_url) {
      // Link avatar if existing user doesn't have one
      await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [picture, user.id]);
      user.avatar_url = picture;
    }

    const tokens = await issueTokenPair(user.id);

    res.json({
      status: 'success',
      data: {
        user: userToResponse(user),
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next) => {
  try {
    const refreshToken = String(req.body.refreshToken || '');
    if (!refreshToken) {
      throw new AppError('refreshToken is required', 400);
    }

    const payload = verifyRefreshToken(refreshToken);
    const key = getRedisKeyForToken('refresh', payload.jti);
    const userId = await redis.get(key);

    if (!userId || userId !== payload.sub) {
      throw new AppError('Refresh token is invalid or revoked', 401);
    }

    await revokeRefreshToken(payload.jti);
    const tokens = await issueTokenPair(payload.sub);

    res.json({
      status: 'success',
      data: tokens,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    const payload = req.auth;

    if (!payload) {
      throw new AppError('Unauthorized', 401);
    }

    const accessExp = decodeTokenExpiry(token);
    const ttl = Math.max(1, accessExp - Math.floor(Date.now() / 1000));
    const blacklistKey = getRedisKeyForToken('blacklist', payload.jti);

    await redis.set(blacklistKey, '1', 'EX', ttl);

    const refreshToken = req.body.refreshToken ? String(req.body.refreshToken) : null;
    if (refreshToken) {
      const refreshPayload = verifyRefreshToken(refreshToken);
      if (refreshPayload.sub === payload.userId) {
        await revokeRefreshToken(refreshPayload.jti);
      }
    }

    res.json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (err) {
    next(err);
  }
});

export default router;