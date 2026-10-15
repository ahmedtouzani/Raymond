const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/load-module.cjs');
const warning = '<a:warningbug:1467300628907954300>';
const { createEmbed } = loadModule('src/utils/embed.js', {
  '../database/guildConfig': { getGuildConfig: async () => ({ settings: {} }) },
});

test('warning emoji is sent in a renderable description instead of an embed title', async () => {
  const embed = await createEmbed('guild', { title: `${warning} Roles Not Set`, description: 'Please configure verification.' });
  const payload = embed.toJSON();
  assert.equal(payload.title, 'Roles Not Set');
  assert.equal(payload.description, `${warning} Please configure verification.`);
});

test('warning field names become plain text without duplicating existing emojis in values', async () => {
  const embed = await createEmbed('guild', { title: 'Check', fields: [
    { name: `${warning} Alerts`, value: 'Review this member.' },
    { name: `${warning} Notes`, value: `${warning} Already shown.` },
  ] });
  const fields = embed.toJSON().fields;
  assert.equal(fields[0].name, 'Alerts');
  assert.equal(fields[0].value, `${warning} Review this member.`);
  assert.equal(fields[1].value, `${warning} Already shown.`);
});
