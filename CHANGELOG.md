# 📝 Changelog

All notable changes to Raymond will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.0.0] - 2026-02-08

### 🎉 The Intelligence Update

Major architectural upgrade focused on reliability, scalability, and autonomous intelligence.

### ✨ Added

#### Centralized API Key Management
- **New `apiKeyManager.js` service** - Centralized API key pool management
- **10+ API keys support** - Support for up to 10 Groq and 10 Gemini keys
- **Shared state** - Both `AIService` and `MemoryAgent` share failed key state
- **Round-robin selection** - Intelligent key rotation
- **Pool health monitoring** - Real-time API pool status tracking

#### Memory Agent v4.0
- **Throttling system** - 5-second delays between batch items to prevent rate limit exhaustion
- **Early exit logic** - Stops processing when high similarity (>85%) is detected
- **Robust error handling** - 429 errors trigger batch stop, re-queuing, and 5-minute cooldown
- **Zero memory loss** - Failed items automatically re-queued for processing
- **Batch processing** - Queue triggers on 30s interval or 5 messages

#### Enhanced Owner Recognition
- **Development collaboration mode** - Bot recognizes Ahmed as creator/developer
- **Technical openness** - Can discuss internals, architecture, limitations with owner
- **Raymond persona update** - Acknowledges creator as "one of the few he truly trusts"
- **Extended system context** - Detailed creator information in AI prompts

### ♻️ Changed

#### Performance Optimizations
- **Reduced MAX_ITERATIONS** - From 5 to 2 for faster, more decisive processing
- **API call reduction** - ~60% fewer API calls for memory processing
- **Batch processing time** - Intentionally slower (5s throttle) but more reliable

#### Code Architecture
- **Refactored `ai.js`** - Integrated with centralized apiKeyManager
- **Refactored `memoryAgent.js`** - Complete rewrite to use shared API pool
- **Removed state isolation** - Eliminated independent `failedKeys` maps

### 🐛 Fixed

#### Critical Bugs
- **Memory Agent runtime error** - Fixed "Cannot read properties of undefined (reading 'length')"
  - `_parseGeminiResponse()` now returns both `tool_calls` and `text`
  - Fixed missing properties causing crashes during conversation processing

- **State isolation** - Eliminated independent key management
  - Both services now share same `failedKeys` map via `apiKeyManager`
  - No more redundant rate limit hits on same keys

- **Missing property references** - Fixed `this.geminiKeys` references
  - Line 367: `_callGeminiWithTools()` now uses `apiKeyManager.getPoolHealth()`
  - Line 841: `getStats()` now uses `apiKeyManager.getPoolHealth()`

### 📊 Metrics

- **Rate Limit Errors**: Frequent → 0 (-100%)
- **API Calls (20 msgs)**: up to 100 → up to 40 (-60%)
- **Agent Iterations**: 5 max → 2 max (-60%)
- **API Pool Capacity**: 1 key → 10 keys/provider (+900%)
- **Memory Loss Risk**: High → Zero (re-queue on failure)

### 🔧 Technical Debt

- ✅ Eliminated duplicate key management code
- ✅ Centralized API failure tracking
- ✅ Improved error handling consistency
- ✅ Better separation of concerns

---

## [3.0.9] - 2026-01-XX

### Added
- Enhanced bilingual support (English/Arabic)
- Improved conversation history tracking
- User mention understanding in AI responses

### Fixed
- Memory retrieval optimization
- Rate limiting improvements

---

## [3.0.0] - 2025-12-XX

### Added
- **Semantic Memory (RAG)** - Vector embeddings with pgvector
- **Auto-Memory Learning** - Automatic fact extraction from conversations
- **Persona System** - Configurable AI personalities
- **Raymond Reddington** - Default sophisticated persona
- **Bilingual Support** - Full English and Arabic support

### Changed
- Migrated to PostgreSQL with pgvector extension
- Upgraded to Discord.js v14
- Refactored AI service architecture

---

## [2.0.9] - 2025-XX-XX

### Added
- Basic AI chat capabilities
- Conversation history
- Rate limiting system

---

## [2.0.0] - 2025-XX-XX

### Added
- Initial AI integration
- OpenRouter API support
- Basic memory system

---

## [1.0.0] - 2024-XX-XX

### Added
- Discord bot foundation
- Moderation commands
- Leveling system
- Welcome/goodbye messages
- Invite tracking

---

## Version History Summary

| Version | Date | Codename | Key Feature |
|---------|------|----------|-------------|
| **4.0.0** | 2026-02-08 | Intelligence Update | Centralized API + Autonomous Memory Agent |
| 3.0.9 | 2026-01-XX | - | Bilingual improvements |
| 3.0.0 | 2025-12-XX | Memory Update | Semantic Memory (RAG) |
| 2.0.9 | 2025-XX-XX | - | Chat refinements |
| 2.0.0 | 2025-XX-XX | - | AI Integration |
| 1.0.0 | 2024-XX-XX | Genesis | Initial Release |

---

## Migration Guides

### v3.x → v4.0

**No breaking changes!** v4.0 is fully backward compatible.

**Optional enhancements:**
1. Add more API keys to `.env` for better performance
2. Adjust Memory Agent batch interval if needed
3. Monitor pool health with new dev commands

```env
# Recommended: Add multiple API keys
GEMINI_API_KEY_1=...
GEMINI_API_KEY_2=...
# ... up to 10

GROQ_API_KEY_1=...
GROQ_API_KEY_2=...
# ... up to 10
```

**Database:** No migrations required ✅

---

## Links

- [Release Notes v4.0.0](RELEASE_NOTES_v4.0.0.md)
- [Release Notes v3.0.0](RELEASE_NOTES_v3.0.0.md)
- [Release Notes v2.0.9](RELEASE_NOTES_v2.0.9.md)

---

<div align="center">

📖 **Full documentation available in [README.md](README.md)**

</div>

