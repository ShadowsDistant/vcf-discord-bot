# vcf-discord-bot

A modern, feature-rich Discord bot built with **discord.js v14** featuring advanced moderation, utility commands, a Melonly-style staff shift system, server setup commands, and restricted developer tools. All responses use rich, consistently-styled embeds with colour-coded feedback.

---

## Table of Contents

- [Features Overview](#features-overview)
- [Command Reference](#command-reference)
  - [🛡️ Moderation](#️-moderation)
  - [🔧 Utility](#-utility)
  - [🕐 Shifts](#-shifts)
  - [⚙️ Setup](#️-setup)
  - [👨‍💻 Developer](#-developer)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Deploying Slash Commands](#deploying-slash-commands)
  - [Running the Bot](#running-the-bot)
- [Bot Permissions](#bot-permissions)
- [Embed Design System](#embed-design-system)
- [Data Persistence](#data-persistence)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features Overview

| Category | Highlights |
|---|---|
| 🛡️ **Moderation** | Ban, kick, timeout, warn system, purge, lock/unlock channels, slowmode, role management |
| 🔧 **Utility** | Ping, userinfo, serverinfo, avatar, botinfo, help |
| 🕐 **Shifts** | Clock-in/out, shift history, active shifts list, leaderboard |
| ⚙️ **Setup** | Admin-only server configuration (mod logs, welcome messages) |
| 👨‍💻 **Developer** | Set bot presence, list guilds, broadcast announcements |
| 🎨 **Embeds** | Colour-coded, titled embeds for all responses; welcome DM on member join |

---

## Command Reference

### 🛡️ Moderation

All moderation commands require the corresponding Discord permission. Error responses are always sent **ephemerally** (only visible to the invoking moderator).

---

#### `/ban`
Permanently ban a member from the server.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member to ban |
| `reason` | String | ❌ | Reason for the ban (logged to audit log) |
| `delete_days` | Integer (0–7) | ❌ | Days of message history to delete |

**Required permission:** `Ban Members`

---

#### `/unban`
Unban a previously banned user by their Discord user ID.

| Option | Type | Required | Description |
|---|---|---|---|
| `user_id` | String | ✅ | The 17–20 digit Discord user ID |
| `reason` | String | ❌ | Reason for the unban |

**Required permission:** `Ban Members`

---

#### `/kick`
Kick a member from the server (they may rejoin with an invite).

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member to kick |
| `reason` | String | ❌ | Reason for the kick |

**Required permission:** `Kick Members`

---

#### `/timeout`
Temporarily mute a member using Discord's built-in timeout system (max 28 days).

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member to timeout |
| `duration` | String | ✅ | Duration string, e.g. `10m`, `2h`, `7d` |
| `reason` | String | ❌ | Reason for the timeout |

**Supported duration units:** `s` (seconds), `m` (minutes), `h` (hours), `d` (days)  
**Required permission:** `Moderate Members`

---

#### `/untimeout`
Remove an active timeout from a member.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member to un-timeout |
| `reason` | String | ❌ | Reason for removing the timeout |

**Required permission:** `Moderate Members`

---

#### `/warn`
Issue a formal warning to a member. Warnings are stored persistently and viewable with `/warnings`.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member to warn |
| `reason` | String | ✅ | Reason for the warning |

**Required permission:** `Moderate Members`

---

#### `/warnings`
View all recorded warnings for a member (shows up to 10 most recent with dates and moderators).

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member to check |

**Required permission:** `Moderate Members`

---

#### `/clearwarnings`
Clear all warnings on record for a member.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ✅ | The member whose warnings to clear |

**Required permission:** `Moderate Members`

---

#### `/purge`
Bulk-delete up to 100 messages from the current channel. Only messages under 14 days old can be deleted (Discord limitation).

| Option | Type | Required | Description |
|---|---|---|---|
| `amount` | Integer (1–100) | ✅ | Number of messages to delete |
| `user` | User | ❌ | Only delete messages from this specific user |

**Required permission:** `Manage Messages`

---

#### `/lock`
Prevent `@everyone` from sending messages in a channel.

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Channel | ❌ | Channel to lock (defaults to current) |
| `reason` | String | ❌ | Reason for locking |

**Required permission:** `Manage Channels`

---

#### `/unlock`
Restore `@everyone` send-message permissions in a previously locked channel.

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Channel | ❌ | Channel to unlock (defaults to current) |
| `reason` | String | ❌ | Reason for unlocking |

**Required permission:** `Manage Channels`

---

#### `/slowmode`
Set a per-user message cooldown on a channel (0 disables it, max 6 hours).

| Option | Type | Required | Description |
|---|---|---|---|
| `seconds` | Integer (0–21600) | ✅ | Cooldown in seconds (0 = off) |
| `channel` | Channel | ❌ | Channel to apply slowmode to (defaults to current) |

**Required permission:** `Manage Channels`

---

#### `/role`
Add or remove a role from a member.

**Subcommands:**

- `/role add <user> <role> [reason]` — Grant a role to a member
- `/role remove <user> <role> [reason]` — Remove a role from a member

**Required permission:** `Manage Roles`  
> The bot cannot assign roles equal to or higher than its own highest role.

---

### 🔧 Utility

---

#### `/ping`
Check bot latency and Discord API heartbeat.

Displays:
- **Roundtrip latency** (time between command sent and reply received)
- **API heartbeat** (WebSocket ping to Discord's gateway)

---

#### `/userinfo`
Display detailed information about a server member or user.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ❌ | User to look up (defaults to yourself) |

Shows: User ID, account creation date, server join date, roles, nickname, badges/flags, bot status.

---

#### `/serverinfo`
Display comprehensive information about the current server.

Shows: Server ID, owner, member count (humans vs bots), channel breakdown, role count, boost level, verification level, NSFW level, creation date, server banner.

---

#### `/avatar`
Display a user's full-size avatar with a direct link.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ❌ | User whose avatar to show (defaults to yourself) |

If the user has a server-specific avatar, both the server and global avatars are linked.

---

#### `/botinfo`
Display detailed statistics and runtime information about the bot itself.

Shows: Bot ID, tag, creation date, server count, total member count, command count, uptime, Node.js version, discord.js version, heap memory usage, API heartbeat.

---

#### `/help`
List all available commands grouped by category, or get detailed info on a specific command.

| Option | Type | Required | Description |
|---|---|---|---|
| `command` | String | ❌ | Command name to get detailed help for |

---

### 🕐 Shifts

The shift system allows staff members to clock in and out, tracking their on-duty time persistently per server.

---

#### `/startshift`
Clock in and begin your shift. Records your start time.

> Returns a warning if you are already on an active shift.

---

#### `/endshift`
Clock out and end your current shift. Displays:
- Shift duration
- Start and end timestamps
- Cumulative total time across all completed shifts
- Total number of shifts completed

---

#### `/shiftlog active`
View all staff members currently on an active shift, including elapsed time per person.

---

#### `/shiftlog user`
View a user's shift statistics and recent history.

| Option | Type | Required | Description |
|---|---|---|---|
| `user` | User | ❌ | User to look up (defaults to yourself) |

Shows: total shifts completed, total time on record, current shift status, last 5 completed shifts with dates and durations.

---

#### `/shiftleaderboard`
View the top 10 staff members ranked by total shift time. If you are outside the top 10, your personal rank is appended below.

---

### ⚙️ Setup

Setup commands can only be used by members with the **Administrator** permission. They configure server-specific bot behaviour stored persistently in `src/data/config.json`.

---

#### `/setup logs <channel>`
Set the text channel where moderation log messages are sent.

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Text Channel | ✅ | Channel to use for mod logs |

---

#### `/setup welcome <channel> [message]`
Configure an automated welcome message when new members join.

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Text Channel | ✅ | Channel to send welcome messages in |
| `message` | String | ❌ | Custom message text. Use `{user}` for a mention and `{server}` for the server name. Defaults to a built-in welcome message. |

**Example custom message:** `Hey {user}, welcome to {server}! Read the rules in #rules. 👋`

---

#### `/setup removewelcome`
Disable welcome messages for this server.

---

#### `/setup removelogs`
Disable mod-log messages for this server.

---

#### `/setup view`
View the current bot configuration for this server, including the configured mod log channel and welcome channel/message.

---

### 👨‍💻 Developer

Developer commands are restricted to the bot owner (user ID `757698506411475005`). Any other user will receive an ephemeral error embed.

---

#### `/setstatus`
Change the bot's online status and activity in real-time.

| Option | Type | Required | Description |
|---|---|---|---|
| `status` | Choice | ✅ | `online`, `idle`, `dnd`, or `invisible` |
| `activity_type` | Choice | ✅ | `Playing`, `Watching`, `Listening to`, `Competing in`, or `None` |
| `activity_text` | String | ❌ | The activity text (required unless type is `None`) |

---

#### `/servers`
List all Discord servers the bot is currently in (up to 20 shown).

Shows: server name, ID, member count, total guild count, and total combined member count.

---

#### `/announce`
Send a custom rich embed announcement to any text channel in the current server.

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Text Channel | ✅ | Channel to post the announcement in |
| `title` | String | ✅ | Title of the announcement embed |
| `message` | String | ✅ | Body text of the announcement |
| `color` | Choice | ❌ | Embed accent colour: `Blue` (default), `Green`, `Red`, `Yellow`, `Purple` |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **v18 or higher**
- A Discord application and bot token — create one at the [Discord Developer Portal](https://discord.com/developers/applications)
- The bot must be invited to your server with the required permissions (see [Bot Permissions](#bot-permissions))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ShadowsDistant/vcf-discord-bot.git
cd vcf-discord-bot

# 2. Install dependencies
npm install

# 3. Copy the environment template
cp .env.example .env
```

### Environment Variables

Edit the `.env` file with your credentials:

```env
# Required
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here

# Optional — set to a single guild ID for instant command deployment (for testing)
# Leave blank to deploy globally (takes up to 1 hour to propagate)
GUILD_ID=your_test_guild_id
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Your bot's secret token from the Developer Portal |
| `CLIENT_ID` | ✅ | Your application's client/application ID |
| `GUILD_ID` | ❌ | A single guild ID for guild-scoped (instant) command deployment |

> ⚠️ **Never commit your `.env` file.** It is listed in `.gitignore` by default.

### Deploying Slash Commands

You must deploy slash commands before they appear in Discord. Run:

```bash
npm run deploy
```

- If `GUILD_ID` is set, commands are registered to that guild instantly.
- If `GUILD_ID` is blank, commands are registered globally and may take up to **1 hour** to propagate to all servers.

> Re-run `npm run deploy` whenever you add, remove, or modify commands.

### Running the Bot

```bash
npm start
```

The bot will log in, load all commands and events, and set its initial presence to `Listening to /help`.

---

## Bot Permissions

When inviting the bot to your server, grant the following permissions:

| Permission | Required For |
|---|---|
| `View Channels` | All commands |
| `Send Messages` | All commands |
| `Embed Links` | All commands (embed responses) |
| `Read Message History` | `/purge` |
| `Manage Messages` | `/purge`, `/slowmode` |
| `Manage Channels` | `/lock`, `/unlock`, `/slowmode` |
| `Manage Roles` | `/role add` / `/role remove` |
| `Kick Members` | `/kick` |
| `Ban Members` | `/ban`, `/unban` |
| `Moderate Members` | `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarnings` |

> **Recommended invite URL:** Use the OAuth2 URL generator in the Developer Portal. Select `bot` + `applications.commands` scopes, and tick the permissions above. The bot should also have a role higher than any role it needs to assign or any member it needs to moderate.

> **Privileged Intents:** The `Server Members Intent` must be enabled in the Developer Portal (Bot settings) for the welcome message feature (`guildMemberAdd` event) to work.

---

## Embed Design System

All bot responses use a consistent embed design defined in `src/utils/embeds.js`:

| Embed Type | Colour | Usage |
|---|---|---|
| `success` | 🟢 Green `#57F287` | Successful operations (unban, clear warnings, etc.) |
| `error` | 🔴 Red `#ED4245` | Permission errors, validation failures, unexpected errors |
| `warning` | 🟡 Yellow `#FEE75C` | Non-fatal issues (already on shift, no warnings found, etc.) |
| `info` | 🔵 Blurple `#5865F2` | Informational responses (ping, userinfo, serverinfo, etc.) |
| `shift` | 🌸 Pink `#EB459E` | Shift system (start shift, end shift, leaderboard) |
| `setup` | 🟦 Teal `#1ABC9C` | Server configuration responses |
| `dev` | 🟣 Purple `#9B59B6` | Developer command responses |
| `modAction` | 🔴 Red `#ED4245` | Moderation actions (ban, kick, warn, timeout) with rich field layout |

Every embed includes:
- A **timestamp** (bottom right)
- A **footer** with the server name and icon
- **Colour-coded title** indicating the response type

---

## Data Persistence

Data is stored as plain JSON files inside `src/data/` (auto-created, git-ignored):

| File | Contents |
|---|---|
| `warnings.json` | Per-guild, per-user warning records (moderator, reason, timestamp) |
| `shifts.json` | Per-guild active shifts and completed shift history |
| `config.json` | Per-guild bot configuration (log channel, welcome channel/message) |

All reads and writes go through `src/utils/database.js` which provides a simple key/value interface on top of the JSON files.

---

## Project Structure

```
vcf-discord-bot/
├── src/
│   ├── commands/
│   │   ├── moderation/
│   │   │   ├── ban.js            # /ban
│   │   │   ├── unban.js          # /unban
│   │   │   ├── kick.js           # /kick
│   │   │   ├── timeout.js        # /timeout
│   │   │   ├── untimeout.js      # /untimeout
│   │   │   ├── warn.js           # /warn
│   │   │   ├── warnings.js       # /warnings
│   │   │   ├── clearwarnings.js  # /clearwarnings
│   │   │   ├── purge.js          # /purge
│   │   │   ├── lock.js           # /lock
│   │   │   ├── unlock.js         # /unlock
│   │   │   ├── slowmode.js       # /slowmode
│   │   │   └── role.js           # /role add|remove
│   │   ├── utility/
│   │   │   ├── ping.js           # /ping
│   │   │   ├── userinfo.js       # /userinfo
│   │   │   ├── serverinfo.js     # /serverinfo
│   │   │   ├── avatar.js         # /avatar
│   │   │   ├── botinfo.js        # /botinfo
│   │   │   └── help.js           # /help
│   │   ├── shifts/
│   │   │   ├── startshift.js     # /startshift
│   │   │   ├── endshift.js       # /endshift
│   │   │   ├── shiftlog.js       # /shiftlog active|user
│   │   │   └── shiftleaderboard.js # /shiftleaderboard
│   │   ├── setup/
│   │   │   └── setup.js          # /setup logs|welcome|removewelcome|removelogs|view
│   │   └── dev/
│   │       ├── setstatus.js      # /setstatus  (dev only)
│   │       ├── servers.js        # /servers    (dev only)
│   │       └── announce.js       # /announce   (dev only)
│   ├── events/
│   │   ├── ready.js              # Sets initial presence on login
│   │   ├── interactionCreate.js  # Routes slash command interactions
│   │   └── guildMemberAdd.js     # Sends welcome embed on member join
│   ├── utils/
│   │   ├── embeds.js             # Embed factory (success, error, warning, info, shift, setup, dev, modAction)
│   │   ├── database.js           # JSON persistence (warnings, shifts, config)
│   │   └── helpers.js            # Duration parsing/formatting, string truncation
│   └── data/                     # Auto-created JSON data files (gitignored)
│       ├── warnings.json
│       ├── shifts.json
│       └── config.json
├── index.js                      # Bot entry point — loads commands, events, logs in
├── deploy-commands.js            # Slash command deployment script
├── .env.example                  # Environment variable template
├── package.json
└── README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes with a descriptive message
4. Push to your fork and open a Pull Request

Please keep commands consistent with the existing embed design system and follow the `'use strict'` CommonJS module pattern used throughout the project.

---

## License

ISC

