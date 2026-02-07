# 🎩 Raymond - Advanced Discord AI Bot

<div align="center">

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)
![Discord.js](https://img.shields.io/badge/discord.js-v14.7.1-blue.svg)

**An intelligent Discord bot with AI-powered conversations, semantic memory, and bilingual support (English/Arabic)**

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Commands](#-commands) • [Architecture](#-architecture)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Database Schema](#-database-schema)
- [Commands](#-commands)
- [AI System](#-ai-system)
- [Development](#-development)
- [License](#-license)

---

## 🌟 Overview

Raymond is a feature-rich Discord bot powered by advanced AI capabilities, including:
- **Semantic Memory (RAG)** - Remembers conversations using vector embeddings
- **Auto-Learning** - Automatically extracts and saves facts from conversations
- **Bilingual Support** - Fluent in English and Arabic
- **Smart Rate Limiting** - Tiered hourly limits with dynamic whitelist management
- **Persona System** - Configurable AI personalities (default: Raymond Reddington)

---

## ✨ Features

### 🤖 AI & Memory System

| Feature | Description | Status |
|---------|-------------|--------|
| **Semantic Search (RAG)** | Vector embeddings with pgvector for intelligent memory recall | ✅ |
| **Auto-Memory Learning** | Automatically extracts facts from conversations | ✅ |
| **Bilingual Support** | English + Arabic conversation support | ✅ |
| **Conversation History** | Per-user persistent conversation tracking | ✅ |
| **User Mention Understanding** | Context-aware responses when users are mentioned | ✅ |
| **Owner Detection** | Recognizes and responds appropriately to bot owner | ✅ |

### 🎮 Core Features

| Feature | Description |
|---------|-------------|
| **Leveling System** | XP-based progression with customizable rank cards |
| **Moderation** | Comprehensive moderation tools (ban, kick, mute, warn) |
| **Auto-Moderation** | Automated spam, link, and caps detection |
| **Temporary Channels** | Dynamic voice channel creation |
| **Welcome/Goodbye** | Customizable member join/leave messages |
| **Invite Tracking** | Track who invited each member |
| **Logging** | Comprehensive server activity logging |

### 🔐 Access Control

```mermaid
graph TD
    A[User Message] --> B{Auto-Chat Enabled?}
    B -->|No| Z[Ignore]
    B -->|Yes| C{User Type?}
    C -->|Owner| D[Unlimited Access]
    C -->|Whitelisted| E[6 messages/hour]
    C -->|Regular| F{In Allowed List?}
    F -->|Yes| G[3 messages/hour]
    F -->|No| Z
    
    D --> H[Process Message]
    E --> H
    G --> H
    H --> I[Generate AI Response]
    I --> J[Auto-Learn Facts]
```

---

## 🏗️ Architecture

### System Overview

```mermaid
graph LR
    A[Discord] --> B[Bot Client]
    B --> C[Event Handlers]
    C --> D[Command Handler]
    C --> E[AI Service]
    
    E --> F[Memory System]
    E --> G[Persona Config]
    E --> H[OpenRouter API]
    
    F --> I[(PostgreSQL + pgvector)]
    
    E --> J[Memory Extractor]
    J --> I
    
    I --> K[Embeddings Service]
    K --> L[@xenova/transformers]
```

### Directory Structure

```
raymond-v2/
├── src/
│   ├── commands/          # Command modules
│   │   ├── OwnerOnly/    # Owner-only commands (ai, aiwhitelist, etc.)
│   │   ├── moderation/   # Moderation commands
│   │   └── utility/      # Utility commands
│   ├── config/           # Configuration files
│   │   └── personas.js   # AI persona definitions
│   ├── database/         # Database modules
│   │   ├── aiMemory.js              # Semantic memory management
│   │   ├── aiChatUsageHourly.js     # Rate limiting
│   │   ├── aiConversationHistory.js # Conversation tracking
│   │   └── aiWhitelist.js           # Whitelist management
│   ├── events/           # Discord event handlers
│   │   └── messageCreate.js  # Message handling & AI integration
│   ├── services/         # Core services
│   │   ├── ai.js              # AI service (OpenRouter)
│   │   ├── memoryExtractor.js # Auto-learning system
│   │   ├── embeddings.js      # Vector embeddings
│   │   └── database.js        # PostgreSQL connection
│   └── utils/            # Utility functions
├── migrations/           # Database migrations
├── scripts/             # Utility scripts
└── .env                 # Environment configuration
```

---

## 🚀 Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **PostgreSQL** >= 14.0 with **pgvector** extension
- **Discord Bot Token**
- **OpenRouter API Key** (for AI features)

### Step 1: Clone Repository

```bash
git clone https://github.com/ahmedtouzani/Raymond.git
cd Raymond
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Database Setup

```bash
# Install pgvector extension in PostgreSQL
psql -U postgres -d your_database -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
npm run migrate
```

### Step 4: Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### Step 5: Start Bot

```bash
# Development
npm run dev

# Production
npm start
```

---

## ⚙️ Configuration

### Environment Variables

#### **Required**

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Discord bot token | `MTIzNDU2Nzg5...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost/db` |
| `OWNER_ID` | Discord user ID of bot owner | `123456789012345678` |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI | `sk-or-v1-...` |

#### **AI Configuration**

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PERSONA` | `raymond` | Active AI persona |
| `AI_AUTO_CHAT_ENABLED` | `true` | Enable auto-chat on mentions |
| `AI_EMBEDDINGS_ENABLED` | `true` | Enable semantic search |
| `AI_MEMORY_RETRIEVAL` | `hybrid` | Memory retrieval mode (semantic/keyword/hybrid) |

#### **Rate Limiting**

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_HOURLY_LIMIT_REGULAR` | `3` | Messages per hour for regular users |
| `AI_HOURLY_LIMIT_WHITELISTED` | `6` | Messages per hour for whitelisted users |

#### **Auto-Memory Learning**

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_AUTO_MEMORY_ENABLED` | `true` | Enable automatic fact learning |
| `AI_AUTO_MEMORY_MIN_LENGTH` | `15` | Minimum message length to analyze |
| `AI_AUTO_MEMORY_COOLDOWN_MS` | `3000` | Cooldown between extractions (ms) |

#### **Semantic Search**

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MEMORY_SIMILARITY_THRESHOLD` | `0.7` | Minimum similarity score (0-1) |
| `AI_MEMORY_TOP_K` | `3` | Number of memories to retrieve |
| `AI_MEMORY_MIN_QUERY_CHARS` | `5` | Minimum query length for search |

### Access Control

**Three ways to grant AI access:**

1. **Owner** - Unlimited access (set via `OWNER_ID`)
2. **Whitelist** - Dynamic management via `!aiwhitelist` commands
3. **Allowed Users** - Static list in `.env` (`AI_ALLOWED_USERS`)

---

## 🗄️ Database Schema

### AI Tables

```mermaid
erDiagram
    ai_memories ||--o{ ai_chat_usage_hourly : tracks
    ai_memories ||--o{ ai_conversation_history : references
    ai_whitelist ||--o{ ai_chat_usage_hourly : affects
    
    ai_memories {
        int id PK
        text value
        text key
        string created_by
        timestamp created_at
        timestamp last_used_at
        vector embedding
        string embedding_model
    }
    
    ai_chat_usage_hourly {
        int id PK
        string guild_id
        string user_id
        timestamp hour_start
        int message_count
    }
    
    ai_conversation_history {
        int id PK
        string guild_id
        string user_id
        text message
        string role
        string message_id
        timestamp created_at
    }
    
    ai_whitelist {
        int id PK
        string guild_id
        string user_id
        string added_by
        text reason
        timestamp created_at
    }
```

### Core Tables

| Table | Purpose |
|-------|---------|
| `guild_configs` | Server-specific settings |
| `user_levels` | XP and leveling data |
| `warnings` | User warning records |
| `invites_cache` | Invite tracking |
| `temp_channels` | Temporary voice channels |

---

## 🎮 Commands

### AI Commands

| Command | Description | Access |
|---------|-------------|--------|
| `!ai <message>` | Chat with AI | Owner |
| `!ai remember <fact>` | Manually save a memory | Owner |
| `!ai memories` | List all saved memories | Owner |
| `!ai forget <id>` | Delete a memory | Owner |
| `!aiwhitelist add @user [reason]` | Add user to whitelist | Owner |
| `!aiwhitelist remove @user` | Remove from whitelist | Owner |
| `!aiwhitelist list` | Show whitelisted users | Owner |
| `!aiwhitelist clear` | Clear entire whitelist | Owner |

### Moderation Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `!ban @user [reason]` | Ban a user | BAN_MEMBERS |
| `!kick @user [reason]` | Kick a user | KICK_MEMBERS |
| `!mute @user <duration> [reason]` | Timeout a user | MODERATE_MEMBERS |
| `!warn @user <reason>` | Warn a user | MODERATE_MEMBERS |
| `!warnings @user` | View user warnings | MODERATE_MEMBERS |

### Utility Commands

| Command | Description |
|---------|-------------|
| `!level [@user]` | Check XP level |
| `!leaderboard` | Server XP leaderboard |
| `!serverinfo` | Server information |
| `!userinfo [@user]` | User information |
| `!avatar [@user]` | Get user avatar |

---

## 🧠 AI System

### How It Works

#### 1. **Message Reception**
```javascript
User mentions bot → Check access control → Check rate limit → Process
```

#### 2. **Memory Retrieval (Semantic Search)**
```javascript
User query → Generate embedding → Search similar memories → Retrieve top K
```

#### 3. **AI Response Generation**
```javascript
Context + Memories + History → OpenRouter API → Generate response
```

#### 4. **Auto-Learning**
```javascript
Conversation → Extract facts → Check duplicates → Save to memory
```

### Memory Extraction Flow

```mermaid
sequenceDiagram
    participant U as User
    participant B as Bot
    participant E as Memory Extractor
    participant AI as AI Service
    participant DB as Database
    
    U->>B: Send message
    B->>AI: Generate response
    AI->>B: Return response
    B->>U: Reply
    B->>E: Process conversation
    E->>AI: Extract facts (skipMemory=true)
    AI->>E: Return facts
    E->>E: Parse & validate
    E->>DB: Check for duplicates
    DB->>E: Similarity results
    E->>DB: Save new facts
    DB->>E: Confirm saved
```

### Persona System

Personas are defined in `src/config/personas.js`:

```javascript
{
  systemPrompt: "You are Raymond Reddington...",
  temperature: 0.8,
  maxTokens: 200,
  traits: ["witty", "sophisticated", "mysterious"],
  languages: ["en", "ar"]
}
```

**Switch personas:**
```bash
# In .env
AI_PERSONA=raymond  # or 'default'
```

---

## 🛠️ Development

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Start** | `npm start` | Run bot in production |
| **Dev** | `npm run dev` | Run with nodemon (auto-reload) |
| **Migrate** | `npm run migrate` | Run database migrations |
| **Backfill Embeddings** | `npm run ai:embeddings:backfill` | Generate embeddings for existing memories |
| **Backup** | `npm run backup:create` | Create database backup |

### Creating Migrations

```bash
npm run migrate:create -- <migration_name>
```

### Adding New Commands

1. Create file in `src/commands/<category>/<command>.js`
2. Export object with `name`, `description`, `execute` function
3. Bot auto-loads on restart

Example:
```javascript
module.exports = {
  name: 'mycommand',
  description: 'My custom command',
  async execute(message, args) {
    await message.reply('Hello!');
  }
};
```

---

## 📊 Performance

### Optimization Features

- **Memory Caching** - 60-second TTL for memory queries
- **Rate Limiting** - Prevents API abuse
- **Cooldown System** - 3-second cooldown for auto-learning
- **Duplicate Detection** - 85% similarity threshold
- **Token Limits** - Max 200 tokens for responses
- **Batch Processing** - Efficient database operations

### Resource Usage

| Resource | Typical Usage |
|----------|---------------|
| **RAM** | ~150-300 MB |
| **CPU** | <5% idle, ~20% during AI requests |
| **Database** | ~50-200 MB (depends on usage) |
| **API Calls** | ~1-10/minute (depends on activity) |

---

## 🔒 Security

- ✅ Environment variables for sensitive data
- ✅ Owner-only commands for critical operations
- ✅ Rate limiting to prevent abuse
- ✅ Input validation and sanitization
- ✅ Database prepared statements (SQL injection protection)
- ✅ No sensitive data in logs (production mode)

---

## 🌍 Bilingual Support

### Supported Languages

- **English** - Full support
- **Arabic** - Full support (RTL text, native responses)

### How It Works

The bot automatically detects the conversation language and:
- Responds in the same language
- Saves memories in the original language
- Extracts facts using bilingual prompts

**Example:**
```
English: "My name is Ahmed" → Saves: "User's name is Ahmed"
Arabic: "اسمي أحمد" → Saves: "اسم المستخدم أحمد"
```

---

## 📝 License

This project is licensed under the ISC License.

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📧 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/ahmedtouzani/Raymond/issues)
- **Documentation**: See [CORE_LOGIC.md](CORE_LOGIC.md) for detailed architecture

---

## 🎯 Roadmap

### v3.1.0 (Planned)
- [ ] Web dashboard for bot management
- [ ] Multi-server memory isolation
- [ ] Custom persona creation via commands
- [ ] Advanced analytics and insights

### v3.2.0 (Planned)
- [ ] Voice AI integration
- [ ] Image generation capabilities
- [ ] Plugin system for extensions

---

<div align="center">

**Made with ❤️ by Ahmed**

⭐ Star this repo if you find it useful!

</div>
