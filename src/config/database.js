const fs = require('node:fs');

function getDatabaseOptions(connectionString = process.env.DATABASE_URL, env = process.env) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('A valid DATABASE_URL is required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  if (url.searchParams.get('sslmode') === 'no-verify') throw new Error('Database TLS certificate verification must remain enabled');
  const needsTls = env.DATABASE_SSL === 'true' || Boolean(env.DATABASE_SSL_CA_FILE)
    || url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co');
  if (needsTls && url.searchParams.get('sslmode') === 'disable') throw new Error('Database TLS cannot be disabled for this configuration');
  const ssl = needsTls ? { rejectUnauthorized: true } : undefined;
  if (ssl && env.DATABASE_SSL_CA_FILE) {
    ssl.ca = fs.readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8');
    if (url.searchParams.has('sslcert')) ssl.cert = fs.readFileSync(url.searchParams.get('sslcert'), 'utf8');
    if (url.searchParams.has('sslkey')) ssl.key = fs.readFileSync(url.searchParams.get('sslkey'), 'utf8');
    // pg URL SSL options replace the supplied SSL object. Keep the trusted CA.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    connectionString = url.toString();
  }
  return { connectionString, ssl };
}
module.exports = { getDatabaseOptions };
