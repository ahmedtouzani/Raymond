# 🎉 Raymond v3.0.0 - Major Release

**Release Date:** February 7, 2026

---

## 🌟 Overview

Version 3.0.0 is a **major release** introducing advanced AI capabilities, semantic memory, auto-learning, and bilingual support. This release transforms Raymond from a standard Discord bot into an intelligent assistant with long-term memory and natural language understanding.

---

## ✨ New Features

### 🧠 AI & Memory System

#### **Semantic Search (RAG) with Vector Embeddings**
- Implemented pgvector for intelligent memory recall
- Hybrid search combining semantic similarity and keyword matching
- Configurable similarity threshold (default: 0.7)
- Automatic embedding generation for new memories
- Backfill script for existing memories

#### **Auto-Memory Learning System**
- Automatically extracts facts from conversations
- No manual `!ai remember` commands needed
- Intelligent duplicate detection (85% similarity threshold)
- Cooldown system to prevent spam (3 seconds)
- Maximum 3 facts per conversation
- Silent operation with detailed logging

#### **Bilingual Support (English + Arabic)**
- Full conversation support in both languages
- Language-aware fact extraction
- Automatic language detection
- Native responses in user's language
- Bilingual prompts and instructions

#### **Persona Configuration System**
- Decoupled persona management
- Easy persona switching via environment variable
- Configurable system prompts, temperature, and token limits
- Default persona: Raymond Reddington
- Extensible for custom personas

#### **Hourly Rate Limiting**
- Replaced daily limits with hourly tracking
- Three-tier system:
  - **Owner**: Unlimited
  - **Whitelisted**: 6 messages/hour
  - **Regular**: 3 messages/hour
- Per-guild, per-user tracking
- Automatic cleanup of old records

#### **Dynamic Whitelist Management**
- New `!aiwhitelist` command suite
- Database-backed (persistent across restarts)
- Commands: add, remove, list, clear
- Tracks who added each user and why
- Grants both access and higher rate limits

#### **Per-User Conversation History**
- Database-backed conversation tracking
- Replaces Discord API message fetching
- Persistent across sessions
- Configurable history length (default: 3 messages)
- Automatic cleanup of old history

#### **User Mention Understanding**
- Context-aware responses when users are mentioned
- Provides user information (ID, username, roles, join date)
- Enriches AI context for better responses

#### **Owner Detection**
- Bot recognizes when talking to owner
- Special context: "You are talking to YOUR OWNER"
- Personalized responses for owner
- Prevents confusion about identity

---

## 🔧 Technical Improvements

### Database

**New Tables:**
- `ai_chat_usage_hourly` - Hourly rate limiting
- `ai_conversation_history` - Per-user conversation storage
- `ai_whitelist` - Dynamic whitelist management

**Updated Tables:**
- `ai_memory` → `ai_memories` (renamed for consistency)
- Added `embedding` column (vector type)
- Added `embedding_model` column
- Added `embedding_updated_at` column

**New Migrations:**
- `20260207_create_ai_chat_usage_hourly.sql`
- `20260207_create_ai_conversation_history.sql`
- `20260207_create_ai_whitelist.sql`
- `20260207_rename_ai_memory_to_ai_memories.sql`

### New Modules

**Services:**
- `src/services/memoryExtractor.js` - Auto-learning system
- `src/services/embeddings.js` - Vector embedding generation

**Database:**
- `src/database/aiChatUsageHourly.js` - Rate limiting logic
- `src/database/aiConversationHistory.js` - History management
- `src/database/aiWhitelist.js` - Whitelist operations

**Configuration:**
- `src/config/personas.js` - AI persona definitions

**Commands:**
- `src/commands/OwnerOnly/aiwhitelist.js` - Whitelist management

### Updated Modules

**Major Refactors:**
- `src/services/ai.js` - Persona loading, semantic search, owner detection
- `src/database/aiMemory.js` - Semantic search with embeddings
- `src/events/messageCreate.js` - Rate limiting, history, auto-learning
- `src/commands/OwnerOnly/ai.js` - Integrated new features

---

## 📊 Configuration Changes

### New Environment Variables

**AI Persona:**
```bash
AI_PERSONA=raymond
```

**Rate Limiting:**
```bash
AI_HOURLY_LIMIT_REGULAR=3
AI_HOURLY_LIMIT_WHITELISTED=6
```

