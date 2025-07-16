const fs = require('fs');
const path = require('path');
const { updateChangelog } = require('./changelog');

const pendingPath = path.join(__dirname, '../../pending-features.json');

function addPendingFeature(description) {
  let pending = [];
  if (fs.existsSync(pendingPath)) {
    try {
      pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    } catch (e) {
      pending = [];
    }
  }
  const feature = {
    description,
    date: new Date().toISOString(),
    status: 'pending'
  };
  pending.push(feature);
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2), 'utf8');
  updateChangelog('FEATURE[PENDING]', description);
}

function approveFeature(index) {
  if (!fs.existsSync(pendingPath)) return;
  let pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  if (pending[index]) {
    pending[index].status = 'approved';
    pending[index].approvedDate = new Date().toISOString();
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2), 'utf8');
    updateChangelog('FEATURE[APPROVED]', pending[index].description);
  }
}

module.exports = { addPendingFeature, approveFeature };
