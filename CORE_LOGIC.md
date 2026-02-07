  # Parallel Ultra Bot – Core Logic & Architecture Documentation

## Overview

**Parallel Ultra Bot** is a scalable, modular Discord bot built with Node.js, discord.js, and PostgreSQL. It is designed for extensibility, maintainability, and ease of adaptation to new tasks (e.g., music bots, utility bots). This document explains the core components, logic, and best practices so you can build new versions or extend the bot efficiently.

---

## 1. Project Structure

```
/paralelbot-js-master
  /src
    /commands         # Modular command files (by category)
    /config           # Configuration logic
    /database         # Database schemas & helpers
    /events           # Discord event handlers
    /handlers         # Command/event loader logic
    /interactions     # Slash commands & component interactions
    /premium          # Premium features logic
    /services         # External integrations
    /utils            # Utilities (logging, embeds, backups, etc.)
    index.js          # Main entry point
  /tests              # Test cases (if present)
  .env, package.json, README.md, ...
```

---

## 2. Core Logic & Workflow

### 2.1. Initialization (`src/index.js`)
- Loads environment variables and prints the changelog.
- Initializes the Discord.js client with required intents and partials.
- On joining a new guild, auto-creates a config entry in the database.
- Loads all commands, events, and interactions through handler modules.

### 2.2. Command System (`src/commands/`, `src/handlers/commandHandler.js`)
- Commands are organized by category (e.g., moderation, utility, OwnerOnly).
- Each command is a JS file exporting an object with `name`, `description`, `execute`, and optional properties (aliases, permissions, cooldown, etc.).
- The command handler recursively loads all command files into a `Map` on the client.
- Supports hot-reloading via `chokidar` (edit/add/remove command files without restarting the bot).

### 2.3. Event System (`src/events/`, `src/handlers/eventHandler.js`)
- Each event file handles a specific Discord event (e.g., `messageCreate`, `ready`, `guildMemberAdd`).
- The event handler loads all event files and registers them with the client.
- Supports hot-reloading for dynamic updates.
- Event files export `{ name, execute, once? }`.

### 2.4. Slash Commands & Interactions (`src/interactions/`)
- Modern Discord interactions (slash commands, buttons, select menus) are defined in this directory.
- Each slash command exports a `data` object (for registration) and an `execute` function.
- The handler loads and registers these commands with Discord's API.

### 2.5. Database Layer (`src/database/`)
- Uses PostgreSQL for persistent storage.
- Modules manage their own tables (e.g., `guildConfig.js` for per-guild settings, `warns.js` for moderation logs, `premium.js` for subscription tracking).
- Each module ensures its tables exist at startup.
- All config and operational data are stored per-guild for multi-server support.

### 2.6. Utilities (`src/utils/`)
- Common helpers: logging (via `winston`), embed builders, backups, error handling, retry logic, graceful shutdown.
- Promotes DRY principles and robust error reporting.

### 2.7. Premium System (`src/premium/`)
- Manages premium features, plans, and guild subscriptions.
- Premium status is stored in the database and checked for feature gating.

---

## 3. Extending & Adapting the Bot

### 3.1. Adding New Commands
- Create a new JS file in the appropriate `/src/commands/[category]/` folder.
- Export an object with `name`, `description`, and `execute(client, message, args)`.
- The command will be auto-loaded by the handler.

### 3.2. Adding New Events
- Add a JS file to `/src/events/` exporting `{ name, execute, once? }`.
- The event will be auto-registered.

### 3.3. Adding Slash Commands
- Place a file in `/src/interactions/Command/` with a `data` object and `execute(interaction)`.
- Register logic is handled by the slash command handler.

### 3.4. Adding Database Features
- Create a new module in `/src/database/`.
- Ensure tables are created/verified at startup.
- Use environment variables for connection strings.

### 3.5. Adding Premium or External Integrations
- Place logic in `/src/premium/` or `/src/services/` as appropriate.

---

## 4. Security & Best Practices
- **Environment Variables:** All secrets/config in `.env` (never commit secrets).
- **Input Validation:** Always validate and sanitize user input.
- **Error Handling:** Use try/catch and log all errors.
- **Permissions:** OwnerOnly and premium commands are strictly gated.
- **Logging:** All major actions/events/errors are logged.
- **Testing:** Use `/tests/` and utilities for robust testing.

