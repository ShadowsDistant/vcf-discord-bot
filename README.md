# vcf-discord-bot

A modern, feature-rich Discord bot built with **discord.js v14** featuring advanced moderation, utility commands, a Melonly-style staff shift system, server setup commands, and restricted developer tools. All responses use rich, consistently-styled embeds with colour-coded feedback.

---

## Table of Contents

- [Features Overview](#features-overview)
- [Command Reference](#command-reference)
  - [Moderation](#moderation)
  - [Utility](#utility)
  - [Shifts](#shifts)
  - [Setup](#setup)
  - [Developer](#developer)
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
| **Moderation** | Ban, kick, timeout, warn system, purge, lock/unlock channels, slowmode, role management — with optional mod-role permission levels |
| **Utility** | Ping, userinfo, serverinfo, avatar, botinfo, help, updates, analytics, daily, alliance |
| **Shifts** | Clock-in/out, staff-role gate, shift history, wave period tracking, quota requirements, DMs on start/end, wave-end mass DM |
| **Setup** | Admin-only server configuration (mod logs, welcome, staff roles, mod permission levels, quota, shift DMs, AutoMod) |
| **Reasons** | Per-server preset ban/kick/warn reasons with autocomplete in mod commands |
| **Developer** | Set bot presence, list guilds, broadcast announcements |
| **Embeds** | Colour-coded, titled embeds for all responses; welcome message on member join; quota notifications |

---

## Command Reference

### Moderation

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

#### `/updates`
View the latest public release notes and browse previous update logs from an interactive selector.

Shows: current bot version, latest log version/date, and recent public changes.

---

#### `/analytics`
View server analytics for a selectable period (`24h`, `7d`, `30d`), including joins/leaves, message totals, moderation action counts, top channels, peak active hour, active-day coverage, averages, top message days, and busiest hours.

> Staff-facing command (runtime moderation checks still apply).

---

#### `/daily`
View rotating daily/weekly bakery challenges and optionally claim completed rewards.

| Option | Type | Required | Description |
|---|---|---|---|
| `claim` | Boolean | ❌ | Claim any currently completed challenge rewards |

---

#### `/alliance`
Open a unified alliance panel with select-menu navigation and action buttons.

Panel features include:
- Create/join/leave alliances
- Weekly rotating challenge tracking with progress bars and top contributors
- Completion rewards distributed to all alliance members
- Alliance management (rename, transfer ownership, remove members)
- Approval-to-join mode with pending request review
- Alliance store upgrades that affect all members
- Alliance leaderboard view

---

#### Context Menu Commands
Right-click (Apps) command support includes:
- **Moderate User** (user context)
- **View Profile** (user context)
- **View Bakery** (user context)
- **Report Message** (message context)

These are designed for quick moderation/profile workflows without typing slash commands.
`Report Message` includes a clear warning that false reports can lead to punishment and enforces a 15-minute cooldown between submissions.

---

#### `/announce`
Send a custom rich embed announcement to a selected text channel.

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Text/Announcement Channel | ✅ | Channel to post the announcement in |
| `title` | String | ✅ | Title of the announcement embed |
| `message` | String | ✅ | Body text of the announcement |
| `color` | Choice | ❌ | Embed accent colour: `Blue` (default), `Green`, `Red`, `Yellow`, `Purple` |

> Restricted to **Management**.

---

#### `/say`
Send a plain-text bot message (no embed) to the current channel or a selected channel.

| Option | Type | Required | Description |
|---|---|---|---|
| `text` | String | ✅ | The text to send |
| `channel` | Text/Announcement Channel | ❌ | Optional target channel (defaults to current channel) |

> Restricted to **Management**.

---

### 🕐 Shifts

The shift system allows staff members to clock in and out, tracking their on-duty time persistently per server. Staff-role restrictions, shift DMs, wave periods, and quota requirements are all configurable via `/setup`.

---

#### `/startshift`
Clock in and begin your shift. Records your start time.

> Returns a warning if you are already on an active shift.  
> If staff roles are configured, only users with a staff role may clock in.  
> If shift DMs are enabled, the user receives a DM with clock-in details.

---

#### `/endshift`
Clock out and end your current shift. Displays:
- Shift duration
- Start and end timestamps
- Cumulative total time
- Current wave time (if a wave is active)

If shift DMs are enabled, the user receives a detailed DM summary including recent shift history and wave quota progress.  
If a quota is configured and the user just met it this shift, a notification is sent to the quota notification channel.

---

#### `/shiftwave start`
Start a new wave period (**Administrator** only). Quota tracking resets to this point in time.

#### `/shiftwave end`
Close the current wave (**Administrator** only). The bot:
1. Posts a summary embed to the channel with a wave leaderboard and quota pass/fail counts
2. DMs every staff member who had a shift in the wave with their personal summary and quota status
3. Automatically starts Wave N+1

#### `/shiftwave status`
View the current wave number, elapsed time, participant count, and live leaderboard.

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
View the top 10 staff members ranked by all-time shift time. If you are outside the top 10, your personal rank is appended below.

---

### Setup

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

**Example custom message:** `Hey {user}, welcome to {server}! Read the rules in #rules.`

---

#### `/setup removewelcome`
Disable welcome messages for this server.

---

#### `/setup removelogs`
Disable mod-log messages for this server.

---

#### `/setup view`
View the full bot configuration for this server: mod log, welcome, shift DMs, staff roles, mod roles, and quota settings.

---

#### `/setup staffroles add <role>`
Allow a role to use the shift system (`/startshift` / `/endshift`).

| Option | Type | Required | Description |
|---|---|---|---|
| `role` | Role | ✅ | The role to add as a staff role |

#### `/setup staffroles remove <role>`
Remove a role from the staff-roles list.

#### `/setup staffroles list`
List all configured staff roles.

> If no staff roles are configured, the shift system is accessible to everyone.

---

#### `/setup modroles set <level> <role>`
Assign a Discord role to a moderation permission level.

| Option | Type | Required | Description |
|---|---|---|---|
| `level` | Choice | ✅ | `Moderator`, `Senior Moderator`, or `Moderation Leadership` |
| `role` | Role | ✅ | The role to assign |

Permission hierarchy:
- **Moderator** — warn, kick, timeout, lock/unlock, slowmode, purge
- **Senior Moderator** — ban, unban + all Moderator commands
- **Moderation Leadership** — all commands

When mod roles are configured, users must hold the appropriate role (or higher) to use commands. Higher roles always satisfy lower-level checks.

#### `/setup modroles clear <level>`
Remove the role assignment for a moderation level.

#### `/setup modroles view`
View the current mod-role assignments.

---

#### `/automod toggle <enabled>`
Enable or disable the AutoMod system for the server.

#### `/automod category <category> <enabled>`
Toggle a specific AutoMod category.

#### `/automod punishment <preset> [timeout_duration]`
Configure the AutoMod punishment (`delete`, `delete_timeout`, `delete_kick`, `timeout`).

#### `/automod logchannel <channel>`
Set the channel used for AutoMod action logs.

#### `/automod exemptrole <role> <add>`
Add or remove role-based AutoMod exemptions.

#### `/automod status`
View AutoMod configuration and category status.

AutoMod now includes stronger bypass detection and expanded policy categories:
- Targeted profanity and abuse
- Slurs and hate speech
- Explicit sexual content
- Threats, blackmail, and doxxing signals
- Malicious/obfuscated invite and advertising patterns
- Classified information disclosure signals
- Political agitation signals

To reduce false positives, general profanity is disabled by default and can be enabled explicitly via `/automod category`.

---

#### `/setup quota set <hours> [period]`
Set the minimum required shift time per wave period.

| Option | Type | Required | Description |
|---|---|---|---|
| `hours` | Integer (1–168) | ✅ | Required hours per wave |
| `period` | Choice | ❌ | `Weekly`, `Bi-weekly`, or `Monthly` (label only) |

#### `/setup quota notify <channel>`
Set the text channel where quota-completion notifications are posted.

#### `/setup quota disable`
Disable quota requirements.

#### `/setup quota view`
View the current quota configuration.

---

#### `/setup shiftdm <enabled>`
Toggle whether the bot DMs staff members when they clock in or out.

| Option | Type | Required | Description |
|---|---|---|---|
| `enabled` | Boolean | ✅ | `true` = send DMs, `false` = no DMs |

---

### Developer

Developer commands are restricted to the user whose ID is set in the `DEV_USER_ID` environment variable. Any other user will receive an ephemeral error embed.

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

#### `/ai`
Query AI via NVIDIA Build API (`openai/gpt-oss-120b`) and return the result in a structured embed.

| Option | Type | Required | Description |
|---|---|---|---|
| `prompt` | String | ✅ | Prompt sent to the AI model |

Supports a broad set of safe read-only tools (server overview, features, channels, roles, members, emojis, web search, and Valley Correctional MCP docs lookup) for context-aware responses.
`/ai` returns a final structured embed (no streaming updates) with stable formatting.
The response includes an always-available **Review** button that opens diagnostics (tools used, TTFT, token usage, timing, and rounds), and the AI can add link buttons to the embed when useful.
Replies to AI messages continue the same conversation context.
Access is restricted to the configured developer user IDs plus hardcoded allow-list users.

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

# Optional — deploy commands to one guild for immediate updates while developing
GUILD_ID=your_server_id

# Optional — Discord user ID allowed to use developer commands
# Defaults to the bot owner ID if not set
DEV_USER_ID=your_discord_user_id

# Optional — NVIDIA Build AI API key used by /ai
NVIDIA_API_KEY=your_nvidia_api_key
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Your bot's secret token from the Developer Portal |
| `CLIENT_ID` | ✅ | Your application's client/application ID |
| `GUILD_ID` | ❌ | If set, deploys commands to that guild (fast propagation for testing) instead of global |
| `REQUIRED_BAKE_COMMANDS` | ❌ | Comma-separated slash command names required by deploy validation (e.g. `bake,bakery,marketplace,bakeadmin`) |
| `DEV_USER_ID` | ❌ | Discord user ID(s) permitted to use dev commands (comma-separated supported) |
| `NVIDIA_API_KEY` | ❌ | NVIDIA Build API key used by `/ai` via `https://integrate.api.nvidia.com/v1` |

> ⚠️ **Never commit your `.env` file.** It is listed in `.gitignore` by default.

### Deploying Slash Commands

You must deploy slash commands before they appear in Discord. Run:

```bash
npm run deploy
```

- By default, commands are registered globally and may take up to **1 hour** to propagate to all servers.
- For immediate updates while testing, set `GUILD_ID` in `.env` and run `npm run deploy` again to deploy to only that guild.
- Deployment also clears legacy guild-scoped command registrations to prevent old slash commands from lingering.
- Optional `REQUIRED_BAKE_COMMANDS` can enforce that specific command names exist before deployment succeeds.

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
| `config.json` | Per-guild bot configuration (log channel, welcome channel/message, staff roles, mod roles, quota, shift DM toggle) |
| `reasons.json` | Per-guild preset ban/kick/warn reasons |
| `waves.json` | Per-guild wave tracking (current wave number, start date) |

All reads and writes go through `src/utils/database.js` which provides a simple key/value interface on top of the JSON files.

---

## Project Structure

```
vcf-discord-bot/
├── src/
│   ├── commands/
│   │   ├── moderation/
│   │   │   ├── ban.js            # /ban (autocomplete reasons, mod-role check)
│   │   │   ├── unban.js          # /unban
│   │   │   ├── kick.js           # /kick (autocomplete reasons, mod-role check)
│   │   │   ├── timeout.js        # /timeout (mod-role check)
│   │   │   ├── untimeout.js      # /untimeout
│   │   │   ├── warn.js           # /warn (autocomplete reasons, mod-role check)
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
│   │   │   ├── announce.js       # /announce (management only)
│   │   │   ├── say.js            # /say (management only, plain text)
│   │   │   └── help.js           # /help
│   │   ├── shifts/
│   │   │   ├── startshift.js     # /startshift (staff-role gate, DM on start)
│   │   │   ├── endshift.js       # /endshift (DM on end, quota notification)
│   │   │   ├── shiftwave.js      # /shiftwave start|end|status
│   │   │   ├── shiftlog.js       # /shiftlog active|user
│   │   │   └── shiftleaderboard.js # /shiftleaderboard
│   │   ├── setup/
│   │   │   ├── setup.js          # /setup logs|welcome|removewelcome|removelogs|view|shiftdm
│   │   │   │                     #         staffroles add|remove|list
│   │   │   │                     #         modroles set|clear|view
│   │   │   │                     #         quota set|notify|disable|view
│   │   │   └── reasons.js        # /reasons add|remove|list
│   │   └── dev/
│   │       ├── setstatus.js      # /setstatus  (dev only)
│   │       └── servers.js        # /servers    (dev only)
│   ├── events/
│   │   ├── ready.js              # Sets initial presence on login
│   │   ├── interactionCreate.js  # Routes slash commands + autocomplete handler
│   │   └── guildMemberAdd.js     # Sends welcome embed on member join
│   ├── utils/
│   │   ├── embeds.js             # Embed factory (success, error, warning, info, shift, setup, dev, modAction)
│   │   ├── database.js           # JSON persistence (warnings, shifts, config, reasons, waves)
│   │   ├── permissions.js        # hasModLevel() — mod-role permission checking utility
│   │   └── helpers.js            # Duration parsing/formatting, string truncation
│   └── data/                     # Auto-created JSON data files (gitignored)
│       ├── warnings.json
│       ├── shifts.json
│       ├── config.json
│       ├── reasons.json
│       └── waves.json
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
