async function dropDatabase(admin, name) {
  if (!/^raymond_test_\d+_\d+$/.test(name)) throw new Error('Refusing to drop an unknown database');
  // pg Pool.end resolves before every server-side socket has disappeared.
  // Wait for termination instead of forcibly killing clients during teardown.
  const deadline = Date.now() + 3000;
  while ((await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1', [name])).rows[0].count) {
    if (Date.now() >= deadline) throw new Error('Test database connections did not close');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await admin.query(`DROP DATABASE ${name}`);
}
module.exports = { dropDatabase };
