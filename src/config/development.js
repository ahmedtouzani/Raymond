function isDevelopment() { return String(process.env.DEVELOPMENT_MODE || 'false').toLowerCase() === 'true'; }
function allowsGuild(guildId) {
  if (!isDevelopment()) return true;
  const ids = String(process.env.DEVELOPMENT_GUILD_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  return Boolean(guildId && ids.includes(guildId));
}
module.exports = { isDevelopment, allowsGuild };

function allowsAutomation(guildId) {
  return !isDevelopment() || (process.env.DEVELOPMENT_AUTOMATION_ENABLED === 'true' && allowsGuild(guildId));
}
module.exports.allowsAutomation = allowsAutomation;
