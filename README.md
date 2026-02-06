# 🌌 Raymond v2 - Project Overlord

[![Version](https://img.shields.io/badge/version-2.0.9-blue.svg?style=for-the-badge)](RELEASE_NOTES_v2.0.9.md)
[![Build](https://img.shields.io/badge/build-stable-success.svg?style=for-the-badge)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg?style=for-the-badge)](LICENSE)

**Raymond v2** is a premium, enterprise-grade Discord Server Operating System designed for communities that demand visual excellence and autonomous management. 

Built on the **Parallel Universe Engine**, it combines high-fidelity graphics generation with a context-aware neural core to deliver an unmatched user experience.

---

## ✨ Features at a Glance

### 🎨 Visual Graphics Engine (Canvas)
Forget boring text embeds. Raymond renders dynamic, server-side images for key interactions.
*   **Rank Cards**: Personalized XP cards with avatar processing and progress bars.
*   **Visual Leaderboards**: High-res podium finishers (Gold/Silver/Bronze) generated on the fly.
*   **Theme System**: Automatically adapts to your server's color palette (Pitch Black / Custom).

### 🧠 Neural Core (Project Reddington)
Powered by a multi-model AI architecture (DeepSeek V3 / Gemini 2.0).
*   **Persona**: Adopted the sophisticated "Raymond Reddington" personality.
*   **Smart Switcher**: Auto-detects API failures and reroutes to backup models instantly (99.9% uptime).
*   **Memory**: Context-aware conversations that remember user names and past topics.

### 🎛️ No-Code Admin Panel
Stop memorizing commands. Configure your server with a GUI.
*   **Interactive Wizard**: `!levelsetup` opens a full dashboard with buttons and toggles.
*   **Visual Config**: Enable XP, set multipliers, and assign role rewards with zero coding.
*   **Live Preview**: Test changes before applying them.

### 📚 Smart Documentation
A help system that actually helps.
*   **Drill-Down Navigation**: Interactive dropdowns take you from Category → Command → Details.
*   **Permission Filtering**: "Owner Only" and "Admin" commands are completely invisible to regular users.

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
