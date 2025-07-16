# Parallel Ultra Bot

🤖 A feature-rich Discord bot designed to enhance your server with powerful customization options and moderation tools.

## ✨ Features

- **Advanced Embed Customization**
  - Custom colors, footers, and icons for embeds
  - Rich text formatting support
  - Dynamic content embedding

- **Moderation Tools**
  - Message management
  - User management commands
  - Automated moderation features

- **Server Management**
  - Role management
  - Channel organization
  - Custom server configuration

- **Premium Features**
  - Advanced customization options
  - Priority support
  - Exclusive commands

- **Utility**
  - Server information
  - User information
  - Custom commands

- **Security**
  - Role-based permissions
  - Audit logging
  - Anti-spam protection

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.x or higher / yarn 1.22.x or higher
- Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)
- Git (for installation and updates)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ahmedtouzani/paralelbot-js.git
   cd paralelbot-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn
   ```

3. **Configuration**
   - Copy `.env.example` to `.env`
   - Edit the `.env` file with your credentials:
     ```env
     DISCORD_TOKEN=your_bot_token_here
     CLIENT_ID=your_client_id_here
     GUILD_ID=your_testing_server_id
     ```

4. **Starting the Bot**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Invite the Bot**
   Replace `YOUR_CLIENT_ID` in this URL and visit it to add the bot to your server:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```

## 🤖 Available Commands

### 🛠️ Utility Commands
- `/ping` - Check bot's latency and status
- `/help` - Show all available commands
- `/serverinfo` - Display server information
- `/userinfo [@user]` - Get information about a user

### 🎨 Embed Commands
- `/embed create` - Create a new embed
- `/embed color <color>` - Set embed color (hex/rgb/color name)
- `/embed footer <text> [icon_url]` - Set embed footer
- `/embed author <name> [icon_url] [url]` - Set embed author
- `/embed field add <name> <value> [inline]` - Add a field to embed
- `/embed thumbnail <url>` - Set embed thumbnail
- `/embed image <url>` - Set embed image

### ⚙️ Configuration Commands
- `/config prefix <new_prefix>` - Change bot's command prefix
- `/config logchannel <channel>` - Set log channel
- `/config welcome <channel> <message>` - Set welcome message
- `/config modrole <role>` - Set moderator role

### 🛡️ Moderation Commands
- `/kick <@user> [reason]` - Kick a user
- `/ban <@user> [reason] [days]` - Ban a user
- `/mute <@user> <time> [reason]` - Mute a user
- `/warn <@user> <reason>` - Warn a user
- `/clear <amount>` - Delete messages in bulk

### 🎵 Music Commands
- `/play <query>` - Play a song
- `/skip` - Skip current song
- `/stop` - Stop playback
- `/queue` - Show current queue
- `/volume <0-200>` - Adjust volume

*Note: Some commands may require specific permissions to use.*

## ⚙️ Configuration

Edit the `config.json` file to configure bot settings, or use environment variables for sensitive data.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Powered by [Node.js](https://nodejs.org/)
- Thanks to all contributors who helped improve this project

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before making a pull request.

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each version.

## 📧 Contact

For support or feature requests, please [open an issue](https://github.com/ahmedtouzani/paralelbot-js/issues) on GitHub.

---

Made with ❤️ by [Ahmed Touzani](https://github.com/ahmedtouzani)
