const { randomUUID } = require('node:crypto');
const db = require('../services/database');
async function record(entry, guildId, seconds) {
  return (await db.query(`INSERT INTO owner_guard_events (entry_id,guild_id,actor_id,expires_at,lease_until,undo_mute,undo_deaf)
    VALUES ($1,$2,$3,NOW()+$4::integer*INTERVAL '1 second',NOW()+INTERVAL '2 minutes',FALSE,FALSE) ON CONFLICT DO NOTHING RETURNING *`,
  [entry.id,guildId,entry.executorId,seconds])).rows[0];
}
async function arm(job,mute,deaf) {
  const result=await db.query("UPDATE owner_guard_events SET undo_mute=$2,undo_deaf=$3 WHERE entry_id=$1 AND state='prepared'",[job.entry_id,mute,deaf]);
  if(!result.rowCount)throw new Error('Owner Guard action lease changed');
}
async function clearFlag(job,flag) {
  if(!['undo_mute','undo_deaf'].includes(flag))throw new Error('Invalid Owner Guard flag');
  const result=await db.query(`UPDATE owner_guard_events SET ${flag}=FALSE WHERE entry_id=$1 AND lease_token=$2`,[job.entry_id,job.lease_token]);
  if(!result.rowCount)throw new Error('Owner Guard expiry lease changed');
  job[flag]=false;
}
async function activate(id) {await db.query("UPDATE owner_guard_events SET state='active',lease_until=NULL WHERE entry_id=$1 AND state='prepared'",[id]);}
async function finish(job, state='done') {
  await db.query(`UPDATE owner_guard_events SET state=$2,lease_token=NULL,lease_until=NULL
    WHERE entry_id=$1 AND (($3::uuid IS NULL AND state IN ('prepared','active')) OR lease_token=$3)`,[job.entry_id,state,job.lease_token || null]);
}
async function claim() {
  return (await db.query(`WITH due AS (
    SELECT entry_id FROM owner_guard_events WHERE expires_at<=NOW() AND available_at<=NOW()
    AND (state='active' OR (state IN ('prepared','processing') AND lease_until<NOW()))
    ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE owner_guard_events e SET state='processing',lease_token=$1,lease_until=NOW()+INTERVAL '2 minutes',attempts=e.attempts+1
    FROM due WHERE e.entry_id=due.entry_id RETURNING e.*`,[randomUUID()])).rows[0];
}
async function retry(job) {
  await db.query(`UPDATE owner_guard_events SET state=$3,available_at=NOW()+INTERVAL '1 minute',lease_token=NULL,lease_until=NULL
    WHERE entry_id=$1 AND lease_token=$2`,[job.entry_id,job.lease_token,job.attempts>=10?'review':'active']);
}
async function defer(job) {
  await db.query(`UPDATE owner_guard_events SET state='active',available_at=NOW()+INTERVAL '1 minute',
    attempts=GREATEST(attempts-1,0),lease_token=NULL,lease_until=NULL WHERE entry_id=$1 AND lease_token=$2`,[job.entry_id,job.lease_token]);
}
async function prune() {await db.query("DELETE FROM owner_guard_events WHERE (state='done' AND created_at<NOW()-INTERVAL '7 days') OR (state='review' AND created_at<NOW()-INTERVAL '30 days')");}
module.exports={record,arm,clearFlag,activate,finish,claim,retry,defer,prune};
