// ====================================================
//      PARALLEL UNIVERSE DEVELOPMENT SERVER CONFIG
// ====================================================
// This file contains the configuration for the bot's
// official development server. The bot will use these
// settings to post announcements, updates, and status
// messages.
// ====================================================

module.exports = {
  // The ID of the official development server
  guildId: '1379099550014505031',

  // Channel IDs for specific functions
  // anoncement and updates
  channels: {
    // Channel for official bot announcements
    announcements: '1379170285508624389',

    // Channel for bot update logs and changelogs
    updates: '1379170330869764208',

    // Channel for a persistent bot status message
    status: '1379170381901860864',
  },
};
