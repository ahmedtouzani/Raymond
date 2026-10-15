# Developing Raymond

Use a separate Discord application and local PostgreSQL database. Keep production Railway credentials and data separate. All changes in this development session remain local; no push or deployment is authorized.

## Test bot

Set these non-secret development options alongside the securely configured BOT_TOKEN and OWNER_ID:

```env
DEVELOPMENT_MODE=true
DEVELOPMENT_GUILD_IDS=1351735584548196362
GLOBAL_PREFIX==
PREFIX==
```

The two equals signs in the dotenv prefix entries mean the value is `=`. Update the guild ID when using another test server. Development mode requires an explicit guild allowlist. It accepts declared prefixless commands and ignores other unprefixed messages. It disables message XP, auto-reactions, automod, and voice automation. Guild-member, invite, and reaction automation is disabled by default; DEVELOPMENT_AUTOMATION_ENABLED=true opts those events in for an allowed guild. Explicit prefix and slash commands remain available subject to authorization.

## Database and tests

The canonical entry point `src/index.js` runs pending migrations before loading bot services and connecting to Discord. Both `npm start` and `npm run dev` use it; Railway/Nixpacks starts with `npm start`. A migration failure exits with a nonzero status and prevents bot startup. You can still run `npm run migrate` separately for diagnostics. AI features have been removed. Migration `20261015010000_remove_ai_features.sql` permanently deletes their tables and stored data and removes their guild configuration keys. Review the selected database before running migrations; the cloud development helper uses only the local database. Historical migration names are preserved; the runner orders the level-settings dependency correctly and commits pending SQL and ledger changes together under a PostgreSQL transaction advisory lock. Concurrent startups serialize before reading the migration ledger; failed batches roll back together.

```bash
DATABASE_URL='postgresql:///raymond_dev?host=/workspace/.raymond/socket&user=raymond' npm run migrate
npm test
RAYMOND_TEST_DATABASE_URL='postgresql:///postgres?host=/workspace/.raymond/socket&user=raymond' npm run test:integration
```

Integration checks create their own temporary databases and remove them afterward. They never default to the application DATABASE_URL. See tests/README.md.

PostgreSQL TLS keeps certificate verification enabled. For an external database, use DATABASE_SSL=true if needed, with DATABASE_SSL_CA_FILE pointing to a trusted CA file when required. Supabase hosts enable verified TLS automatically. Local Unix sockets require no TLS. No external production database was validated in this session.

## AI

AI commands and auto-chat use the same access policy: the configured owner, database whitelist, AI_ALLOWED_USERS, AI_ALLOWED_ROLES, and guild allowlists. `=aiwhitelist add @user` is owner-only. Missing OWNER_ID does not grant ownership.

One GEMINI_API_KEY_1 enables both Gemini replies and the Memory Agent. GROQ_API_KEY_1 enables the primary provider; OPENROUTER_API_KEY enables the fallback. Store real values only in secure environment settings. Additional numbered keys are optional; the Agent no longer requires two keys. Gemini model IDs accept either `gemini-2.5-flash` or `models/gemini-2.5-flash`.

AI requests reserve quota before generation. Failed generation/delivery refunds that reservation; successfully delivered responses remain counted. Conversation history is stored as an ordered pair. Memory jobs are persisted and deduplicated by source message, claimed with leases, retried with backoff, and retained with failed status after five attempts. Expired processing leases can be recovered by another worker. This is at-least-once processing; a crash after a memory write but before acknowledgement may repeat the processing, so exact-once memory writes are not guaranteed. Curator search, updates, and pruning are restricted to the source user within the guild.

Inspect failed jobs with a read-only query against the development database:

```sql
SELECT id, guild_id, status, attempts, last_error
FROM ai_memory_queue WHERE status = 'failed' ORDER BY id;
```

Legacy memories with NULL guild_id remain stored but are excluded from guild reads and edits. `=ai forget all` deletes only the current guild's memories. A legacy global embedding-maintenance script remains an explicit administrative operation; it must not be aimed at production during development.

## Cloud startup

The prepared cloud workspace uses /workspace/.raymond/start-dev.sh. It starts the local database, applies migrations, and runs the test bot with the required session proxy and development settings. Runtime logs use ignored logs/ files; CHANGELOG.md is never used as a runtime output destination. The cloud proxy helper is outside the repository and requires https-proxy-agent installed there. This startup helper does not deploy to Railway.

## Validation limits

