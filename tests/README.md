# Regression checks

Run `npm test` for offline command authorization, dispatch, setup, help, moderation, audit delivery and development regression checks. External Discord effects are mocked.

For PostgreSQL checks, explicitly select a disposable local/test connection with permission to create databases:

```bash
RAYMOND_TEST_DATABASE_URL='postgresql:///postgres?host=/workspace/.raymond/socket&user=raymond' npm run test:integration
```

Integration tests create uniquely named databases, apply repository migrations, verify setup, levels, staff records, audit delivery and AI retirement, and drop their own databases afterward. They never fall back to the application's `DATABASE_URL`. Without the explicit test connection these checks are skipped. A skipped suite does not establish database readiness.

AI services, commands, provider diagnostics and memory tests have been removed with the feature. Historical SQL migrations are retained for existing installation compatibility; the retirement migration removes their tables from the final schema. PostgreSQL no longer requires pgvector.
