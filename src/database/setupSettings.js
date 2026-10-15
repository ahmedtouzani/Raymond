const db = require('../services/database');
const { clearCache } = require('./guildConfig');
const { clearSettingsCache } = require('./levelSettings');
const { modules, defaults } = require('../services/setupRegistry');

function normalize(definition, value) {
  const result = { ...defaults(definition), ...(value || {}) };
  for (const field of definition.fields) {
    if (field.kind === 'number' && result[field.key] != null) result[field.key] = Number(result[field.key]);
  }
  return result;
}
function columns(definition) { return definition.fields.map(field => field.key); }
function comparable(definition, value) {
  if (definition.jsonKey) return value || {};
  const normalized = normalize(definition, value);
  return Object.fromEntries(columns(definition).map(key => [key, normalized[key] ?? null]));
}
function ordered(definition, values) {
  return values.map(value => comparable(definition, value)).sort((a, b) =>
    JSON.stringify(definition.identity.map(key => a[key])).localeCompare(JSON.stringify(definition.identity.map(key => b[key]))));
}
function equal(a, b) {
  // JSONB key order is not guaranteed. Normalize recursively before comparing snapshots.
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
async function readSetupSettings(guildId) {
  if (!guildId) throw new Error('guildId is required');
  const config = (await db.query('SELECT prefix, settings FROM guild_configs WHERE guild_id=$1', [guildId])).rows[0];
  const settings = config?.settings || {};
  const entries = await Promise.all(Object.entries(modules).map(async ([name, definition]) => {
    if (definition.launcher) return [name, {}];
    if (definition.jsonKey) return [name, settings[definition.jsonKey] || {}];
    if (definition.topKeys) return [name, normalize(definition, Object.fromEntries(columns(definition)
      .filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]])))];
    if (name === 'general') return [name, normalize(definition, { prefix: config?.prefix || '!' })];
    const result = await db.query(`SELECT ${columns(definition).join(', ')} FROM ${definition.table} WHERE guild_id=$1`, [guildId]);
    return [name, definition.collection ? ordered(definition, result.rows) : normalize(definition, result.rows[0])];
  }));
  return Object.fromEntries(entries);
}

async function saveSetupSettings(guildId, name, draft, original) {
  if (!guildId) throw new Error('guildId is required');
  const definition = modules[name];
  if (!definition || definition.launcher) throw new Error('Unknown setup module');
  const saved = await db.transaction(async client => {
    if (definition.jsonKey || definition.topKeys) {
      await client.query('INSERT INTO guild_configs (guild_id) VALUES ($1) ON CONFLICT DO NOTHING', [guildId]);
      const config = (await client.query('SELECT settings FROM guild_configs WHERE guild_id=$1 FOR UPDATE', [guildId])).rows[0];
      const settings = config.settings || {};
      const current = definition.jsonKey ? settings[definition.jsonKey] || {} : comparable(definition, settings);
      const expected = definition.jsonKey ? original : comparable(definition, original);
      if (!equal(current, expected)) return false;
      const updates = definition.jsonKey ? { [definition.jsonKey]: draft } : comparable(definition, draft);
      await client.query("UPDATE guild_configs SET settings=COALESCE(settings,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE guild_id=$1", [guildId, JSON.stringify(updates)]);
      return true;
    }
    const table = definition.table, fields = columns(definition);
    if (definition.collection) {
      // Serialize our collection editors; lock existing records against ordinary updates as well.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`setup:${table}:${guildId}`]);
      const current = (await client.query(`SELECT ${fields.join(', ')} FROM ${table} WHERE guild_id=$1 FOR UPDATE`, [guildId])).rows;
      if (!equal(ordered(definition, current), ordered(definition, original))) return false;
      // Update/insert retained records and delete only explicitly removed identities.
      const identities = new Set(draft.map(item => JSON.stringify(definition.identity.map(key => item[key]))));
      for (const item of current) {
        if (!identities.has(JSON.stringify(definition.identity.map(key => item[key])))) {
          await client.query(`DELETE FROM ${table} WHERE guild_id=$1 AND ${definition.identity.map((key, i) => `${key}=$${i + 2}`).join(' AND ')}`,
            [guildId, ...definition.identity.map(key => item[key])]);
        }
      }
      for (const item of draft) {
        const values = comparable(definition, item);
        await client.query(`INSERT INTO ${table} (guild_id, ${fields.join(', ')}) VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')})
          ON CONFLICT (guild_id, ${definition.identity.join(', ')}) DO UPDATE SET ${fields.map(key => `${key}=EXCLUDED.${key}`).join(', ')}`,
        [guildId, ...fields.map(key => values[key])]);
      }
      return true;
    }
    await client.query(`INSERT INTO ${table} (guild_id) VALUES ($1) ON CONFLICT DO NOTHING`, [guildId]);
    const current = (await client.query(`SELECT ${fields.join(', ')} FROM ${table} WHERE guild_id=$1 FOR UPDATE`, [guildId])).rows[0];
    if (!equal(comparable(definition, current), comparable(definition, original))) return false;
    const values = comparable(definition, draft);
    await client.query(`UPDATE ${table} SET ${fields.map((key, i) => `${key}=$${i + 2}`).join(', ')} WHERE guild_id=$1`, [guildId, ...fields.map(key => values[key])]);
    return true;
  });
  if (saved) {
    clearCache(guildId);
    if (name === 'levels') clearSettingsCache(guildId);
  }
  return saved;
}
module.exports = { readSetupSettings, saveSetupSettings };
