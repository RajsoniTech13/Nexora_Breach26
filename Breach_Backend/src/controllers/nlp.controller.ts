import { Request, Response, NextFunction } from 'express';
import { parseExpenseText } from '../services/nlp.service.js';
import {
  getUserById,
  getGroupMembersWithNames,
  isUserInGroup,
} from '../repository/nlp.repository.js';

export async function parseExpenseController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const groupId = req.params.groupId as string;
    const text = req.body?.text as string | undefined;


    const userId = (req as any).auth?.userId as string;


    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text input is required. Try something like: "Paid 500 for lunch, split with Alice"',
      });
    }

    if (text.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Input too short. Describe the expense in at least a few words.',
      });
    }

    if (text.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Text too long. Keep it under 500 characters.',
      });
    }

    const isMember = await isUserInGroup(userId, groupId);

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this group.',
      });
    }


    const currentUser = await getUserById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found.',
      });
    }


    const groupMembers = await getGroupMembersWithNames(groupId);

    if (groupMembers.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Group has no members.',
      });
    }


    const parsedData = await parseExpenseText(
      text.trim(),
      { id: currentUser.id, name: currentUser.display_name },
      groupMembers.map((m) => ({ id: m.id, name: m.display_name }))
    );


    if (typeof parsedData.amount !== 'number' || parsedData.amount <= 0) {
      return res.status(422).json({
        success: false,
        error: 'Could not extract a valid amount. Please try rephrasing.',
      });
    }

    const validMemberIds = new Set(groupMembers.map((m) => m.id));


    if (!validMemberIds.has(parsedData.paid_by)) {
      parsedData.paid_by = currentUser.id;
    }


    parsedData.splits = parsedData.splits.filter((s: any) => validMemberIds.has(s.user_id));


    if (parsedData.splits.length === 0) {
      parsedData.splits = groupMembers.map((m) => ({ user_id: m.id }));
      parsedData.split_type = 'equal';
    }


    const validCategories = new Set(['food', 'travel', 'household', 'entertainment', 'rent', 'other']);
    if (!validCategories.has(parsedData.category)) {
      parsedData.category = 'other';
    }

    const validSplitTypes = new Set(['equal', 'percentage', 'custom']);
    if (!validSplitTypes.has(parsedData.split_type)) {
      parsedData.split_type = 'equal';
    }


    return res.status(200).json({
      success: true,
      message: 'Expense parsed successfully. Please review and confirm.',
      data: parsedData,
    });

  } catch (error: any) {
    console.error('[NLP] parse error:', error.message);

    if (error.message === 'AI failed to generate valid structured data.') {
      return res.status(422).json({
        success: false,
        error: 'AI could not understand your input. Please try rephrasing.',
      });
    }

    next(error);
  }
}