import type { AuthenticatedUser } from './auth.js';
import type { MemberRole } from './index.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
      groupMembership?: {
        groupId: string;
        role: MemberRole;
      };
    }
  }
}

export {};
