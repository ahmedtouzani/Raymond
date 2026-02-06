<div align="center">

![Project Overlord Banner](assets/banner.png)

# 🌌 Raymond v2 - Project Overlord

[![Version](https://img.shields.io/badge/version-2.0.9-blue.svg?style=for-the-badge&logo=rocket)](RELEASE_NOTES_v2.0.9.md)
[![Build](https://img.shields.io/badge/build-stable-success.svg?style=for-the-badge&logo=github)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg?style=for-the-badge&logo=law)](LICENSE)

<p>
  <b>The Premium Discord Server Operating System</b><br>
  <i>Visual Graphics • Neural Core • Autonomous Admin</i>
</p>

</div>

---

## 💎 Premium Feature Suite

<table>
  <tr>
    <td width="50%" align="center">
      <h3>🎨 Visual Graphics Engine</h3>
      <p>Forget text. We render dynamic 4K images.</p>
    </td>
    <td width="50%" align="center">
      <h3>🧠 Neural Core (Reddington)</h3>
      <p>Context-aware AI with 99.9% uptime.</p>
    </td>
  </tr>
  <tr>
    <td>
      <ul>
        <li><b>Rank Cards:</b> Personalized XP tracking.</li>
        <li><b>Visual Leaderboards:</b> Gold/Silver/Bronze medals.</li>
        <li><b>Theme Engine:</b> Auto-adapts to server colors.</li>
      </ul>
    </td>
    <td>
       <ul>
        <li><b>Persona:</b> Sophisticated & Helpful.</li>
        <li><b>Smart Switcher:</b> Auto-fallback (DeepSeek/Gemini).</li>
        <li><b>Memory:</b> Remembers users & context.</li>
      </ul>
    </td>
  </tr>
   <tr>
    <td width="50%" align="center">
      <h3>🎛️ No-Code Admin Panel</h3>
      <p>Configure everything via Buttons & GUI.</p>
    </td>
    <td width="50%" align="center">
      <h3>📚 Smart Documentation</h3>
      <p>Interactive Drill-Down Navigation.</p>
    </td>
  </tr>
  <tr>
    <td>
      <ul>
        <li><b>Wizard:</b> <code>!levelsetup</code> dashboard.</li>
        <li><b>Visual Config:</b> Set XP & Rewards visually.</li>
        <li><b>Live Preview:</b> Test before applying.</li>
      </ul>
    </td>
    <td>
      <ul>
        <li><b>Drill-Down:</b> Category → Command → Details.</li>
        <li><b>Safe Mode:</b> Hides Owner/Admin commands.</li>
        <li><b>Grid View:</b> Clean visual command lists.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🏗️ System Architecture

### 🧠 The Smart AI Engine
How "Project Reddington" maintains 99.9% availability using intelligent fallbacks.

```mermaid
graph LR
    User[User] -->|!ai Prompt| Bot[Raymond Bot]
    Bot -->|Request| Switcher{Smart Switcher}
    Switcher -->|Primary| DeepSeek[DeepSeek V3]
    DeepSeek --x|Error/Limit| Switcher
    Switcher -->|Fallback| Gemini[Gemini 2.0]
    DeepSeek -->|Response| Bot
    Gemini -->|Response| Bot
    Bot -->|Reply| User
    style Switcher fill:#f9f,stroke:#333
```

### 🎨 The Canvas Pipeline
How we generate High-Fidelity graphics in milliseconds.

```mermaid
sequenceDiagram
    participant U as User
    participant B as Bot (Core)
    participant DB as Postgres DB
    participant G as Graphics Engine
    
    U->>B: !rank
    B->>DB: Fetch XP & Level
    DB-->>B: Return Data
    B->>G: Load Avatar & Theme
    G->>G: Render Canvas (4K)
    G-->>B: Buffer Stream
    B->>U: Send Image Attachment
```


---

## 🚀 Installation & Setup

### Prerequisites
*   Node.js v18+ (Required for Canvas support)
*   PostgreSQL Database
*   Discord Bot Token & Client ID
*   OpenRouter API Key (For AI features)

### Quick Start

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/ahmedtouzani/Raymnond.git
    cd Raymond
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```
    *Note: This includes `@napi-rs/canvas` which may require build tools on some OS.*

3.  **Configure Environment**
    Create a `.env` file:
    ```env
    # Core
    DISCORD_TOKEN=your_token
    OWNER_ID=your_id
    DATABASE_URL=postgres://user:pass@localhost:5432/raymond

    # AI
    OPENROUTER_API_KEY=your_key
    AI_MODEL=deepseek/deepseek-chat
    ```

4.  **Launch**
    ```bash
    npm run dev
    ```

---

## 📦 Documentation
For a deep dive into the features and technical architecture of this release, please consult the official documents:

*   **[Release Notes (v2.0.9)](RELEASE_NOTES_v2.0.9.md)** - Executive Summary & Strategy.
*   **[Changelog](CHANGELOG.md)** - detailed list of technical changes.

---

## 📝 License & Copyright
**© 2026 Parallel Universe**. All Rights Reserved.

This project is proprietary software. Unauthorized reproduction or distribution is strictly prohibited.
See the [LICENSE](LICENSE) file for details.

*   **Lead Developer**: Ahmed Touzani
*   **System Version**: 2.0.9 (Overlord)