---

## 5. Example: Creating a Music Bot Version
1. **Clone the project structure.**
2. **Add `/src/commands/music/`** with music-related commands (e.g., play.js, stop.js).
3. **Add event handlers for voice state/audio as needed.**
4. **Install required music/audio libraries and update `package.json`.**
5. **Update `.env` and configuration as needed.**
6. **Document new features in `README.md`.**

---

## 6. Summary Table of Core Modules

| Directory           | Purpose                                        |
|---------------------|------------------------------------------------|
| `/src/commands/`    | Prefix commands, organized by category         |
| `/src/events/`      | Discord event handlers                         |
| `/src/handlers/`    | Command/event/interaction loader logic         |
| `/src/interactions/`| Slash commands and component interactions      |
| `/src/database/`    | Database schemas and helpers                   |
| `/src/premium/`     | Premium features and subscription logic        |
| `/src/services/`    | External integrations (APIs, etc.)             |
| `/src/utils/`       | Utilities: logging, embeds, backups, etc.      |
| `index.js`          | Main entry point, client setup                 |

---

## 7. Database Layer: Core Logic & Architecture

### 1. Technology
- **Database Used:** PostgreSQL (managed via the `pg` Node.js library)
- **Purpose:** Persistent storage of all bot data (guild configs, warnings, premium status, moderation logs, temp voice configs, etc.)
- **Connection:** The database connection string is stored in the `.env` file as `DATABASE_URL`.

### 2. Structure & Key Modules
- **/src/database/**
  - Each file manages a specific data domain, table, or feature.
  - On startup, each module ensures its required tables exist (auto-creates if missing).

#### Main Modules:
- **guildConfig.js**
  - Manages the `guild_configs` table.
  - Stores per-guild settings: command prefix, embed customizations, anti-nuke configs, modmail setup, welcome/goodbye messages, etc.
- **warns.js**
  - Manages the `user_warnings` table.
  - Tracks user warnings per guild (for moderation).
- **jailSetting.js**
  - Manages `jail_settings` and `jailed_users` tables.
  - Used for temporary user restrictions (jail system).
- **autoRole.js**
  - Manages the `guild_auto_roles` table.
  - Assigns roles to new members automatically.
- **tempVoice.js**
  - Manages temp voice channel configurations per guild.
- **premium.js** (in `/src/premium/`)
  - Manages the `premium_guilds` table for premium subscriptions.

### 3. How It Works
- **Initialization:**  Each database module exports functions to ensure its tables exist (`ensureTable` or similar) and to perform CRUD operations.
- **Usage:**  All bot features that require persistence (settings, logs, premium, etc.) interact with these modules.
- **Per-Guild Isolation:**  All data is stored with a `guild_id` field to keep server data separate and secure.
- **Security:**  Only the bot and database have access to sensitive data. Secrets are never committed to code.

### 4. Extending the Database
- To add new persistent features:
  1. Create a new module in `/src/database/` (e.g., `musicSettings.js`).
  2. Define the table schema and ensure it is created at startup.
  3. Export functions for your feature (e.g., `setMusicChannel`, `getMusicChannel`).
  4. Use these functions in your command/event logic.

### 5. Example Table: guild_configs
| Column      | Type     | Description                                  |
|-------------|----------|----------------------------------------------|
| guild_id    | VARCHAR  | Discord server ID (PRIMARY KEY)              |
| prefix      | VARCHAR  | Custom command prefix                        |
| embed_color | VARCHAR  | Default embed color for this guild           |
| ...         | ...      | Other feature toggles and settings           |

### 6. Best Practices
- Always validate and sanitize all input before writing to the database.
- Use parameterized queries to prevent SQL injection.
- Store only non-sensitive data; keep secrets in `.env`.
- Regularly back up the database (see `/src/utils/dbBackup.js`).

---

## 8. References & Further Reading
- See `README.md` for setup and deployment.
- See `PROJECT_SUMMARY.md` for architectural diagrams and feature changelogs.
- Each module and handler is documented with JSDoc/TSDoc comments inline.

---

**This document is the definitive reference for understanding and extending Parallel Ultra Bot. Use it as a blueprint for building new bots or adapting the core logic to new domains.**
