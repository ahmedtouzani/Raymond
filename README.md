# Raymond

Discord server moderation, audit logging and community tools built with Node.js, discord.js and PostgreSQL. Bot interfaces use English.

## Features

- Interactive Components V2 Help and Server Setup panels.
- Verification, jail, moderation cases and private staff notes.
- Member checks with account age, join information and recorded invitation attribution.
- Configurable staff Audit Logs for moderation, messages, members, server changes and voice.
- Text/voice leveling, rank cards, leaderboards and reward roles.
- Temporary voice channels, join roles, staff applications, role menus and Modmail.
- Custom emoji importing, including animated emojis, with an explicit preview.
- Declared command shortcuts that work without a prefix.

## Setup

Use a supported Node.js version (the development workspace runs Node.js 24) and PostgreSQL. Install dependencies with `npm ci`, configure `BOT_TOKEN`, `DATABASE_URL` and `OWNER_ID` privately using `.env.example`, then run:

```bash
npm start
```

Use `help` to discover commands and `setup` with your server prefix to configure features. Setup requires Administrator permission or the configured bot owner. Some features retain their Premium requirements.

For development use a separate Discord application, an explicit development guild allowlist and a local database. See [DEVELOPMENT.md](DEVELOPMENT.md) for the prepared cloud startup, prefix and isolation settings.

## Checks

```bash
npm test
RAYMOND_TEST_DATABASE_URL='postgresql:///postgres?host=/path/to/socket&user=test_user' npm run test:integration
```

See [tests/README.md](tests/README.md). Integration checks use their own disposable databases.

## AI retirement

AI commands, automatic chat, conversation history, memory processing, provider integration and model dependencies have been removed. There are no AI API keys or pgvector requirements.

Migration `20261015010000_remove_ai_features.sql` permanently removes AI tables and their stored data, clears AI guild settings and removes pgvector if no other database objects depend on it. It preserves moderation, leveling, setup and Audit Logs. Historical migrations and release notes remain as installation and release history; they do not describe active AI features. Every `npm start` applies pending migrations to `DATABASE_URL` before starting the bot, including this permanent AI cleanup on older installations. Back up an existing production database before its first startup with this version. Startup stops if migration fails; applied migrations are not repeated.
