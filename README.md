# vcf-discord-bot

A modern Discord bot built with **discord.js v14** featuring advanced moderation commands, utility commands, and a Melonly-style shift tracking system.

---

## Features

### 🛡️ Moderation
| Command | Description |
|---|---|
| `/ban` | Permanently ban a member (with optional message deletion) |
| `/unban` | Unban a user by ID |
| `/kick` | Kick a member from the server |
| `/timeout` | Timeout (mute) a member for a set duration (e.g. `10m`, `2h`, `1d`) |
| `/untimeout` | Remove a timeout from a member |
| `/warn` | Issue a warning to a member |
| `/warnings` | View all warnings for a member |
| `/clearwarnings` | Clear all warnings for a member |
| `/purge` | Bulk-delete up to 100 messages, optionally filtered by user |

### 🔧 Utility
| Command | Description |
|---|---|
| `/ping` | Check bot latency and API heartbeat |
| `/userinfo` | Display detailed info about a user |
| `/serverinfo` | Display detailed info about the server |
| `/avatar` | Show a user's server or global avatar |
| `/help` | List all commands or get info on a specific one |

### 🕐 Shifts (Melonly-style)
| Command | Description |
|---|---|
| `/startshift` | Clock in and begin your shift |
| `/endshift` | Clock out and end your shift (shows duration & totals) |
| `/shiftlog active` | See all currently on-duty staff |
| `/shiftlog user` | View shift history and statistics for a user |
| `/shiftleaderboard` | View the top-10 staff by total shift time |

---

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ShadowsDistant/vcf-discord-bot.git
cd vcf-discord-bot

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your values
cp .env.example .env
```

Edit `.env`:
```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here

# Optional: set this to a guild ID to deploy commands to a single server (instant)
# Leave blank to deploy globally (takes up to 1 hour to propagate)
GUILD_ID=your_test_guild_id
```

### Deploy Slash Commands

```bash
npm run deploy
```

### Start the Bot

```bash
npm start
```

---

## Bot Permissions

When inviting the bot to your server, make sure it has the following permissions:
- `Ban Members`
- `Kick Members`
- `Moderate Members` (for timeouts)
- `Manage Messages` (for purge)
- `View Channels`
- `Send Messages`
- `Embed Links`
- `Read Message History`

---

## Project Structure

```
vcf-discord-bot/
├── src/
│   ├── commands/
│   │   ├── moderation/   # ban, unban, kick, timeout, untimeout, warn, warnings, clearwarnings, purge
│   │   ├── utility/      # ping, userinfo, serverinfo, avatar, help
│   │   └── shifts/       # startshift, endshift, shiftlog, shiftleaderboard
│   ├── events/
│   │   ├── ready.js
│   │   └── interactionCreate.js
│   ├── utils/
│   │   ├── embeds.js     # Consistent embed factory
│   │   ├── database.js   # JSON-based persistence (warnings + shifts)
│   │   └── helpers.js    # Duration parsing/formatting utilities
│   └── data/             # Auto-created JSON data files (gitignored)
├── index.js              # Bot entry point
├── deploy-commands.js    # Slash command deployment script
└── .env.example
```

---

## License

ISC
