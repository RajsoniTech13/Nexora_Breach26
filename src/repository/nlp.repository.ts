import { pool } from '../db/pool.js';


export async function getUserById(
  userId: string
): Promise<{ id: string; display_name: string } | null> {
  const result = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
}


export async function getGroupMembersWithNames(
  groupId: string
): Promise<Array<{ id: string; display_name: string }>> {
  const result = await pool.query<{ id: string; display_name: string }>(
    `SELECT u.id, u.display_name
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY u.display_name ASC`,
    [groupId]
  );

  return result.rows;
}


export async function isUserInGroup(
  userId: string,
  groupId: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM group_members WHERE user_id = $1 AND group_id = $2 LIMIT 1`,
    [userId, groupId]
  );

  return result.rows.length > 0;
}