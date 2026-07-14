import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateOptionalString, validateRequired } from '../lib/validate.js';

interface UserProfileRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  upi_id: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

const router = Router();

function userToResponse(user: UserProfileRow): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    upiId: user.upi_id,
    isVerified: user.is_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

router.get('/me', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = req.auth!.userId;

    const result = await query<UserProfileRow>(
      `SELECT id, email, username, display_name, avatar_url, upi_id, is_verified, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    res.json({
      status: 'success',
      data: { user: userToResponse(result.rows[0]) },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/me', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = req.auth!.userId;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (req.body.displayName !== undefined) {
      fields.push(`display_name = $${paramIndex++}`);
      values.push(validateRequired(req.body.displayName, 'displayName'));
    }

    if (req.body.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.avatarUrl, 2000, 'avatarUrl'));
    }

    if (req.body.upiId !== undefined) {
      fields.push(`upi_id = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.upiId, 100, 'upiId'));
    }

    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    fields.push('updated_at = NOW()');
    values.push(userId);

    const result = await query<UserProfileRow>(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, username, display_name, avatar_url, upi_id, is_verified, created_at, updated_at`,
      values,
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    res.json({
      status: 'success',
      data: { user: userToResponse(result.rows[0]) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/search', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const q = validateRequired(req.query['q'], 'q');
    const limit = Math.min(25, Math.max(1, parseInt(String(req.query['limit'] ?? '10'), 10) || 10));

    const result = await query<UserProfileRow>(
      `SELECT id, email, username, display_name, avatar_url, upi_id, is_verified, created_at, updated_at
       FROM users
       WHERE username ILIKE $1 OR display_name ILIKE $1 OR email ILIKE $1
       ORDER BY username ASC
       LIMIT $2`,
      [`%${q}%`, limit],
    );

    res.json({
      status: 'success',
      data: {
        users: result.rows.map(userToResponse),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
