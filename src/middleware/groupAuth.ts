import { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../types/index.js';
import { MemberRole } from '../types/index.js';
import { validateUUID } from '../lib/validate.js';

interface MemberRow {
  role: string;
}


export async function requireGroupMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) {
      throw new AppError('Unauthorized', 401);
    }

    const groupId = validateUUID(req.params['groupId'], 'groupId');

    const result = await query<MemberRow>(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.auth.userId],
    );

    if (result.rows.length === 0) {
      throw new AppError('You are not a member of this group', 403);
    }

    req.groupMembership = {
      groupId,
      role: result.rows[0].role as MemberRole,
    };

    next();
  } catch (err) {
    next(err);
  }
}


export async function requireGroupAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.groupMembership) {
      throw new AppError('Group membership not resolved', 500);
    }

    if (req.groupMembership.role !== MemberRole.ADMIN) {
      throw new AppError('Admin access required', 403);
    }

    next();
  } catch (err) {
    next(err);
  }
}
