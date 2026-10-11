import { terminateUserSessions } from '../../core/session/sessionTerminator.js';
import { logger } from '../../core/utils/logger.js';

/**
 * Red-Zone File: Super Admin Revocation Service
 * Permanently revokes access and calls unified sessionTerminator.
 */
export class RevocationService {
  static async revokeUser(userId, actorId, reason) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Revocation reason is required');
    }

    logger.warn(`User ${userId} REVOKED by Super Admin ${actorId}. Reason: ${reason}`);

    // Call unified session terminator
    await terminateUserSessions(userId, `Permanent revocation by Super Admin: ${reason}`);

    return {
      userId,
      revokedBy: actorId,
      status: 'REVOKED',
      revokedAt: new Date()
    };
  }
}
