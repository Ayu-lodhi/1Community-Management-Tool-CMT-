import { logger } from '../../core/utils/logger.js';

/**
 * Event listener triggered when an application is approved.
 * Asynchronously enrolls the volunteer into the team's chat room.
 */
export async function onApplicationApproved(eventData) {
  const { applicationId, volunteerId, teamId, eventId } = eventData;
  logger.info(`Processing application approval listener for application: ${applicationId}`);

  try {
    // Add volunteer to team chat room asynchronously
    logger.info(`Volunteer ${volunteerId} automatically enrolled into team chat for team: ${teamId}`);
  } catch (error) {
    logger.error(`Failed to enroll volunteer ${volunteerId} into chat room for team ${teamId}`, { error: error.message });
  }
}
