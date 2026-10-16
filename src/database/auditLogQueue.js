const { randomUUID } = require('node:crypto');
const db = require('../services/database');
const MAX_ATTEMPTS = 5;
async function enqueue(guildId, key, category, payload) {
  if (!guildId || !key || !['moderation','messages','members','server','voice'].includes(category)) throw new Error('Invalid audit event');
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > 24000) throw new Error('Audit payload exceeds limit');
  const result = await db.query(`INSERT INTO audit_log_queue (guild_id,event_key,category,payload) VALUES ($1,$2,$3,$4)
    ON CONFLICT (guild_id,event_key) DO NOTHING RETURNING id`, [guildId,key,category,serialized]);
  return result.rows[0]?.id || null;
}
async function claim() {
  await db.query("UPDATE audit_log_queue SET status='failed',lease_token=NULL,lease_until=NULL,last_error='Delivery lease expired' WHERE status='processing' AND lease_until<NOW() AND attempts >= $1", [MAX_ATTEMPTS]);
  const result = await db.query(`WITH next AS (
    SELECT id FROM audit_log_queue WHERE attempts<$1 AND ((status='pending' AND available_at<=NOW()) OR (status='processing' AND lease_until<NOW()))
    ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE audit_log_queue q SET status='processing', attempts=q.attempts+1,lease_token=$2,lease_until=NOW()+INTERVAL '5 minutes'
    FROM next WHERE q.id=next.id RETURNING q.*`, [MAX_ATTEMPTS,randomUUID()]);
  return result.rows[0] || null;
}
async function finish(job, status, messageId = null) {
  const result = await db.query(`UPDATE audit_log_queue SET status=$3,delivered_at=NOW(),discord_message_id=$4,lease_token=NULL,lease_until=NULL
    WHERE id=$1 AND lease_token=$2`, [job.id,job.lease_token,status,messageId]);
  if (!result.rowCount) throw new Error('Audit delivery lease lost');
}
async function fail(job, error) {
  const permanent = [10003, 50001, 50013].includes(Number(error.code));
  const delay = Math.min(300000, 5000 * 2 ** (job.attempts - 1));
  await db.query(`UPDATE audit_log_queue SET status=CASE WHEN attempts >= $3 OR $4 THEN 'failed' ELSE 'pending' END,
    available_at=NOW()+$5::integer*INTERVAL '1 millisecond',lease_token=NULL,lease_until=NULL,last_error=$6
    WHERE id=$1 AND lease_token=$2`, [job.id,job.lease_token,MAX_ATTEMPTS,permanent,delay,`Delivery failed (${String(error.code || error.name || 'unknown').slice(0,60)})`]);
}
async function status(guildId) {
  if (!guildId) throw new Error('guildId required');
  return (await db.query('SELECT status,COUNT(*)::int AS count FROM audit_log_queue WHERE guild_id=$1 GROUP BY status', [guildId])).rows;
}
async function health(guildId) {
  if (!guildId) throw new Error('guildId required');
  const { rows } = await db.query(`SELECT
    MIN(created_at) FILTER (WHERE status IN ('pending','processing')) AS oldest_waiting,
    MAX(delivered_at) FILTER (WHERE status='delivered') AS last_delivered,
    COUNT(*) FILTER (WHERE status='failed')::int AS failed,
    COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS waiting
    FROM audit_log_queue WHERE guild_id=$1`, [guildId]);
  return rows[0];
}
async function prune() {
  await db.query("DELETE FROM audit_log_queue WHERE (status IN ('delivered','discarded') AND delivered_at<NOW()-INTERVAL '7 days') OR (status='failed' AND created_at<NOW()-INTERVAL '30 days')");
}
async function retry(guildId) {
  if (!guildId) throw new Error('guildId required');
  const result = await db.query(`WITH jobs AS (SELECT id FROM audit_log_queue WHERE guild_id=$1 AND status='failed' ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED)
    UPDATE audit_log_queue q SET status='pending',attempts=0,available_at=NOW(),lease_token=NULL,lease_until=NULL,last_error=NULL
    FROM jobs WHERE q.id=jobs.id RETURNING q.id`,[guildId]);
  return result.rowCount;
}
module.exports = { enqueue, claim, finish, fail, status, health, prune, retry };