Automated checks cover permission denial, slash routing, development isolation, XP concurrency, setup draft persistence, moderation records, audit delivery, AI retirement, migration rollback and fresh/repeated migration runs. Live Discord login is checked separately. No AI providers, model downloads, conversation processing or background memory worker are part of the bot.

# Interactive server setup

Use `=setup` in the development server with Administrator permission (or as the configured bot owner). The panel supports Verification, Jail, AutoRole / Join Logs, TempVoice, Levels / XP, level reward roles, Stats Channels, AutoMod / invite blacklist, Staff Applications, Modmail, embed appearance and prefix. Auto Reactions remains restricted to the bot owner; Modmail and Self Role Menus retain their Stellar Matrix requirement. Self Role Menus opens its existing interactive designer from the panel. Existing roles and channels are selected through Discord menus; the main panel never creates server resources automatically.

Changes stay in a draft until Save. Back and Cancel discard unsaved changes; panels expire after five minutes of inactivity, with a maximum lifetime of fifteen minutes. Only the person who opened a panel can use it. Save rechecks Administrator permission, bot role hierarchy and channel permissions, and rejects drafts if the same feature was changed since opening it. Verification logs and the Jail voice channel are optional. Existing prefix and unrelated feature settings are retained.

TempVoice lobbies, level reward roles and auto reactions support multiple records with paginated lists. Add/edit/remove operations are staged until the collection's Save button; Cancel discards the entire draft. Numeric values, names, messages, URLs and invite lists use private modal forms. For the blacklist, enter one Discord invite per line; existing stored server IDs can be retained. Channel counter names support `{count}` or a plain base name. Level announcement messages support `{user}` and `{level}`. Reward roles use the existing text/voice ladder storage; the remove-previous switch is now honored by the role assignment service. Administrators, the bot owner and the optional Verificator role can use `verify boy/girl`, `vb` and `vg`; configuration still requires Manage Roles. Use `=verify check` or `=vcheck` to inspect verification setup, and `=vcheck @member` to inspect role consistency and bot hierarchy without changing roles.


`=checker @member` (aliases: `ck`, `check`, `membercheck`) provides an English moderation report with account creation/age, server join time, recorded invite attribution, warnings/jail, verification consistency, key permissions within the current server. Access requires Administrator, Manage Roles, the configured Verificator role, or the bot owner. Invite creators are inferred from recorded invite usage, not identified as the person who shared the link. Older/untracked joins and unavailable data are shown explicitly. Checker never searches other guilds or discloses their names, membership or ownership. Passive join-source tracking runs in the allowed development server without auto roles or join messages. Declared prefixless commands and aliases are enabled in development, including `aji`, `r`, `a` and `ck`. Both bots may respond if the production bot is also present in the same channel.

`se <custom emoji> [new_name]` (aliases: `stealemoji`, `addemoji`) imports up to ten custom emojis per request, including animated GIFs. The command works with and without the server prefix. It requires Create Expressions or Manage Expressions (or the bot owner), and the bot needs one of those permissions too. It fetches the server emoji list, previews accepted/skipped items and static/animated capacity, and waits for the requester to confirm. Cancel/expiry makes no changes. Confirmation rechecks permissions and capacity; duplicates and partial failures are reported individually. Images are downloaded only from Discord CDN, bounded to 256 KB with a 15-second download timeout. Unicode emojis and arbitrary image URLs are not accepted.

Moderation records use migration `20261014010000_moderation_records.sql`, applied to the local development database. Cases are recorded after successful ban/unban, kick, mute/unmute (including timer expiry), jail/unjail, warn and verification actions. Logging starts with the new implementation; historical Discord actions are not backfilled. Case numbers are allocated per guild in a transaction, with deduplication by source message/action/member. A logging failure is reported in runtime logs and never repeats a completed Discord action.

Use `case @member [page]`, `case <number>` or `case edit <number> <reason>`. Use `mn add @member <note>`, `mn @member [page]` or `mn delete <noteID>`. Both work prefixless, with `modnote`/`mn` and `case`/`cases`/`modcase` aliases. History/notes require moderation permissions; editing another moderator’s case or removing their note requires Administrator, Manage Server or the bot owner. Original case reasons are retained, and note removal retains a deletion record. Details are delivered to the requester’s DMs with mentions disabled. Staff should write notes in a staff channel; the bot removes invoking messages when allowed. If DMs are blocked, completed saves remain in the database and the bot prompts the moderator to enable DMs. Checker displays case and active-note counts to users with record access; it does not expose note text.