## 2026-02-08
- [2026-02-08 09:01:17] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:01:21] [INFO] [Groq] Success with key gsk_UBhHDl...
- [2026-02-08 09:01:43] [INFO] [Memory Agent] Timer triggered, processing 1 queued conversations
- [2026-02-08 09:01:43] [INFO] [Memory Agent] Processing batch of 1 conversations
- [2026-02-08 09:01:52] [INFO] [Memory Agent] Turn 1/2 for user mrahmet48
- [2026-02-08 09:01:56] [INFO] [Memory Agent] Turn 1 completed in 3828ms
- [2026-02-08 09:01:56] [INFO] [Memory Agent] Turn 1: I have analyzed the user's message "كيف يمكنني بناء امبراطويرتي الخاصة ؟" (How can I build my own empire?). This is a question seeking advice and does not contain any personal information, identity, relationships, preferences, or aspirations of the user. According to the guidelines, questions without information should be ignored. Therefore, there is no memory to create or update from this turn.
- [2026-02-08 09:01:56] [INFO] [Memory Agent] Multi-turn processing complete in 12929ms (2 messages)
- [2026-02-08 09:01:56] [INFO] [Memory Agent] Batch processing complete
- [2026-02-08 09:03:38] [INFO] Loaded command: levelsetup
- [2026-02-08 09:03:38] [INFO] Loaded command: autoban
- [2026-02-08 09:03:38] [INFO] Loaded command: autospam
- [2026-02-08 09:03:38] [INFO] Loaded command: leaderboard
- [2026-02-08 09:03:38] [INFO] Loaded command: level
- [2026-02-08 09:03:38] [INFO] Loaded command: levelrole
- [2026-02-08 09:03:38] [INFO] Loaded command: add
- [2026-02-08 09:03:38] [INFO] Loaded command: ban
- [2026-02-08 09:03:38] [INFO] Loaded command: clear
- [2026-02-08 09:03:38] [INFO] Loaded command: delwarn
- [2026-02-08 09:03:38] [INFO] Loaded command: deny
- [2026-02-08 09:03:38] [INFO] Loaded command: jail
- [2026-02-08 09:03:38] [INFO] Loaded command: kick
- [2026-02-08 09:03:38] [INFO] Loaded command: lock
- [2026-02-08 09:03:38] [INFO] Loaded command: move
- [2026-02-08 09:03:38] [INFO] Loaded command: mute
- [2026-02-08 09:03:38] [INFO] Loaded command: nickname
- [2026-02-08 09:03:38] [INFO] Loaded command: role
- [2026-02-08 09:03:38] [INFO] Loaded command: setautorole
- [2026-02-08 09:03:38] [INFO] Loaded command: setstats
- [2026-02-08 09:03:38] [INFO] Loaded command: slowmode
- [2026-02-08 09:03:38] [INFO] Loaded command: tempvoice
- [2026-02-08 09:03:38] [INFO] Loaded command: unban
- [2026-02-08 09:03:38] [INFO] Loaded command: unjail
- [2026-02-08 09:03:38] [INFO] Loaded command: unlock
- [2026-02-08 09:03:38] [INFO] Loaded command: unmute
- [2026-02-08 09:03:38] [INFO] Loaded command: vb
- [2026-02-08 09:03:38] [INFO] Loaded command: verify
- [2026-02-08 09:03:38] [INFO] Loaded command: vg
- [2026-02-08 09:03:38] [INFO] Loaded command: warn
- [2026-02-08 09:03:38] [INFO] Loaded command: warns
- [2026-02-08 09:03:39] [INFO] Loaded command: afk
- [2026-02-08 09:03:39] [INFO] [API Key Manager] Initialized: 4 Groq keys, 4 Gemini keys
- [2026-02-08 09:03:39] [INFO] Loaded command: ai
- [2026-02-08 09:03:39] [INFO] Loaded command: aiwhitelist
- [2026-02-08 09:03:39] [INFO] Loaded command: autoreact
- [2026-02-08 09:03:39] [INFO] Loaded command: dev
- [2026-02-08 09:03:39] [INFO] Loaded command: massdm
- [2026-02-08 09:03:39] [INFO] Loaded command: nuke-server
- [2026-02-08 09:03:39] [INFO] Loaded command: premium
- [2026-02-08 09:03:39] [INFO] Loaded command: setuproles
- [2026-02-08 09:03:39] [INFO] Loaded command: shutdown
- [2026-02-08 09:03:39] [INFO] Loaded command: modmail
- [2026-02-08 09:03:39] [INFO] Loaded command: moveall
- [2026-02-08 09:03:39] [INFO] Loaded command: rolemenu
- [2026-02-08 09:03:39] [INFO] Loaded command: sendnotify
- [2026-02-08 09:03:39] [INFO] Loaded command: unafk
- [2026-02-08 09:03:39] [INFO] Loaded command: ping
- [2026-02-08 09:03:39] [INFO] Loaded command: ranktheme
- [2026-02-08 09:03:39] [INFO] Loaded command: setembedcolor
- [2026-02-08 09:03:39] [INFO] Loaded command: setembedfooter
- [2026-02-08 09:03:39] [INFO] Loaded command: setembedicon
- [2026-02-08 09:03:39] [INFO] Loaded command: top
- [2026-02-08 09:03:39] [INFO] Loaded command: avatar
- [2026-02-08 09:03:39] [INFO] Loaded command: botinfo
- [2026-02-08 09:03:39] [INFO] Loaded command: channelinfo
- [2026-02-08 09:03:39] [INFO] Loaded command: help
- [2026-02-08 09:03:39] [INFO] Loaded command: invite
- [2026-02-08 09:03:39] [INFO] Loaded command: roleinfo
- [2026-02-08 09:03:39] [INFO] Loaded command: serverinfo
- [2026-02-08 09:03:39] [INFO] Loaded command: userinfo
- [2026-02-08 09:03:39] [INFO] Loaded event: guildMemberAdd
- [2026-02-08 09:03:39] [INFO] Loaded event: guildMemberRemove
- [2026-02-08 09:03:39] [INFO] Loaded event: interactionCreate
- [2026-02-08 09:03:39] [INFO] Loaded event: inviteCreate
- [2026-02-08 09:03:39] [INFO] Loaded event: inviteDelete
- [2026-02-08 09:03:39] [INFO] Loaded event: messageCreate
- [2026-02-08 09:03:39] [INFO] Loaded event: messageReactionAdd
- [2026-02-08 09:03:39] [INFO] Loaded event: messageReactionRemove
- [2026-02-08 09:03:39] [INFO] Loaded event: ready
- [2026-02-08 09:03:39] [INFO] Loaded event: voiceStateUpdate
- [2026-02-08 09:03:39] [INFO] Skipped disabled event: voiceXpTracker.js
- [2026-02-08 09:03:39] [INFO] Loaded slash command: ping
- [2026-02-08 09:03:39] [INFO] Loaded slash command: setembedcolor
- [2026-02-08 09:03:39] [INFO] Loaded slash command: setembedfooter
- [2026-02-08 09:03:39] [INFO] Loaded slash command: setembedicon
- [2026-02-08 09:03:39] [INFO] Initializing bot and attempting to log in...
- [2026-02-08 09:03:40] [INFO] ✅ Database connection successful
- [2026-02-08 09:03:43] [INFO] Ready! Logged in as Parallel Universe#9387
- [2026-02-08 09:03:43] [INFO] Bot is now online and ready to serve in 1 guilds.
- [2026-02-08 09:03:43] [INFO] Registered all slash commands globally.
- [2026-02-08 09:03:43] [INFO] Initializing configs for 1 guilds...
- [2026-02-08 09:03:43] [INFO] ✅ Guild configurations initialized
- [2026-02-08 09:03:43] [INFO] Caching invites for all guilds...
- [2026-02-08 09:04:21] [INFO] Cached 201 invites for guild Parallel Universe
- [2026-02-08 09:04:21] [INFO] Successfully cached invites for 1/1 guilds
- [2026-02-08 09:04:22] [INFO] Successfully updated dev server status message.
- [2026-02-08 09:04:58] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:05:00] [INFO] [Groq] Success with key gsk_yuLdhM...
- [2026-02-08 09:05:02] [INFO] [Memory Agent] Initialized with 4 Gemini keys (shared pool)
- [2026-02-08 09:05:02] [INFO] [Memory Agent] Batch interval: 30s, Message threshold: 5
- [2026-02-08 09:05:02] [INFO] [Memory Agent] Background processor started
- [2026-02-08 09:05:32] [INFO] [Memory Agent] Timer triggered, processing 1 queued conversations
- [2026-02-08 09:05:32] [INFO] [Memory Agent] Processing batch of 1 conversations
- [2026-02-08 09:05:32] [INFO] [Memory Agent] Turn 1/2 for user mrahmet48
- [2026-02-08 09:05:34] [INFO] [Memory Agent] Turn 1 completed in 1999ms
- [2026-02-08 09:05:34] [INFO] [Memory Agent] Turn 1: I have analyzed the user's message: "كيف كنت ستبني امبراورية كن صفر في حالتي ؟" which translates to "How would you build an empire from scratch in my situation?". This message is a question directed at the bot and does not contain any personal information, identity, relationships, preferences, or emotional context about the user (mrahmet48) that would be relevant to store as a memory. Therefore, no action is needed for this turn.
- [2026-02-08 09:05:34] [INFO] [Memory Agent] Multi-turn processing complete in 2471ms (2 messages)
- [2026-02-08 09:05:34] [INFO] [Memory Agent] Batch processing complete
- [2026-02-08 09:06:02] [INFO] Loaded command: levelsetup
- [2026-02-08 09:06:02] [INFO] Loaded command: autoban
- [2026-02-08 09:06:02] [INFO] Loaded command: autospam
- [2026-02-08 09:06:03] [INFO] Loaded command: leaderboard
- [2026-02-08 09:06:03] [INFO] Loaded command: level
- [2026-02-08 09:06:03] [INFO] Loaded command: levelrole
- [2026-02-08 09:06:03] [INFO] Loaded command: add
- [2026-02-08 09:06:03] [INFO] Loaded command: ban
- [2026-02-08 09:06:03] [INFO] Loaded command: clear
- [2026-02-08 09:06:03] [INFO] Loaded command: delwarn
- [2026-02-08 09:06:03] [INFO] Loaded command: deny
- [2026-02-08 09:06:03] [INFO] Loaded command: jail
- [2026-02-08 09:06:03] [INFO] Loaded command: kick
- [2026-02-08 09:06:03] [INFO] Loaded command: lock
- [2026-02-08 09:06:03] [INFO] Loaded command: move
- [2026-02-08 09:06:03] [INFO] Loaded command: mute
- [2026-02-08 09:06:03] [INFO] Loaded command: nickname
- [2026-02-08 09:06:03] [INFO] Loaded command: role
- [2026-02-08 09:06:03] [INFO] Loaded command: setautorole
- [2026-02-08 09:06:03] [INFO] Loaded command: setstats
- [2026-02-08 09:06:03] [INFO] Loaded command: slowmode
- [2026-02-08 09:06:03] [INFO] Loaded command: tempvoice
- [2026-02-08 09:06:03] [INFO] Loaded command: unban
- [2026-02-08 09:06:03] [INFO] Loaded command: unjail
- [2026-02-08 09:06:03] [INFO] Loaded command: unlock
- [2026-02-08 09:06:03] [INFO] Loaded command: unmute
- [2026-02-08 09:06:03] [INFO] Loaded command: vb
- [2026-02-08 09:06:03] [INFO] Loaded command: verify
- [2026-02-08 09:06:03] [INFO] Loaded command: vg
- [2026-02-08 09:06:03] [INFO] Loaded command: warn
- [2026-02-08 09:06:03] [INFO] Loaded command: warns
- [2026-02-08 09:06:03] [INFO] Loaded command: afk
- [2026-02-08 09:06:03] [INFO] [API Key Manager] Initialized: 4 Groq keys, 4 Gemini keys
- [2026-02-08 09:06:03] [INFO] Loaded command: ai
- [2026-02-08 09:06:03] [INFO] Loaded command: aiwhitelist
- [2026-02-08 09:06:03] [INFO] Loaded command: autoreact
- [2026-02-08 09:06:03] [INFO] Loaded command: dev
- [2026-02-08 09:06:03] [INFO] Loaded command: massdm
- [2026-02-08 09:06:03] [INFO] Loaded command: nuke-server
- [2026-02-08 09:06:03] [INFO] Loaded command: premium
- [2026-02-08 09:06:03] [INFO] Loaded command: setuproles
- [2026-02-08 09:06:03] [INFO] Loaded command: shutdown
- [2026-02-08 09:06:03] [INFO] Loaded command: modmail
- [2026-02-08 09:06:03] [INFO] Loaded command: moveall
- [2026-02-08 09:06:03] [INFO] Loaded command: rolemenu
- [2026-02-08 09:06:03] [INFO] Loaded command: sendnotify
- [2026-02-08 09:06:03] [INFO] Loaded command: unafk
- [2026-02-08 09:06:03] [INFO] Loaded command: ping
- [2026-02-08 09:06:03] [INFO] Loaded command: ranktheme
- [2026-02-08 09:06:03] [INFO] Loaded command: setembedcolor
- [2026-02-08 09:06:03] [INFO] Loaded command: setembedfooter
- [2026-02-08 09:06:03] [INFO] Loaded command: setembedicon
- [2026-02-08 09:06:03] [INFO] Loaded command: top
- [2026-02-08 09:06:03] [INFO] Loaded command: avatar
- [2026-02-08 09:06:03] [INFO] Loaded command: botinfo
- [2026-02-08 09:06:03] [INFO] Loaded command: channelinfo
- [2026-02-08 09:06:03] [INFO] Loaded command: help
- [2026-02-08 09:06:03] [INFO] Loaded command: invite
- [2026-02-08 09:06:03] [INFO] Loaded command: roleinfo
- [2026-02-08 09:06:03] [INFO] Loaded command: serverinfo
- [2026-02-08 09:06:03] [INFO] Loaded command: userinfo
- [2026-02-08 09:06:03] [INFO] Loaded event: guildMemberAdd
- [2026-02-08 09:06:04] [INFO] Loaded event: guildMemberRemove
- [2026-02-08 09:06:04] [INFO] Loaded event: interactionCreate
- [2026-02-08 09:06:04] [INFO] Loaded event: inviteCreate
- [2026-02-08 09:06:04] [INFO] Loaded event: inviteDelete
- [2026-02-08 09:06:04] [INFO] Loaded event: messageCreate
- [2026-02-08 09:06:04] [INFO] Loaded event: messageReactionAdd
- [2026-02-08 09:06:04] [INFO] Loaded event: messageReactionRemove
- [2026-02-08 09:06:04] [INFO] Loaded event: ready
- [2026-02-08 09:06:04] [INFO] Loaded event: voiceStateUpdate
- [2026-02-08 09:06:04] [INFO] Skipped disabled event: voiceXpTracker.js
- [2026-02-08 09:06:04] [INFO] Loaded slash command: ping
- [2026-02-08 09:06:04] [INFO] Loaded slash command: setembedcolor
- [2026-02-08 09:06:04] [INFO] Loaded slash command: setembedfooter
- [2026-02-08 09:06:04] [INFO] Loaded slash command: setembedicon
- [2026-02-08 09:06:04] [INFO] Initializing bot and attempting to log in...
- [2026-02-08 09:06:04] [INFO] ✅ Database connection successful
- [2026-02-08 09:06:06] [INFO] Ready! Logged in as Parallel Universe#9387
- [2026-02-08 09:06:06] [INFO] Bot is now online and ready to serve in 1 guilds.
- [2026-02-08 09:06:06] [INFO] Registered all slash commands globally.
- [2026-02-08 09:06:06] [INFO] Initializing configs for 1 guilds...
- [2026-02-08 09:06:06] [INFO] ✅ Guild configurations initialized
- [2026-02-08 09:06:07] [INFO] Caching invites for all guilds...
- [2026-02-08 09:06:18] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:06:19] [INFO] [Groq] Success with key gsk_yuLdhM...
- [2026-02-08 09:06:20] [INFO] [Memory Agent] Initialized with 4 Gemini keys (shared pool)
- [2026-02-08 09:06:20] [INFO] [Memory Agent] Batch interval: 30s, Message threshold: 5
- [2026-02-08 09:06:20] [INFO] [Memory Agent] Background processor started
- [2026-02-08 09:06:33] [INFO] Cached 201 invites for guild Parallel Universe
- [2026-02-08 09:06:33] [INFO] Successfully cached invites for 1/1 guilds
- [2026-02-08 09:06:34] [INFO] Successfully updated dev server status message.
- [2026-02-08 09:06:50] [INFO] [Memory Agent] Timer triggered, processing 1 queued conversations
- [2026-02-08 09:06:50] [INFO] [Memory Agent] Processing batch of 1 conversations
- [2026-02-08 09:06:58] [INFO] [Memory Agent] Turn 1/2 for user mrahmet48
- [2026-02-08 09:07:04] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:07:06] [INFO] [Groq] Success with key gsk_EArIjd...
- [2026-02-08 09:07:09] [INFO] [Memory Agent] Turn 1 completed in 10894ms
- [2026-02-08 09:07:09] [INFO] [Memory Agent] Turn 1: No new information about the user to remember.
- [2026-02-08 09:07:09] [INFO] [Memory Agent] Multi-turn processing complete in 18701ms (2 messages)
- [2026-02-08 09:07:09] [INFO] [Memory Agent] Batch processing complete
- [2026-02-08 09:07:20] [INFO] [Memory Agent] Timer triggered, processing 1 queued conversations
- [2026-02-08 09:07:20] [INFO] [Memory Agent] Processing batch of 1 conversations
- [2026-02-08 09:07:22] [INFO] [Memory Agent] Turn 1/2 for user mrahmet48
- [2026-02-08 09:07:25] [INFO] [Memory Agent] Turn 1 completed in 3131ms
- [2026-02-08 09:07:25] [INFO] [Memory Agent] Turn 1: 1 tool call(s)
- [2026-02-08 09:07:25] [INFO] [Memory Agent] Executing tool: fetch_and_verify for user mrahmet48
- [2026-02-08 09:07:25] [INFO] [Memory Agent] fetch_and_verify found 0 memories for query "User's profession or information about their team of programmers"
- [2026-02-08 09:07:25] [INFO] [Memory Agent] Turn 2/2 for user mrahmet48
- [2026-02-08 09:07:28] [INFO] [Memory Agent] Turn 2 completed in 2754ms
- [2026-02-08 09:07:28] [INFO] [Memory Agent] Turn 2: 1 tool call(s)
- [2026-02-08 09:07:28] [INFO] [Memory Agent] Executing tool: update_memory for user mrahmet48
- [2026-02-08 09:07:29] [INFO] [Memory Agent] Created new memory #95: User (mrahmet48) has a team of programmers (Reason: User stated they have a team of programmers)
- [2026-02-08 09:07:29] [WARN] [Memory Agent] Circuit breaker: Max iterations (2) reached
- [2026-02-08 09:07:29] [INFO] [Memory Agent] Multi-turn processing complete in 8571ms (6 messages)
- [2026-02-08 09:07:29] [INFO] [Memory Agent] Batch processing complete
- [2026-02-08 09:07:56] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:07:57] [INFO] [Groq] Success with key gsk_UBhHDl...
- [2026-02-08 09:08:20] [INFO] [Memory Agent] Timer triggered, processing 1 queued conversations
- [2026-02-08 09:08:20] [INFO] [Memory Agent] Processing batch of 1 conversations
- [2026-02-08 09:08:20] [INFO] [Memory Agent] Turn 1/2 for user mrahmet48
- [2026-02-08 09:08:23] [INFO] [Memory Agent] Turn 1 completed in 2173ms
- [2026-02-08 09:08:23] [INFO] [Memory Agent] Turn 1: 1 tool call(s)
- [2026-02-08 09:08:23] [INFO] [Memory Agent] Executing tool: fetch_and_verify for user mrahmet48
- [2026-02-08 09:08:23] [INFO] [Memory Agent] fetch_and_verify found 2 memories for query "User's name"
- [2026-02-08 09:08:23] [INFO] [Memory Agent] Turn 2/2 for user mrahmet48
- [2026-02-08 09:08:26] [INFO] [Memory Agent] Turn 2 completed in 3043ms
- [2026-02-08 09:08:26] [INFO] [Memory Agent] Turn 2: No tool calls, reasoning complete
- [2026-02-08 09:08:26] [WARN] [Memory Agent] Circuit breaker: Max iterations (2) reached
- [2026-02-08 09:08:26] [INFO] [Memory Agent] Multi-turn processing complete in 5834ms (5 messages)
- [2026-02-08 09:08:26] [INFO] [Memory Agent] Batch processing complete
- [2026-02-08 09:09:19] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:09:28] [INFO] [Groq] Success with key gsk_E3wiL3...
- [2026-02-08 09:09:50] [INFO] [Memory Agent] Timer triggered, processing 1 queued conversations
- [2026-02-08 09:09:50] [INFO] [Memory Agent] Processing batch of 1 conversations
- [2026-02-08 09:09:52] [INFO] [Memory Agent] Turn 1/2 for user mrahmet48
- [2026-02-08 09:09:56] [INFO] [Memory Agent] Turn 1 completed in 4129ms
- [2026-02-08 09:09:56] [INFO] [Memory Agent] Turn 1: I have analyzed the conversation. The user's message "ماذا تعتقد ؟" (What do you think?) is a question and does not contain any factual information about the user that needs to be stored in memory. The bot's response contains information about the bot's thoughts and capabilities, but I am instructed to extract facts only from the user's message. Therefore, there is no new memory to create or update in this turn.
- [2026-02-08 09:09:56] [INFO] [Memory Agent] Multi-turn processing complete in 5775ms (2 messages)
- [2026-02-08 09:09:56] [INFO] [Memory Agent] Batch processing complete
- [2026-02-08 09:10:08] [INFO] [AI Service] Trying Groq pool (4 keys available)
- [2026-02-08 09:10:09] [INFO] [Groq] Success with key gsk_yuLdhM...
- [2026-02-08 09:10:14] [INFO] Loaded command: levelsetup
- [2026-02-08 09:10:14] [INFO] Loaded command: autoban
- [2026-02-08 09:10:14] [INFO] Loaded command: autospam
- [2026-02-08 09:10:15] [INFO] Loaded command: leaderboard
- [2026-02-08 09:10:15] [INFO] Loaded command: level
- [2026-02-08 09:10:15] [INFO] Loaded command: levelrole
- [2026-02-08 09:10:15] [INFO] Loaded command: add
- [2026-02-08 09:10:15] [INFO] Loaded command: ban
- [2026-02-08 09:10:15] [INFO] Loaded command: clear
- [2026-02-08 09:10:15] [INFO] Loaded command: delwarn
- [2026-02-08 09:10:15] [INFO] Loaded command: deny
- [2026-02-08 09:10:15] [INFO] Loaded command: jail
- [2026-02-08 09:10:15] [INFO] Loaded command: kick
- [2026-02-08 09:10:15] [INFO] Loaded command: lock
- [2026-02-08 09:10:15] [INFO] Loaded command: move
- [2026-02-08 09:10:15] [INFO] Loaded command: mute
- [2026-02-08 09:10:15] [INFO] Loaded command: nickname
- [2026-02-08 09:10:15] [INFO] Loaded command: role
- [2026-02-08 09:10:15] [INFO] Loaded command: setautorole
- [2026-02-08 09:10:15] [INFO] Loaded command: setstats
- [2026-02-08 09:10:15] [INFO] Loaded command: slowmode
- [2026-02-08 09:10:15] [INFO] Loaded command: tempvoice
- [2026-02-08 09:10:15] [INFO] Loaded command: unban
- [2026-02-08 09:10:15] [INFO] Loaded command: unjail
- [2026-02-08 09:10:15] [INFO] Loaded command: unlock
- [2026-02-08 09:10:15] [INFO] Loaded command: unmute
- [2026-02-08 09:10:15] [INFO] Loaded command: vb
- [2026-02-08 09:10:15] [INFO] Loaded command: verify
- [2026-02-08 09:10:15] [INFO] Loaded command: vg
- [2026-02-08 09:10:15] [INFO] Loaded command: warn
- [2026-02-08 09:10:15] [INFO] Loaded command: warns
- [2026-02-08 09:10:15] [INFO] Loaded command: afk
- [2026-02-08 09:10:15] [INFO] [API Key Manager] Initialized: 4 Groq keys, 4 Gemini keys
- [2026-02-08 09:10:15] [INFO] Loaded command: ai
- [2026-02-08 09:10:15] [INFO] Loaded command: aiwhitelist
- [2026-02-08 09:10:15] [INFO] Loaded command: autoreact
- [2026-02-08 09:10:15] [INFO] Loaded command: dev
- [2026-02-08 09:10:15] [INFO] Loaded command: massdm
- [2026-02-08 09:10:15] [INFO] Loaded command: nuke-server
- [2026-02-08 09:10:15] [INFO] Loaded command: premium
- [2026-02-08 09:10:15] [INFO] Loaded command: setuproles
- [2026-02-08 09:10:15] [INFO] Loaded command: shutdown
- [2026-02-08 09:10:15] [INFO] Loaded command: modmail
- [2026-02-08 09:10:15] [INFO] Loaded command: moveall
- [2026-02-08 09:10:15] [INFO] Loaded command: rolemenu
- [2026-02-08 09:10:15] [INFO] Loaded command: sendnotify
- [2026-02-08 09:10:15] [INFO] Loaded command: unafk
- [2026-02-08 09:10:15] [INFO] Loaded command: ping
- [2026-02-08 09:10:15] [INFO] Loaded command: ranktheme
- [2026-02-08 09:10:15] [INFO] Loaded command: setembedcolor
- [2026-02-08 09:10:15] [INFO] Loaded command: setembedfooter
- [2026-02-08 09:10:15] [INFO] Loaded command: setembedicon
- [2026-02-08 09:10:15] [INFO] Loaded command: top
- [2026-02-08 09:10:15] [INFO] Loaded command: avatar
- [2026-02-08 09:10:15] [INFO] Loaded command: botinfo
- [2026-02-08 09:10:15] [INFO] Loaded command: channelinfo
- [2026-02-08 09:10:15] [INFO] Loaded command: help
- [2026-02-08 09:10:15] [INFO] Loaded command: invite
- [2026-02-08 09:10:15] [INFO] Loaded command: roleinfo
- [2026-02-08 09:10:15] [INFO] Loaded command: serverinfo
- [2026-02-08 09:10:15] [INFO] Loaded command: userinfo
- [2026-02-08 09:10:16] [INFO] Loaded event: guildMemberAdd
- [2026-02-08 09:10:16] [INFO] Loaded event: guildMemberRemove
- [2026-02-08 09:10:16] [INFO] Loaded event: interactionCreate
- [2026-02-08 09:10:16] [INFO] Loaded event: inviteCreate
- [2026-02-08 09:10:16] [INFO] Loaded event: inviteDelete
- [2026-02-08 09:10:16] [INFO] Loaded event: messageCreate
- [2026-02-08 09:10:16] [INFO] Loaded event: messageReactionAdd
- [2026-02-08 09:10:16] [INFO] Loaded event: messageReactionRemove
- [2026-02-08 09:10:16] [INFO] Loaded event: ready
- [2026-02-08 09:10:16] [INFO] Loaded event: voiceStateUpdate
- [2026-02-08 09:10:16] [INFO] Skipped disabled event: voiceXpTracker.js
- [2026-02-08 09:10:16] [INFO] Loaded slash command: ping
- [2026-02-08 09:10:16] [INFO] Loaded slash command: setembedcolor
- [2026-02-08 09:10:16] [INFO] Loaded slash command: setembedfooter
- [2026-02-08 09:10:16] [INFO] Loaded slash command: setembedicon
- [2026-02-08 09:10:16] [INFO] Initializing bot and attempting to log in...
- [2026-02-08 09:10:17] [INFO] ✅ Database connection successful
- [2026-02-08 09:10:20] [INFO] Ready! Logged in as Parallel Universe#9387
- [2026-02-08 09:10:20] [INFO] Bot is now online and ready to serve in 1 guilds.
- [2026-02-08 09:10:21] [INFO] Registered all slash commands globally.
- [2026-02-08 09:10:21] [INFO] Initializing configs for 1 guilds...
- [2026-02-08 09:10:21] [INFO] ✅ Guild configurations initialized
- [2026-02-08 09:10:21] [INFO] Caching invites for all guilds...
- [2026-02-08 09:10:36] [INFO] Loaded command: levelsetup
- [2026-02-08 09:10:36] [INFO] Loaded command: autoban
- [2026-02-08 09:10:36] [INFO] Loaded command: autospam
- [2026-02-08 09:10:37] [INFO] Loaded command: leaderboard
- [2026-02-08 09:10:37] [INFO] Loaded command: level
- [2026-02-08 09:10:37] [INFO] Loaded command: levelrole
- [2026-02-08 09:10:37] [INFO] Loaded command: add
- [2026-02-08 09:10:37] [INFO] Loaded command: ban
- [2026-02-08 09:10:37] [INFO] Loaded command: clear
- [2026-02-08 09:10:37] [INFO] Loaded command: delwarn
- [2026-02-08 09:10:37] [INFO] Loaded command: deny
- [2026-02-08 09:10:37] [INFO] Loaded command: jail
- [2026-02-08 09:10:37] [INFO] Loaded command: kick
- [2026-02-08 09:10:37] [INFO] Loaded command: lock
- [2026-02-08 09:10:37] [INFO] Loaded command: move
- [2026-02-08 09:10:37] [INFO] Loaded command: mute
- [2026-02-08 09:10:37] [INFO] Loaded command: nickname
- [2026-02-08 09:10:37] [INFO] Loaded command: role
- [2026-02-08 09:10:37] [INFO] Loaded command: setautorole
- [2026-02-08 09:10:37] [INFO] Loaded command: setstats
- [2026-02-08 09:10:37] [INFO] Loaded command: slowmode
- [2026-02-08 09:10:37] [INFO] Loaded command: tempvoice
- [2026-02-08 09:10:37] [INFO] Loaded command: unban
- [2026-02-08 09:10:37] [INFO] Loaded command: unjail
- [2026-02-08 09:10:37] [INFO] Loaded command: unlock
- [2026-02-08 09:10:37] [INFO] Loaded command: unmute
- [2026-02-08 09:10:37] [INFO] Loaded command: vb
- [2026-02-08 09:10:37] [INFO] Loaded command: verify
- [2026-02-08 09:10:37] [INFO] Loaded command: vg
- [2026-02-08 09:10:37] [INFO] Loaded command: warn
- [2026-02-08 09:10:37] [INFO] Loaded command: warns
- [2026-02-08 09:10:37] [INFO] Loaded command: afk
- [2026-02-08 09:10:37] [INFO] [API Key Manager] Initialized: 4 Groq keys, 4 Gemini keys
- [2026-02-08 09:10:37] [INFO] Loaded command: ai
- [2026-02-08 09:10:37] [INFO] Loaded command: aiwhitelist
- [2026-02-08 09:10:37] [INFO] Loaded command: autoreact
- [2026-02-08 09:10:37] [INFO] Loaded command: dev
- [2026-02-08 09:10:37] [INFO] Loaded command: massdm
- [2026-02-08 09:10:37] [INFO] Loaded command: nuke-server
- [2026-02-08 09:10:37] [INFO] Loaded command: premium
- [2026-02-08 09:10:37] [INFO] Loaded command: setuproles
- [2026-02-08 09:10:37] [INFO] Loaded command: shutdown
- [2026-02-08 09:10:37] [INFO] Loaded command: modmail
- [2026-02-08 09:10:37] [INFO] Loaded command: moveall
- [2026-02-08 09:10:37] [INFO] Loaded command: rolemenu
- [2026-02-08 09:10:38] [INFO] Loaded command: sendnotify
- [2026-02-08 09:10:38] [INFO] Loaded command: unafk
- [2026-02-08 09:10:38] [INFO] Loaded command: ping
- [2026-02-08 09:10:38] [INFO] Loaded command: ranktheme
- [2026-02-08 09:10:38] [INFO] Loaded command: setembedcolor
- [2026-02-08 09:10:38] [INFO] Loaded command: setembedfooter
- [2026-02-08 09:10:38] [INFO] Loaded command: setembedicon
- [2026-02-08 09:10:38] [INFO] Loaded command: top
- [2026-02-08 09:10:38] [INFO] Loaded command: avatar
- [2026-02-08 09:10:38] [INFO] Loaded command: botinfo
- [2026-02-08 09:10:38] [INFO] Loaded command: channelinfo
- [2026-02-08 09:10:38] [INFO] Loaded command: help
- [2026-02-08 09:10:38] [INFO] Loaded command: invite
- [2026-02-08 09:10:38] [INFO] Loaded command: roleinfo
- [2026-02-08 09:10:38] [INFO] Loaded command: serverinfo
- [2026-02-08 09:10:38] [INFO] Loaded command: userinfo
- [2026-02-08 09:10:38] [INFO] Loaded event: guildMemberAdd
- [2026-02-08 09:10:38] [INFO] Loaded event: guildMemberRemove
- [2026-02-08 09:10:38] [INFO] Loaded event: interactionCreate
- [2026-02-08 09:10:38] [INFO] Loaded event: inviteCreate
- [2026-02-08 09:10:38] [INFO] Loaded event: inviteDelete
- [2026-02-08 09:10:38] [INFO] Loaded event: messageCreate
- [2026-02-08 09:10:38] [INFO] Loaded event: messageReactionAdd
- [2026-02-08 09:10:38] [INFO] Loaded event: messageReactionRemove
- [2026-02-08 09:10:38] [INFO] Loaded event: ready
- [2026-02-08 09:10:38] [INFO] Loaded event: voiceStateUpdate
- [2026-02-08 09:10:38] [INFO] Skipped disabled event: voiceXpTracker.js
- [2026-02-08 09:10:38] [INFO] Loaded slash command: ping
- [2026-02-08 09:10:38] [INFO] Loaded slash command: setembedcolor
- [2026-02-08 09:10:38] [INFO] Loaded slash command: setembedfooter
- [2026-02-08 09:10:38] [INFO] Loaded slash command: setembedicon
- [2026-02-08 09:10:38] [INFO] Initializing bot and attempting to log in...
- [2026-02-08 09:10:40] [INFO] ✅ Database connection successful
- [2026-02-08 09:10:43] [INFO] Ready! Logged in as Parallel Universe#9387
- [2026-02-08 09:10:43] [INFO] Bot is now online and ready to serve in 1 guilds.
- [2026-02-08 09:10:44] [INFO] Registered all slash commands globally.
- [2026-02-08 09:10:44] [INFO] Initializing configs for 1 guilds...
- [2026-02-08 09:10:44] [INFO] ✅ Guild configurations initialized
- [2026-02-08 09:10:44] [INFO] Caching invites for all guilds...
- [2026-02-08 09:11:24] [INFO] Cached 201 invites for guild Parallel Universe
- [2026-02-08 09:11:24] [INFO] Successfully cached invites for 1/1 guilds
- [2026-02-08 09:11:31] [INFO] Posted new dev server status message and saved its ID: 1469983979909288007
- [2026-02-08 09:14:49] [INFO] Updated voice count for Parallel Universe: 10
- [2026-02-08 09:17:04] [INFO] Reloaded command: dev
- [2026-02-08 09:17:12] [INFO] Loaded command: levelsetup
- [2026-02-08 09:17:12] [INFO] Loaded command: autoban
- [2026-02-08 09:17:12] [INFO] Loaded command: autospam
- [2026-02-08 09:17:12] [INFO] Loaded command: leaderboard
- [2026-02-08 09:17:12] [INFO] Loaded command: level
- [2026-02-08 09:17:12] [INFO] Loaded command: levelrole
- [2026-02-08 09:17:12] [INFO] Loaded command: add
- [2026-02-08 09:17:12] [INFO] Loaded command: ban
- [2026-02-08 09:17:12] [INFO] Loaded command: clear
- [2026-02-08 09:17:12] [INFO] Loaded command: delwarn
- [2026-02-08 09:17:12] [INFO] Loaded command: deny
- [2026-02-08 09:17:12] [INFO] Loaded command: jail
- [2026-02-08 09:17:12] [INFO] Loaded command: kick
- [2026-02-08 09:17:12] [INFO] Loaded command: lock
- [2026-02-08 09:17:12] [INFO] Loaded command: move
- [2026-02-08 09:17:12] [INFO] Loaded command: mute
- [2026-02-08 09:17:12] [INFO] Loaded command: nickname
- [2026-02-08 09:17:12] [INFO] Loaded command: role
- [2026-02-08 09:17:12] [INFO] Loaded command: setautorole
- [2026-02-08 09:17:12] [INFO] Loaded command: setstats
- [2026-02-08 09:17:12] [INFO] Loaded command: slowmode
- [2026-02-08 09:17:12] [INFO] Loaded command: tempvoice
- [2026-02-08 09:17:12] [INFO] Loaded command: unban
- [2026-02-08 09:17:12] [INFO] Loaded command: unjail
- [2026-02-08 09:17:12] [INFO] Loaded command: unlock
- [2026-02-08 09:17:12] [INFO] Loaded command: unmute
- [2026-02-08 09:17:12] [INFO] Loaded command: vb
- [2026-02-08 09:17:12] [INFO] Loaded command: verify
- [2026-02-08 09:17:12] [INFO] Loaded command: vg
- [2026-02-08 09:17:12] [INFO] Loaded command: warn
- [2026-02-08 09:17:13] [INFO] Loaded command: warns
- [2026-02-08 09:17:13] [INFO] Loaded command: afk
- [2026-02-08 09:17:13] [INFO] [API Key Manager] Initialized: 4 Groq keys, 4 Gemini keys
- [2026-02-08 09:17:13] [INFO] Loaded command: ai
- [2026-02-08 09:17:13] [INFO] Loaded command: aiwhitelist
- [2026-02-08 09:17:13] [INFO] Loaded command: autoreact
- [2026-02-08 09:17:13] [INFO] Loaded command: dev
- [2026-02-08 09:17:13] [INFO] Loaded command: massdm
- [2026-02-08 09:17:13] [INFO] Loaded command: nuke-server
- [2026-02-08 09:17:13] [INFO] Loaded command: premium
- [2026-02-08 09:17:13] [INFO] Loaded command: setuproles
- [2026-02-08 09:17:13] [INFO] Loaded command: shutdown
- [2026-02-08 09:17:13] [INFO] Loaded command: modmail
- [2026-02-08 09:17:13] [INFO] Loaded command: moveall
- [2026-02-08 09:17:13] [INFO] Loaded command: rolemenu
- [2026-02-08 09:17:13] [INFO] Loaded command: sendnotify
- [2026-02-08 09:17:13] [INFO] Loaded command: unafk
- [2026-02-08 09:17:13] [INFO] Loaded command: ping
- [2026-02-08 09:17:13] [INFO] Loaded command: ranktheme
- [2026-02-08 09:17:13] [INFO] Loaded command: setembedcolor
- [2026-02-08 09:17:13] [INFO] Loaded command: setembedfooter
- [2026-02-08 09:17:13] [INFO] Loaded command: setembedicon
- [2026-02-08 09:17:13] [INFO] Loaded command: top
- [2026-02-08 09:17:13] [INFO] Loaded command: avatar
- [2026-02-08 09:17:13] [INFO] Loaded command: botinfo
- [2026-02-08 09:17:13] [INFO] Loaded command: channelinfo
- [2026-02-08 09:17:13] [INFO] Loaded command: help
- [2026-02-08 09:17:13] [INFO] Loaded command: invite
- [2026-02-08 09:17:13] [INFO] Loaded command: roleinfo
- [2026-02-08 09:17:13] [INFO] Loaded command: serverinfo
- [2026-02-08 09:17:13] [INFO] Loaded command: userinfo
- [2026-02-08 09:17:13] [INFO] Loaded event: guildMemberAdd
- [2026-02-08 09:17:13] [INFO] Loaded event: guildMemberRemove
- [2026-02-08 09:17:13] [INFO] Loaded event: interactionCreate
- [2026-02-08 09:17:13] [INFO] Loaded event: inviteCreate
- [2026-02-08 09:17:13] [INFO] Loaded event: inviteDelete
- [2026-02-08 09:17:13] [INFO] Loaded event: messageCreate
- [2026-02-08 09:17:13] [INFO] Loaded event: messageReactionAdd
- [2026-02-08 09:17:13] [INFO] Loaded event: messageReactionRemove
- [2026-02-08 09:17:13] [INFO] Loaded event: ready
- [2026-02-08 09:17:13] [INFO] Loaded event: voiceStateUpdate
- [2026-02-08 09:17:13] [INFO] Skipped disabled event: voiceXpTracker.js
- [2026-02-08 09:17:14] [INFO] Loaded slash command: ping
- [2026-02-08 09:17:14] [INFO] Loaded slash command: setembedcolor
- [2026-02-08 09:17:14] [INFO] Loaded slash command: setembedfooter
- [2026-02-08 09:17:14] [INFO] Loaded slash command: setembedicon
- [2026-02-08 09:17:14] [INFO] Initializing bot and attempting to log in...
- [2026-02-08 09:17:15] [INFO] ✅ Database connection successful
- [2026-02-08 09:17:17] [INFO] Ready! Logged in as Parallel Universe#9387
- [2026-02-08 09:17:17] [INFO] Bot is now online and ready to serve in 1 guilds.
- [2026-02-08 09:17:18] [INFO] Registered all slash commands globally.
- [2026-02-08 09:17:18] [INFO] Initializing configs for 1 guilds...
- [2026-02-08 09:17:18] [INFO] ✅ Guild configurations initialized
- [2026-02-08 09:17:18] [INFO] Caching invites for all guilds...
- [2026-02-08 09:18:00] [INFO] Cached 201 invites for guild Parallel Universe
- [2026-02-08 09:18:00] [INFO] Successfully cached invites for 1/1 guilds
- [2026-02-08 09:18:02] [INFO] Posted new dev server status message and saved its ID: 1469985619949129884
