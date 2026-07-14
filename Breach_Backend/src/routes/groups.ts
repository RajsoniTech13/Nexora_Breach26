import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { withTransaction, txQuery } from '../db/helpers.js';
import { AppError } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember, requireGroupAdmin } from '../middleware/groupAuth.js';
import {
  validateRequired,
  validateOptionalString,
} from '../lib/validate.js';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  created_by: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GroupWithCount extends GroupRow {
  member_count: string;
}

const router = Router();

function groupToResponse(g: GroupRow | GroupWithCount): Record<string, unknown> {
  const res: Record<string, unknown> = {
    id: g.id,
    name: g.name,
    description: g.description,
    coverImage: g.cover_image,
    createdBy: g.created_by,
    currency: g.currency,
    isActive: g.is_active,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
  if ('member_count' in g) {
    res.memberCount = parseInt(g.member_count, 10);
  }
  return res;
}


router.post('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const name = validateRequired(req.body.name, 'name');
    const description = validateOptionalString(req.body.description, 500, 'description');
    const coverImage = validateOptionalString(req.body.coverImage, 2000, 'coverImage');
    const currency = validateOptionalString(req.body.currency, 3, 'currency') ?? 'INR';
    const userId = req.auth!.userId;

    const group = await withTransaction(async (client) => {
      const inserted = await txQuery<GroupRow>(
        client,
        `INSERT INTO groups (name, description, cover_image, created_by, currency)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, description, coverImage, userId, currency],
      );

      const g = inserted.rows[0];

      // Auto-add the creator as admin
      await txQuery(
        client,
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')`,
        [g.id, userId],
      );

      // Create a ledger account for this user in this group
      await txQuery(
        client,
        `INSERT INTO ledger_accounts (group_id, user_id, type)
         VALUES ($1, $2, 'user_payable'), ($1, $2, 'user_receivable')`,
        [g.id, userId],
      );

      // Log activity
      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'member_added', $3)`,
        [g.id, userId, JSON.stringify({ addedBy: userId, role: 'admin' })],
      );

      return g;
    });

    res.status(201).json({
      status: 'success',
      data: { group: groupToResponse(group) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = req.auth!.userId;

    const result = await query<GroupWithCount>(
      `SELECT g.*, COUNT(gm2.id)::text AS member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
       JOIN group_members gm2 ON gm2.group_id = g.id
       WHERE g.is_active = true
       GROUP BY g.id
       ORDER BY g.updated_at DESC`,
      [userId],
    );

    res.json({
      status: 'success',
      data: { groups: result.rows.map(groupToResponse) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:groupId', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;

    const groupResult = await query<GroupRow>(
      `SELECT * FROM groups WHERE id = $1`,
      [groupId],
    );

    if (groupResult.rows.length === 0) {
      throw new AppError('Group not found', 404);
    }

    const membersResult = await query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId],
    );

    const group = groupToResponse(groupResult.rows[0]);
    group.members = membersResult.rows.map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      role: m.role,
      joinedAt: m.joined_at,
    }));

    res.json({ status: 'success', data: { group } });
  } catch (err) {
    next(err);
  }
});

router.get('/:groupId/activity', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
    const offset = (page - 1) * limit;

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM activity_log WHERE group_id = $1`,
      [groupId],
    );

    const activityResult = await query(
      `SELECT al.id, al.action_type, al.metadata, al.created_at,
              u.id AS user_id, u.username, u.display_name, u.avatar_url
       FROM activity_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.group_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );

    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    res.json({
      status: 'success',
      data: {
        activity: activityResult.rows.map((row) => ({
          id: row.id,
          actionType: row.action_type,
          metadata: row.metadata,
          createdAt: row.created_at,
          user: row.user_id
            ? {
              id: row.user_id,
              username: row.username,
              displayName: row.display_name,
              avatarUrl: row.avatar_url,
            }
            : null,
        })),
        pagination: { total, limit, offset },
      },
    });
  } catch (err) {
    next(err);
  }
});


router.patch('/:groupId', requireAuth, requireGroupMember, requireGroupAdmin, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (req.body.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(validateRequired(req.body.name, 'name'));
    }
    if (req.body.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.description, 500, 'description'));
    }
    if (req.body.coverImage !== undefined) {
      fields.push(`cover_image = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.coverImage, 2000, 'coverImage'));
    }
    if (req.body.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      values.push(validateOptionalString(req.body.currency, 3, 'currency'));
    }

    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    fields.push(`updated_at = NOW()`);
    values.push(groupId);

    const result = await query<GroupRow>(
      `UPDATE groups SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_active = true RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new AppError('Group not found', 404);
    }

    res.json({ status: 'success', data: { group: groupToResponse(result.rows[0]) } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:groupId', requireAuth, requireGroupMember, requireGroupAdmin, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;

    const result = await query(
      `UPDATE groups SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING id`,
      [groupId],
    );

    if (result.rows.length === 0) {
      throw new AppError('Group not found', 404);
    }

    res.json({ status: 'success', message: 'Group deactivated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
