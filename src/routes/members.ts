import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { withTransaction, txQuery } from '../db/helpers.js';
import { AppError } from '../types/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember, requireGroupAdmin } from '../middleware/groupAuth.js';
import { validateUUID, validateEnum } from '../lib/validate.js';

const router = Router({ mergeParams: true });

interface MemberDetailRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: string;
  joined_at: string;
}

router.post('/', requireAuth, requireGroupMember, requireGroupAdmin, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const addedBy = req.auth!.userId;

    let targetUserId: string;

    if (req.body.userId) {
      targetUserId = validateUUID(req.body.userId, 'userId');
    } else if (req.body.email) {
      const email = String(req.body.email).trim().toLowerCase();
      const userResult = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
      if (userResult.rows.length === 0) {
        throw new AppError('User not found with this email', 404);
      }
      targetUserId = userResult.rows[0].id;
    } else {
      throw new AppError('userId or email is required', 400);
    }

    // Check if already a member
    const existing = await query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, targetUserId],
    );
    if (existing.rows.length > 0) {
      throw new AppError('User is already a member of this group', 409);
    }

    await withTransaction(async (client) => {
      await txQuery(
        client,
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`,
        [groupId, targetUserId],
      );

      // Create ledger accounts for the new member
      await txQuery(
        client,
        `INSERT INTO ledger_accounts (group_id, user_id, type)
         VALUES ($1, $2, 'user_payable'), ($1, $2, 'user_receivable')`,
        [groupId, targetUserId],
      );

      // Log activity
      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'member_added', $3)`,
        [groupId, addedBy, JSON.stringify({ addedUserId: targetUserId, addedBy })],
      );
    });

    res.status(201).json({
      status: 'success',
      message: 'Member added successfully',
    });
  } catch (err) {
    next(err);
  }
});


router.get('/', requireAuth, requireGroupMember, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;

    const result = await query<MemberDetailRow>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.email, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId],
    );

    res.json({
      status: 'success',
      data: {
        members: result.rows.map((m) => ({
          id: m.id,
          username: m.username,
          displayName: m.display_name,
          avatarUrl: m.avatar_url,
          email: m.email,
          role: m.role,
          joinedAt: m.joined_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:userId', requireAuth, requireGroupMember, requireGroupAdmin, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const targetUserId = validateUUID(req.params['userId'], 'userId');
    const role = validateEnum(req.body.role, ['admin', 'member'] as const, 'role');

    if (targetUserId === req.auth!.userId) {
      throw new AppError('You cannot change your own role', 400);
    }

    const result = await query(
      `UPDATE group_members SET role = $1 WHERE group_id = $2 AND user_id = $3 RETURNING id`,
      [role, groupId, targetUserId],
    );

    if (result.rows.length === 0) {
      throw new AppError('Member not found in this group', 404);
    }

    res.json({ status: 'success', message: 'Role updated successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:userId', requireAuth, requireGroupMember, requireGroupAdmin, async (req: Request, res: Response, next) => {
  try {
    const groupId = req.groupMembership!.groupId;
    const targetUserId = validateUUID(req.params['userId'], 'userId');
    const removedBy = req.auth!.userId;

    if (targetUserId === removedBy) {
      throw new AppError('You cannot remove yourself from the group', 400);
    }

    await withTransaction(async (client) => {
      const result = await txQuery(
        client,
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING id`,
        [groupId, targetUserId],
      );

      if (result.rows.length === 0) {
        throw new AppError('Member not found in this group', 404);
      }

      // Log activity
      await txQuery(
        client,
        `INSERT INTO activity_log (group_id, user_id, action_type, metadata)
         VALUES ($1, $2, 'member_removed', $3)`,
        [groupId, removedBy, JSON.stringify({ removedUserId: targetUserId, removedBy })],
      );
    });

    res.json({ status: 'success', message: 'Member removed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
