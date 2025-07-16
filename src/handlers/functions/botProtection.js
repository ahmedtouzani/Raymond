function protectBotTarget(targetUserId, clientUserId, messageAuthorId, ownerId) {
    if (targetUserId === clientUserId && messageAuthorId !== ownerId) {
      return true; // Target is bot, and author is NOT owner — block action
    }
    return false; // Allow
  }
  
  module.exports = { protectBotTarget };
  