const {randomUUID}=require('node:crypto');
const db=require('../services/database');
async function create({guildId,issuerId,sourceId,targetId,includeBots,channelId,messageId,memberIds}) {
  if(!memberIds.length)throw new Error('No members selected');
  return db.transaction(async client=>{
    const {rows}=await client.query(`INSERT INTO mass_role_jobs (guild_id,issuer_id,source_role_id,target_role_id,include_bots,channel_id,message_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[guildId,issuerId,sourceId,targetId,Boolean(includeBots),channelId,messageId]);
    await client.query('INSERT INTO mass_role_items (job_id,user_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[rows[0].id,memberIds]);
    return rows[0];
  });
}
async function get(guildId,id) {
  const job=(await db.query(`SELECT j.*,COUNT(i.*)::int AS total,
    COUNT(*) FILTER (WHERE i.state='done')::int AS done,COUNT(*) FILTER (WHERE i.state='skipped')::int AS skipped,
    COUNT(*) FILTER (WHERE i.state='failed')::int AS failed,COUNT(*) FILTER (WHERE i.state='pending')::int AS remaining
    FROM mass_role_jobs j LEFT JOIN mass_role_items i ON i.job_id=j.id WHERE j.guild_id=$1 AND ($2::bigint IS NULL OR j.id=$2)
    GROUP BY j.id ORDER BY j.id DESC LIMIT 1`,[guildId,id || null])).rows[0];
  if(job?.failed)job.errors=(await db.query("SELECT user_id,last_error FROM mass_role_items WHERE job_id=$1 AND state='failed' ORDER BY user_id LIMIT 5",[job.id])).rows;
  return job;
}
async function active(guildId) {
  return (await db.query("SELECT * FROM mass_role_jobs WHERE guild_id=$1 AND state IN ('pending','running','paused','cancelling') LIMIT 1",[guildId])).rows[0];
}
async function claim() {
  return (await db.query(`WITH next AS (SELECT id FROM mass_role_jobs WHERE state='pending'
    OR (state IN ('running','cancelling') AND lease_until<NOW()) ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE mass_role_jobs j SET state=CASE WHEN j.state='cancelling' THEN 'cancelling' ELSE 'running' END,
    lease_token=$1,lease_until=NOW()+INTERVAL '2 minutes',updated_at=NOW() FROM next WHERE j.id=next.id RETURNING j.*`,[randomUUID()])).rows[0];
}
async function renew(job) {
  const {rows}=await db.query(`UPDATE mass_role_jobs SET lease_until=NOW()+INTERVAL '2 minutes',updated_at=NOW()
    WHERE id=$1 AND lease_token=$2 AND state IN ('running','cancelling') RETURNING state`,[job.id,job.lease_token]);
  if(!rows.length)throw Object.assign(new Error('Massrole lease lost'),{code:'LEASE_LOST'});
  return rows[0].state;
}
async function items(job) {return (await db.query("SELECT * FROM mass_role_items WHERE job_id=$1 AND state='pending' ORDER BY user_id LIMIT 20",[job.id])).rows;}
async function item(job,userId,changes) {
  const allowed=['state','started','target_added','last_error'],keys=Object.keys(changes).filter(key=>allowed.includes(key));
  if(!keys.length)return;
  const result=await db.query(`UPDATE mass_role_items SET ${keys.map((key,i)=>`${key}=$${i+4}`).join(',')}
    WHERE job_id=$1 AND user_id=$2 AND EXISTS (SELECT 1 FROM mass_role_jobs WHERE id=$1 AND lease_token=$3 AND state IN ('running','cancelling'))`,
  [job.id,userId,job.lease_token,...keys.map(key=>changes[key])]);
  if(!result.rowCount)throw Object.assign(new Error('Massrole lease lost'),{code:'LEASE_LOST'});
}
async function release(job,state,error=null) {
  return db.query(`UPDATE mass_role_jobs SET state=CASE WHEN state='cancelling' THEN 'cancelled' ELSE $3 END,last_error=$4,lease_token=NULL,lease_until=NULL,updated_at=NOW()
    WHERE id=$1 AND lease_token=$2`,[job.id,job.lease_token,state,error]);
}
async function cancel(guildId,id) {
  return (await db.query(`UPDATE mass_role_jobs SET state=CASE WHEN state IN ('running','cancelling') THEN 'cancelling' ELSE 'cancelled' END,
    updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND state IN ('pending','running','paused','cancelling') RETURNING *`,[guildId,id])).rows[0];
}
async function retry(guildId,id,issuerId) {
  return db.transaction(async client=>{
    const job=(await client.query('SELECT * FROM mass_role_jobs WHERE guild_id=$1 AND id=$2 FOR UPDATE',[guildId,id])).rows[0];
    if(!job || !['paused','completed'].includes(job.state))return false;
    await client.query("UPDATE mass_role_items SET state='pending',last_error=NULL WHERE job_id=$1 AND state='failed'",[id]);
    const pending=(await client.query("SELECT 1 FROM mass_role_items WHERE job_id=$1 AND state='pending' LIMIT 1",[id])).rowCount;
    if(!pending)return false;
    await client.query("UPDATE mass_role_jobs SET state='pending',issuer_id=$2,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1",[id,issuerId]);
    return true;
  });
}
async function prune(){await db.query("DELETE FROM mass_role_jobs WHERE state IN ('completed','cancelled') AND updated_at<NOW()-INTERVAL '30 days'");}
module.exports={create,get,active,claim,renew,items,item,release,cancel,retry,prune};