The rebuilt Help Center supports `help`, `h` and `commands`, with or without the prefix. Use `help se`, `help ck`, or `help verification` to open an alias directly or search a topic. Categories normalize legacy metadata, include the dispatcher’s built-in `setprefix`, and exclude private owner commands for every viewer, including the bot owner, from browsing, direct lookup, search and aliases. Help uses Discord Components V2 containers, clickable category/command cards, Search, Shortcuts and Start Here instead of embeds. Each command opens a concise example and access overview; Details expands full syntax and aliases, with extra guidance for configuration, member checks, staff records and emoji import. The menu supports category browsing, paginated command selection, private search forms, Back/Home and Close; it never executes a command. Sessions expire after five minutes idle or fifteen minutes total. No placeholder dashboard/support links are shown.

Audit Logs are configured in `setup` → Server → Audit Logs. They start disabled. Select a General Logs Channel, enable logging, and save; optional category channels override the general destination for moderation, messages, members, server changes and voice. Destinations must be text/announcement channels hidden from @everyone, with View Channel/Send Messages/Embed Links for the bot. The bot also needs View Audit Log to receive confirmed administrative audit events. Other role overwrites must be restricted to trusted staff by the server administrator. `logs status` shows queue state, `logs test` queues an explicit test, and `logs retry` requeues up to 100 failed deliveries from the current guild after configuration/permission fixes.

Coverage starts when enabled: confirmed Discord audit entries (roles, channels, permission changes, bans/kicks, member changes, invites, webhooks, emojis, threads and other supported audit actions); message edit/delete and bulk-delete events; member join/leave; and voice joins/leaves/moves. Completed Raymond moderation actions also send their Case number and responsible human moderator. A Discord audit entry and a Raymond Case are separate evidence and may both be logged. No historical backfill is performed. The system never guesses an actor by matching nearby timestamps. Exact deletion actors, departed-member reasons and old message text may be unavailable and are labelled honestly.

Message text capture is opt-in and disabled by default. Uncached content is unavailable. Private staff/owner command content is redacted; note text is not included in Case logs. Ignored channels (and their parent channel matches) are excluded. Bot messages and messages inside log destinations are ignored to avoid feedback loops; administrative changes to log channels remain observable. A failed or publicly visible category destination can fall back only to a configured general staff channel that passes the same checks. Current disabled/ignored settings are rechecked before delivery, and turning off text capture redacts already queued message text at delivery.

`20261015000000_audit_log_queue.sql` provides a persistent delivery queue with guild/event deduplication, exclusive processing leases, bounded retries and visible failed events. Discord nonces reduce duplicate posts; delivery remains at-least-once across a crash after send and before acknowledgement. Gateway events missed while the bot is offline cannot be recovered by this queue. Delivered/discarded event payloads are pruned after 7 days; failed events after 30 days. Audit delivery is independent of XP/automod development gates, but requires an allowed development guild plus explicit audit configuration. The worker stops before database shutdown.

### Setup presentation

`setup` uses Components V2, matching the Help command. The home view has section cards; section views have Configure buttons and a feature selector. Editors focus on the selected field and show related settings from the same group. Collection pagination, native selectors, modal editing, permission checks and draft/CAS save behavior remain in place. Closing or expiring a panel replaces its controls with a Components V2 session notice. Existing open panels should be reopened after a bot restart.


### AFK voice connections

`afk` and `unafk` remain private owner commands. AFK requires View Channel and Connect, waits for a fully ready voice connection and closes failed sessions. Repeated calls to the same ready channel reuse the existing connection; `unafk` cancels a pending attempt. A Discord connection failure is handled separately from a text-response failure. Voice uses `@discordjs/voice` 0.19.2+ with DAVE support, requiring Node.js 22.12+; Nixpacks selects Node.js 24. Hosts must permit Discord Voice WebSocket and UDP traffic. The managed development cloud returned HTTP 403 on Voice handshakes; a successful Gateway login does not validate live Voice transport.


### Text response presentation

Legacy text responses use `asEmbed` from `src/utils/responses.js` at their send/reply/edit call sites. Usage hints, permission denials, failures and confirmations appear as dark embeds with a timestamp and footer. The formatter is synchronous and performs no database requests, so it also works when an error concerns database availability. It preserves ephemeral flags, explicit mention settings, attachments and controls. Existing embed messages and Components V2 panels keep their own presentation. Content is cleared on converted edits so earlier plain text does not remain above the embed.
