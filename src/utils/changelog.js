const fs = require('fs');
const path = require('path');

/**
 * Appends an entry to the CHANGELOG.md file in the project root.
 * @param {string} type - The type of event (e.g., 'ERROR', 'INFO', 'COMMAND', 'EVENT').
 * @param {string} description - A description of what happened.
 */
function updateChangelog(type, description) {
  const changelogPath = path.join(__dirname, '../../CHANGELOG.md');
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
  const entry = `- [${timestamp}] [${type}] ${description}\n`;

  // Find today's date header or add it if missing
  let changelog = '';
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  }
  const today = new Date().toISOString().slice(0, 10);
  const dateHeader = `## ${today}`;
  if (!changelog.includes(dateHeader)) {
    changelog += `\n${dateHeader}\n`;
  }
  changelog += entry;
  fs.writeFileSync(changelogPath, changelog, 'utf8');
}

module.exports = { updateChangelog };
