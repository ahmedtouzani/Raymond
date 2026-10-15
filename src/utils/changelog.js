const fs = require('node:fs');
const path = require('node:path');

// Runtime events belong in ignored logs, never in the version-controlled changelog.
function updateChangelog(type, description) {
  const directory = path.join(__dirname, '../../logs');
  const entry = `- [${new Date().toISOString()}] [${type}] ${description}\n`;
  fs.mkdir(directory, { recursive: true }, error => {
    if (error) return;
    fs.appendFile(path.join(directory, 'events.log'), entry, () => {});
  });
}
module.exports = { updateChangelog };
