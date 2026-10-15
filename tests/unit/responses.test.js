const test = require('node:test');
const assert = require('node:assert/strict');
const { EmbedBuilder, ContainerBuilder, MessageFlags, MessageFlagsBitField } = require('discord.js');
const { asEmbed } = require('../../src/utils/responses');
const { loadModule } = require('../helpers/load-module.cjs');

test('plain usage and error strings render inside an embed with no message text', () => {
  const text = 'Use `case <number>`, `case @member [page]`, or `case edit <number> <reason>`.';
  const payload = asEmbed(text);
  assert.equal(payload.content, '');
  assert.equal(payload.embeds[0].toJSON().description, text);
  assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
});

test('private errors preserve ephemeral flags, files, controls and explicit mention settings', () => {
  const original = { content: 'You do not have permission.', flags: new MessageFlagsBitField(MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds),
    files: [{ attachment: 'example.png' }], components: [], allowedMentions: { parse: [] } };
  const payload = asEmbed(original);
  assert.equal(payload.flags, MessageFlags.Ephemeral);
  assert.equal(payload.files, original.files); assert.equal(payload.components, original.components);
  assert.equal(payload.allowedMentions, original.allowedMentions);
  assert.equal(original.content, 'You do not have permission.');
  assert.equal(payload.content, '');
});

test('Components V2, existing embeds, attachments without text and content clearing remain intact', () => {
  for (const original of [
    { components: [new ContainerBuilder()], flags: MessageFlags.IsComponentsV2 },
    { content: '<@123>', embeds: [new EmbedBuilder().setDescription('Existing announcement')] },
    { files: [{ attachment: 'rank.png' }] }, { content: '' },
  ]) assert.equal(asEmbed(original), original);
});

test('case usage replies as an embed before any record data is read', async () => {
  const responses = [];
  const command = loadModule('src/commands/moderation/case.js', {
    '../../database/moderationRecords': {},
    '../../services/moderationRecords': { canReadRecords: () => true },
    '../../utils/embed': {}, '../../config/setupEmojis': {},
  });
  await command.execute({ member: {}, author: { id: 'staff' },
    mentions: { users: { first: () => null } }, reply: async payload => responses.push(payload),
  });
  assert.equal(responses.length, 1); assert.equal(responses[0].content, '');
  assert.match(responses[0].embeds[0].toJSON().description, /case <number>/);
});
