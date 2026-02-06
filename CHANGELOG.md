# Changelog

All notable changes to this project will be documented in this file.

## [2.0.9] - 2026-02-06
### Added
- **Canvas Leaderboard System**:
  - `!rank` and `!top` commands now generate beautiful dynamic images.
  - Custom theme support (server-wide and user-specific fallback).
- **Admin Control Panel**:
  - `!levelsetup` wizard with interactive buttons.
  - Toggle XP, Role Rewards, and Level-up Messages.
  - Customize XP multipliers and cooldowns.
- **AI Integration (Raymond Reddington)**:
  - `!ai` command powered by OpenRouter (DeepSeek/Gemini).
  - Smart Model Switcher (Fallbacks for 404/Rate Limits).
  - Context-aware memory (User/Server names, past conversations).
- **Smart Help Menu**:
  - Drill-down navigation (Category -> Command).
  - Strict privacy for Owner/Admin commands.
  - Pitch Black branded UI.

### Changed
- Refactored Jail System:
  - Unified `jail` command logic.
  - Added Setup Wizard for jail roles/channels.
- Refactored Help Command:
  - Replaced static list with interactive dropdowns.
  - Improved layout (Grid visuals).

### Fixed
- **Critical Crash**: Fixed `DiscordAPIError[50005]` (Cannot edit message) in `ready.js` dev status update.
- **Interaction Conflict**: Fixed "Unknown button interaction" error in global handler.
- **Database**: Fixed query parameter index error in `updateGuildSettings`.
- **Role Rewards**: Fixed bug where rewards wouldn't toggle correctly in the panel.
- **Dependency**: Added missing `PermissionsBitField` import in `help.js`.

### Removed
- Deprecated jail setting files (`setjailrole.js`, `setjailvoice.js`, `jailsettings.js`).