**Auto-Memory:**
```bash
AI_AUTO_MEMORY_ENABLED=true
AI_AUTO_MEMORY_MIN_LENGTH=15
AI_AUTO_MEMORY_COOLDOWN_MS=3000
```

**Semantic Search:**
```bash
AI_EMBEDDINGS_ENABLED=true
AI_MEMORY_SIMILARITY_THRESHOLD=0.7
AI_MEMORY_MIN_QUERY_CHARS=5
AI_MEMORY_RETRIEVAL=hybrid
AI_EMBEDDINGS_MODEL=Xenova/all-MiniLM-L6-v2
```

---

## 🐛 Bug Fixes

- Fixed column name mismatch (`last_accessed_at` → `last_used_at`)
- Lowered minimum query length for semantic search (12 → 5 chars)
- Added `await` to async rate limit check
- Fixed owner detection in auto-chat access control
- Improved error handling in memory extraction

---

## 📈 Performance Improvements

- Memory caching with 60-second TTL
- Cooldown system for auto-learning
- Duplicate detection before saving facts
- Token limits to reduce API costs
- Batch processing for database operations
- Efficient vector similarity search with IVFFlat index

---

## 🔄 Breaking Changes

### Database Schema
- **Action Required:** Run migrations to update schema
  ```bash
  npm run migrate
  ```

### Environment Variables
- **Recommended:** Update `.env` with new variables
- **Backward Compatible:** Old variables still work

### Memory Table Rename
- `ai_memory` → `ai_memories`
- Migration handles this automatically

---

## 📦 Dependencies

### New Dependencies
- `@xenova/transformers` (^2.17.2) - Vector embeddings
- `pg` (^8.16.0) - PostgreSQL client (updated)

### Updated Dependencies
- All dependencies updated to latest compatible versions

---

## 🚀 Upgrade Guide

### From v2.x to v3.0.0

1. **Backup Database**
   ```bash
   npm run backup:create
   ```

2. **Install pgvector Extension**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. **Pull Latest Code**
   ```bash
   git pull origin main
   ```

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Update Environment Variables**
   ```bash
   # Copy new variables from .env.example
   # Add to your .env file
   ```

6. **Run Migrations**
   ```bash
   npm run migrate
   ```

7. **Backfill Embeddings (Optional)**
   ```bash
   npm run ai:embeddings:backfill
   ```

8. **Restart Bot**
   ```bash
   npm start
   ```

---

## 📚 Documentation

- **README.md** - Completely rewritten with diagrams and tables
- **.env.example** - Comprehensive configuration template
- **Mermaid Diagrams** - Visual architecture and flow diagrams
- **Tables** - Feature comparison and configuration reference

---

## 🎯 What's Next?

### v3.1.0 (Planned)
- Web dashboard for bot management
- Multi-server memory isolation
- Custom persona creation via commands
- Advanced analytics and insights

### v3.2.0 (Planned)
- Voice AI integration
- Image generation capabilities
- Plugin system for extensions

---

## 🙏 Acknowledgments

Special thanks to:
- OpenRouter for free AI model access
- Xenova for the transformers library
- PostgreSQL team for pgvector extension
- Discord.js community

---

## 📝 Full Changelog

### Added
- Semantic search with vector embeddings
- Auto-memory learning system
- Bilingual support (English + Arabic)
- Persona configuration system
- Hourly rate limiting
- Dynamic whitelist management
- Per-user conversation history
- User mention understanding
- Owner detection
- Memory extractor service
- Embeddings service
- Comprehensive README with diagrams
- Detailed .env.example

### Changed
- Refactored AI service for persona support
- Updated memory system for semantic search
- Improved rate limiting from daily to hourly
- Enhanced conversation history tracking
- Updated documentation

### Fixed
- Column name mismatch in memory table
- Query length threshold too high
- Missing await in rate limit check
- Owner detection in access control

### Removed
- Discord API message fetching for history
- Daily rate limit system (replaced with hourly)

---

## 📊 Statistics

- **Files Changed:** 17
- **Insertions:** 1,177
- **Deletions:** 185
- **New Files:** 9
- **Migrations:** 4
- **New Commands:** 1 (`!aiwhitelist`)

---

<div align="center">

**Raymond v3.0.0 - Smarter, Faster, Bilingual** 🎩

Made with ❤️ by Ahmed

</div>
