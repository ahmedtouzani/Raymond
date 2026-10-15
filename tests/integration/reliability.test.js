const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { dropDatabase } = require('../helpers/drop-database.cjs');
const { loadModule, silentLogger } = require('../helpers/load-module.cjs');
const adminUrl = process.env.RAYMOND_TEST_DATABASE_URL;

describe('Database reliability', { skip: !adminUrl }, () => {
  const name = `raymond_test_${process.pid}_${Date.now()}`;
  let admin, pool, url, db, levels, setup, auditQueue, created = false;
  before(async () => {
    admin = new Pool({ connectionString: adminUrl });
    await admin.query(`CREATE DATABASE ${name}`); created = true;
    const connection = new URL(adminUrl); connection.pathname = `/${name}`; url = connection.toString();
    pool = new Pool({ connectionString: url });
    const run = spawnSync(process.execPath, ['scripts/migrate.js'], { cwd: path.join(__dirname, '../..'), env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr || 'Fresh migration CLI must complete');
    db = { query: (...args) => pool.query(...args), transaction: async callback => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await callback(client); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } };
    auditQueue = loadModule('src/database/auditLogQueue.js', { '../services/database': db, 'node:crypto': { randomUUID } }, {}, { Buffer });
    levels = loadModule('src/database/levelSystem.js', { '../services/database': db, '../utils/logger': silentLogger });
    setup = loadModule('src/database/setupSettings.js', { '../services/database': db, './guildConfig': { clearCache() {} },
      './levelSettings': { clearSettingsCache() {} }, '../services/setupRegistry': require('../../src/services/setupRegistry') });
  });
  beforeEach(async () => { await pool.query('TRUNCATE audit_log_queue, user_levels RESTART IDENTITY'); });
  after(async () => { if (pool) await pool.end(); if (created) await dropDatabase(admin, name); if (admin) await admin.end(); });

  it('fresh migrations leave no AI tables or unused vector extension', async () => {
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND left(tablename, 3) = 'ai_' ")).rows;
    assert.equal(tables.length, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_extension WHERE extname='vector'")).rows[0].count, 0);
  });

  it('AI retirement deletes legacy data, is repeatable and preserves server features', async () => {
    const tables = ['ai_memory', 'ai_memories', 'ai_chat_usage', 'ai_chat_usage_hourly', 'ai_conversation_history', 'ai_whitelist', 'ai_agent_audit_log', 'ai_memory_queue'];
    for (const table of tables) {
      await pool.query(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, content TEXT)`);
      await pool.query(`INSERT INTO ${table} VALUES (1, 'legacy data')`);
    }
    const guild = 'ai-retirement';
    await pool.query(`INSERT INTO guild_configs (guild_id, prefix, settings) VALUES ($1, '?', $2)`, [guild, {
      ai: { allowed_users: ['old'] }, ai_allowed_users: ['old'], ai_allowed_roles: ['old-role'],
      verification: { verifiedRoleId: 'verified' }, auditLogs: { enabled: true, defaultChannelId: 'staff' }, other: { keep: true },
    }]);
    await levels.addXp(guild, 'member', 100);
    const records = loadModule('src/database/moderationRecords.js', { '../services/database': db });
    await records.createCase({ guildId: guild, targetId: 'member', moderatorId: 'staff', action: 'warn', reason: 'Keep record' });
    await auditQueue.enqueue(guild, 'keep-event', 'moderation', { title: 'Keep audit event' });
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations/20261015010000_remove_ai_features.sql'), 'utf8');
    await pool.query(sql); await pool.query(sql);
    for (const table of tables) assert.equal((await pool.query('SELECT to_regclass($1) AS name', [table])).rows[0].name, null);
    const config = (await pool.query('SELECT prefix,settings FROM guild_configs WHERE guild_id=$1', [guild])).rows[0];
    assert.equal(config.prefix, '?');
    assert.deepEqual(config.settings, { verification: { verifiedRoleId: 'verified' }, auditLogs: { enabled: true, defaultChannelId: 'staff' }, other: { keep: true } });
    assert.equal((await levels.getUserLevel(guild, 'member')).text_xp, 100);
    assert.equal((await records.getCase(guild, 1)).reason, 'Keep record');
    assert.equal((await auditQueue.status(guild))[0].count, 1);
  });

  it('setup preserves existing prefix, unrelated settings and other guilds', async () => {
    await pool.query(`INSERT INTO guild_configs (guild_id, prefix, settings) VALUES
      ('setup-a', '?', '{"verification":{"verifiedRoleId":"old"},"other":{"enabled":true}}'),
      ('setup-b', '$', '{"verification":{"verifiedRoleId":"untouched"}}')`);
    const original = (await setup.readSetupSettings('setup-a')).verification;
    assert.equal(await setup.saveSetupSettings('setup-a', 'verification', { verifiedRoleId: 'new' }, original), true);
    const row = (await pool.query("SELECT * FROM guild_configs WHERE guild_id='setup-a'")).rows[0];
    assert.equal(row.prefix, '?'); assert.equal(row.settings.other.enabled, true);
    assert.equal((await setup.readSetupSettings('setup-b')).verification.verifiedRoleId, 'untouched');
    assert.equal(await setup.saveSetupSettings('setup-a', 'verification', { verifiedRoleId: 'stale' }, original), false);
    assert.equal((await setup.readSetupSettings('setup-a')).verification.verifiedRoleId, 'new');
  });

  it('concurrent setup saves allow one winner and reject stale jail settings', async () => {
    const original = (await setup.readSetupSettings('setup-jail')).jail;
    const results = await Promise.all(['role-a', 'role-b'].map(jail_role_id =>
      setup.saveSetupSettings('setup-jail', 'jail', { jail_role_id, jail_voice_channel_id: 'voice' }, original)));
    assert.equal(results.filter(Boolean).length, 1);
    const current = (await setup.readSetupSettings('setup-jail')).jail;
    assert.equal(current.jail_voice_channel_id, 'voice');
    assert.equal(await setup.saveSetupSettings('setup-jail', 'jail', { ...current, jail_voice_channel_id: null }, current), true);
    assert.equal((await setup.readSetupSettings('setup-jail')).jail.jail_voice_channel_id, null);
  });

  it('concurrent verification setup saves reject stale drafts on a new guild', async () => {
    const results = await Promise.all(['role-a', 'role-b'].map(verifiedRoleId =>
      setup.saveSetupSettings('setup-new', 'verification', { verifiedRoleId }, {})));
    assert.equal(results.filter(Boolean).length, 1);
  });

  it('every single-record setup module saves to its existing storage and round-trips', async () => {
    const registry = require('../../src/services/setupRegistry');
    const guild = 'setup-every-single';
    const drafts = {
      autorole: { role_id: 'join-role', member_join_log_channel_id: 'join-log' },
      stats: { ...registry.defaults(registry.modules.stats), member_count_channel_id: 'members', voice_count_channel_id: 'voice', member_count_format: 'Members: {count}' },
      levels: { ...registry.defaults(registry.modules.levels), xp_multiplier: 2.5, text_xp_min: 30, text_xp_max: 50, excluded_channels: ['excluded'], force_theme: true, role_rewards_remove_previous: true },
      automod: { ...registry.defaults(registry.modules.automod), spamDetectionEnabled: false, autobanBlacklist: [{ guildId: '123456789012345678', name: 'Blocked' }], autobanLogChannel: 'ban-log' },
      applications: { staff_review_channel: 'reviews', role_moderator: 'mod', role_designer: 'design', role_developer: 'dev' },
      modmail: { modRoleIDs: ['support'], ticketCategoryId: 'tickets', modNotificationChannelID: 'notifications' },
      embeds: { color: 0x5865f2, footer: { text: 'Footer', iconURL: 'https://example.com/icon.png' }, thumbnail: 'https://example.com/image.png' },
      general: { prefix: '?' },
    };
    for (const [name, draft] of Object.entries(drafts)) {
      const original = (await setup.readSetupSettings(guild))[name];
      assert.equal(await setup.saveSetupSettings(guild, name, draft, original), true, name);
      assert.deepEqual(JSON.parse(JSON.stringify((await setup.readSetupSettings(guild))[name])), draft, name);
    }
    const config = (await pool.query('SELECT settings FROM guild_configs WHERE guild_id=$1', [guild])).rows[0].settings;
    assert.equal(config.spamDetectionEnabled, false);
    assert.equal(config.staff_review_channel, 'reviews');
    assert.equal(config.modRoleIDs[0], 'support');
    assert.equal(config.embed.footer.text, 'Footer');
    assert.equal((await pool.query('SELECT role_id FROM guild_auto_roles WHERE guild_id=$1', [guild])).rows[0].role_id, 'join-role');
  });

  it('TempVoice edits preserve multiple lobbies and reject a stale collection', async () => {
    const guild = 'setup-tempvoice';
    const lobbies = [
      { creator_channel_id: 'lobby-a', config_name: 'Default', enabled: true, category_id: 'category-a', support_role_id: null },
      { creator_channel_id: 'lobby-b', config_name: 'Support', enabled: true, category_id: 'category-b', support_role_id: 'support' },
    ];
    assert.equal(await setup.saveSetupSettings(guild, 'tempvoice', lobbies, []), true);
    const original = (await setup.readSetupSettings(guild)).tempvoice;
    const modified = original.map(item => ({ ...item, config_name: `${item.config_name} edited` }));
    assert.equal(await setup.saveSetupSettings(guild, 'tempvoice', modified, original), true);
    assert.equal(await setup.saveSetupSettings(guild, 'tempvoice', [], original), false);
    assert.equal((await setup.readSetupSettings(guild)).tempvoice.length, 2);
    assert.equal(await setup.saveSetupSettings(guild, 'tempvoice', [modified[0]], modified), true);
    assert.equal((await setup.readSetupSettings(guild)).tempvoice[0].creator_channel_id, 'lobby-a');
  });

  it('level rewards retain both ladders and detect changes made through legacy commands', async () => {
    const guild = 'setup-rewards';
    const rewards = [{ ladder: 'text', level: 5, role_id: 'text-role' }, { ladder: 'voice', level: 5, role_id: 'voice-role' }];
    assert.equal(await setup.saveSetupSettings(guild, 'rewards', rewards, []), true);
    const original = (await setup.readSetupSettings(guild)).rewards;
    await pool.query("INSERT INTO level_roles (guild_id, ladder, level, role_id) VALUES ($1, 'text', 10, 'legacy-role')", [guild]);
    assert.equal(await setup.saveSetupSettings(guild, 'rewards', [], original), false);
    assert.equal((await setup.readSetupSettings(guild)).rewards.length, 3);
  });

  it('reaction collections roll back deletions after a later invalid insert', async () => {
    const guild = 'setup-reactions';
    const reactions = [{ target_type: 'channel', target_id: 'channel-a', emoji: '👍' }];
    assert.equal(await setup.saveSetupSettings(guild, 'reactions', reactions, []), true);
    const original = (await setup.readSetupSettings(guild)).reactions;
    await assert.rejects(setup.saveSetupSettings(guild, 'reactions', [{ target_type: 'invalid', target_id: 'channel-b', emoji: '❤️' }], original));
    const current = (await setup.readSetupSettings(guild)).reactions;
    assert.equal(current.length, 1); assert.equal(current[0].target_id, 'channel-a');
  });

  it('concurrent collection editors preserve one winner without mixing drafts', async () => {
    const guild = 'setup-concurrent-rewards';
    const results = await Promise.all(['a', 'b'].map(role_id => setup.saveSetupSettings(guild, 'rewards', [{ ladder: 'text', level: 5, role_id }], [])));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await setup.readSetupSettings(guild)).rewards.length, 1);
  });

  it('member checker stays guild-scoped and refreshes invite records after a rejoin', async () => {
    const tracker = loadModule('src/services/inviteTracker.js', { './database': db, '../utils/logger': silentLogger });
    const profile = loadModule('src/database/memberCheck.js', { '../services/database': db });
    await pool.query("INSERT INTO member_invites (guild_id, member_id, inviter_id, joined_at) VALUES ('check-guild', 'member', 'old', '2000-01-01')");
    await tracker.saveMemberInvite('check-guild', 'member', { inviterId: 'new', method: 'invite', code: 'code' });
    await pool.query("INSERT INTO user_warnings (guild_id, user_id, moderator_id, reason) VALUES ('check-other', 'member', 'mod', 'Other guild')");
    const data = await profile.getMemberCheckData('check-guild', 'member');
    assert.equal(data.invite.inviter_id, 'new');
    assert(new Date(data.invite.joined_at).getTime() > Date.now() - 10000);
    assert.equal(data.warnings, 0); assert.equal(data.jail, false);
    assert.equal((await profile.getMemberCheckData('check-other', 'member')).invite, null);
  });

  it('fresh migrations include every file and repeating the CLI exits without hanging', async () => {
    const expected = fs.readdirSync(path.join(__dirname, '../../migrations')).filter(file => file.endsWith('.sql')).length;
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, expected);
    const run = spawnSync(process.execPath, ['scripts/migrate.js'], { cwd: path.join(__dirname, '../..'), env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 0); assert(run.stdout.includes('already up to date'));
  });

  it('audit queue deduplicates by guild/event and concurrent claims are exclusive', async () => {
    await auditQueue.enqueue('guild-a','event','moderation',{title:'Ban'});
    assert.equal(await auditQueue.enqueue('guild-a','event','moderation',{title:'Duplicate'}),null);
    await auditQueue.enqueue('guild-b','event','moderation',{title:'Other guild'});
    const claims=await Promise.all([auditQueue.claim(),auditQueue.claim(),auditQueue.claim()]);
    assert.equal(claims.filter(Boolean).length,2);
    assert.equal(new Set(claims.filter(Boolean).map(job=>job.id)).size,2);
  });

  it('audit delivery acknowledgements reject expired workers and preserve delivered IDs', async () => {
    await auditQueue.enqueue('guild','event','messages',{title:'Deleted'});
    const stale=await auditQueue.claim();
    await pool.query("UPDATE audit_log_queue SET lease_until=NOW()-INTERVAL '1 minute' WHERE id=$1",[stale.id]);
    const recovered=await auditQueue.claim();
    await assert.rejects(auditQueue.finish(stale,'delivered','old'));
    await auditQueue.finish(recovered,'delivered','discord-message');
    const row=(await pool.query('SELECT status,discord_message_id FROM audit_log_queue WHERE id=$1',[stale.id])).rows[0];
    assert.equal(row.status,'delivered');assert.equal(row.discord_message_id,'discord-message');
  });

  it('audit failures back off and staff can retry only their guild’s failed deliveries', async () => {
    await auditQueue.enqueue('guild-a','event','server',{title:'Role update'});
    let job=await auditQueue.claim();
    await auditQueue.fail(job,{name:'NetworkError'});
    assert.equal(await auditQueue.claim(),null);
    await pool.query('UPDATE audit_log_queue SET available_at=NOW() WHERE id=$1',[job.id]);
    job=await auditQueue.claim();await auditQueue.fail(job,{code:50013});
    assert.equal((await auditQueue.status('guild-a'))[0].status,'failed');
    assert.equal(await auditQueue.retry('guild-b'),0);
    assert.equal(await auditQueue.retry('guild-a'),1);
    assert.equal((await auditQueue.claim()).attempts,1);
  });

  it('an exhausted audit lease becomes visible as failed and is not silently lost', async () => {
    await auditQueue.enqueue('guild','event','voice',{title:'Moved'});
    const job=await auditQueue.claim();
    await pool.query("UPDATE audit_log_queue SET attempts=5,lease_until=NOW()-INTERVAL '1 minute' WHERE id=$1",[job.id]);
    assert.equal(await auditQueue.claim(),null);
    assert.equal((await auditQueue.status('guild'))[0].status,'failed');
  });

  it('moderation case numbering is concurrent, guild-scoped and retries do not duplicate records', async () => {
    const records = loadModule('src/database/moderationRecords.js', { '../services/database': db });
    const cases = await Promise.all(Array.from({ length: 20 }, (_, i) => records.createCase({ guildId: 'case-a', targetId: 'target', moderatorId: 'mod', action: 'warn', reason: `Reason ${i}`, messageId: `message-${i}` })));
    assert.equal(new Set(cases.map(item => item.case_number)).size, 20);
    assert.equal(Math.max(...cases.map(item => item.case_number)), 20);
    const other = await records.createCase({ guildId: 'case-b', targetId: 'target', moderatorId: 'mod', action: 'warn' });
    assert.equal(other.case_number, 1);
    const retry = await records.createCase({ guildId: 'case-a', targetId: 'target', moderatorId: 'mod', action: 'warn', messageId: 'message-0', reason: 'Different retry reason' });
    assert.equal(retry.case_number, cases[0].case_number);
    assert.equal(retry.reason, 'Reason 0');
    assert.equal((await records.memberCases('case-b', 'target')).length, 1);
    assert.equal((await records.getCase('case-b', 2)), null);
  });

  it('case reason edits require authorship or elevated rights and retain the original reason', async () => {
    const records = loadModule('src/database/moderationRecords.js', { '../services/database': db });
    const record = await records.createCase({ guildId: 'case-edit', targetId: 'target', moderatorId: 'creator', action: 'ban', reason: 'Original' });
    assert.equal(await records.editCaseReason('case-edit', record.case_number, 'other', 'Unauthorized'), null);
    const changed = await records.editCaseReason('case-edit', record.case_number, 'creator', 'Corrected');
    assert.equal(changed.reason, 'Corrected'); assert.equal(changed.original_reason, 'Original'); assert.equal(changed.edited_by, 'creator');
    assert.equal(await records.editCaseReason('wrong-guild', record.case_number, 'creator', 'Wrong guild', true), null);
  });

  it('internal notes remain guild-scoped and deletion is recorded with author/elevated checks', async () => {
    const records = loadModule('src/database/moderationRecords.js', { '../services/database': db });
    const note = await records.addNote('notes-a', 'target', 'author', 'Private context');
    assert.equal((await records.memberNotes('notes-b', 'target')).length, 0);
    assert.equal(await records.deleteNote('notes-a', note.note_id, 'other'), null);
    assert.equal(await records.deleteNote('notes-b', note.note_id, 'author', true), null);
    const deleted = await records.deleteNote('notes-a', note.note_id, 'admin', true);
    assert.equal(deleted.deleted_by, 'admin'); assert(deleted.deleted_at);
    assert.equal((await records.memberNotes('notes-a', 'target')).length, 0);
    assert.equal((await pool.query('SELECT content FROM moderation_notes WHERE guild_id=$1 AND note_id=$2', ['notes-a', note.note_id])).rows[0].content, 'Private context');
  });

  it('a failed case insert rolls back its reserved counter number', async () => {
    const records = loadModule('src/database/moderationRecords.js', { '../services/database': db });
    const failing = loadModule('src/database/moderationRecords.js', { '../services/database': {
      ...db, transaction: callback => db.transaction(client => callback({ query: (sql, args) => {
        if (sql.startsWith('INSERT INTO moderation_cases')) throw new Error('Injected insert failure');
        return client.query(sql, args);
      } })),
    } });
    await assert.rejects(failing.createCase({ guildId: 'case-rollback', targetId: 'target', moderatorId: 'mod', action: 'warn' }));
    const created = await records.createCase({ guildId: 'case-rollback', targetId: 'target', moderatorId: 'mod', action: 'warn' });
    assert.equal(created.case_number, 1);
  });

  it('migration schema and ledger roll back together after a ledger failure', async () => {
    class FailingLedgerPool {
      constructor(options) { this.inner = new Pool(options); }
      query(...args) { return this.inner.query(...args); }
      async connect() {
        const client = await this.inner.connect();
        const query = client.query.bind(client), release = client.release.bind(client);
        client.query = async (...args) => {
          if (String(args[0]).startsWith('INSERT INTO schema_migrations')) throw new Error('Injected ledger failure');
          return query(...args);
        };
        client.release = () => { client.query = query; release(); };
        return client;
      }
      end() { return this.inner.end(); }
    }
    const Migrator = loadModule('scripts/migrate.js', {
      pg: { Pool: FailingLedgerPool }, path: require('node:path'), dotenv: { config() {} },
      '../src/config/database': require('../../src/config/database'), '../src/utils/logger': silentLogger,
      fs: { promises: { readdir: async () => ['rollback_probe.sql'], readFile: async () => 'BEGIN;\nCREATE TABLE rollback_probe (id INTEGER);\nCOMMIT;' } },
    }, { DATABASE_URL: url });
    const migrator = new Migrator();
    try { await assert.rejects(() => migrator.run(), /Injected ledger failure/); }
    finally { await migrator.close(); }
    assert.equal((await pool.query("SELECT to_regclass('rollback_probe') AS name")).rows[0].name, null);
  });

  it('concurrent migration runners apply the same pending migration exactly once', async () => {
    const Migrator = loadModule('scripts/migrate.js', {
      pg: { Pool }, path: require('node:path'), dotenv: { config() {} },
      '../src/config/database': require('../../src/config/database'), '../src/utils/logger': silentLogger,
      fs: { promises: { readdir: async () => ['concurrent_probe.sql'], readFile: async () =>
        'CREATE TABLE concurrent_probe (id INTEGER PRIMARY KEY); SELECT pg_sleep(0.1); INSERT INTO concurrent_probe VALUES (1);' } },
    }, { DATABASE_URL: url });
    const first = new Migrator(), second = new Migrator();
    try { await Promise.all([first.run(), second.run()]); }
    finally { await Promise.all([first.close(), second.close()]); }
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM concurrent_probe')).rows[0].count, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE name='concurrent_probe.sql'")).rows[0].count, 1);
  });

  it('a failing migration rolls back earlier pending files and their ledger entries', async () => {
    const Migrator = loadModule('scripts/migrate.js', {
      pg: { Pool }, path: require('node:path'), dotenv: { config() {} },
      '../src/config/database': require('../../src/config/database'), '../src/utils/logger': silentLogger,
      fs: { promises: {
        readdir: async () => ['batch_1_probe.sql', 'batch_2_probe.sql'],
        readFile: async file => String(file).endsWith('batch_1_probe.sql') ?
          'CREATE TABLE batch_rollback_probe (id INTEGER);' : 'INSERT INTO missing_batch_probe VALUES (1);',
      } },
    }, { DATABASE_URL: url });
    const migrator = new Migrator();
    try { await assert.rejects(() => migrator.run(), /missing_batch_probe/); }
    finally { await migrator.close(); }
    assert.equal((await pool.query("SELECT to_regclass('batch_rollback_probe') AS name")).rows[0].name, null);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE name IN ('batch_1_probe.sql','batch_2_probe.sql')")).rows[0].count, 0);
  });

  it('simultaneous text and voice updates preserve both counters for new users', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, index) => levels.addXp('guild', 'user', index % 2 ? 10 : 15, index % 2 ? 'voice' : 'text')));
    const user = await levels.getUserLevel('guild', 'user');
    assert.equal(user.text_xp, 150); assert.equal(user.voice_xp, 100);
    assert.equal(user.text_level, 1); assert.equal(user.voice_level, 1);
  });

  it('concurrent level transitions are serialized and preserve remaining XP', async () => {
    await Promise.all([levels.addXp('guild', 'user', 600), levels.addXp('guild', 'user', 600)]);
    const user = await levels.getUserLevel('guild', 'user');
    assert.equal(user.text_level, 2); assert.equal(user.text_xp, 200); assert.equal(user.text_next_level_xp, 2000);
  });

});
