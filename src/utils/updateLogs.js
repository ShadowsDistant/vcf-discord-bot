'use strict';

const { EmbedBuilder } = require('discord.js');
const { PALETTE } = require('./embeds');

const UPDATE_LOGS = [
  {
    version: 'v1.4.0',
    date: '2026-04-18',
    changes: [
      'Expanded `/ai` review controls with persistent persona selection and per-user custom instructions (add/edit/clear), including safety + jailbreak checks before instruction saves.',
      'Made persona behavior consistent across turns/sessions (matching model persistence) and included active persona context in AI system/runtime handling.',
      'Improved AI safety/log observability: blocked interactions now log with explicit blocked safety rating, clearer severity/reason normalization, message jump links, and persona field in AI logs.',
      'Added new `/ai` tools for `view_server_events` (event-channel history) and `query_valley_mcp_docs` (Valley MCP docs lookup).',
      'Reworked `/giveaway` into `start`/`end`/`reroll` lifecycle with persistent giveaway records and automatic timer-based endings processed in background.',
      'Added automatic challenge-rotation checks + event announcements, plus bake-admin controls to force-rotate bakery/alliance challenges and add/take alliance points.',
    ],
  },
  {
    version: 'v1.3.1',
    date: '2026-04-14',
    changes: [
      'Removed AI assistant branding from `/ai` output defaults and command-facing wording.',
      'Removed `/ai` component collector timeout so response buttons/select menus persist instead of expiring.',
      'Rebalanced rank progression by lowering total-bakes requirements across rank tiers.',
      'Removed the VCF tag +5 manual-bake bonus.',
      'Adjusted alliance booster-member scaling to +1% CPS per booster member.',
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-04-13',
    changes: [
      'Expanded `/ai` with operational tooling for user profile lookups, bakery summaries, and bot server listing.',
      'Added native Discord AutoMod management tools in `/ai` (rule listing plus controlled create/toggle flows).',
      'Introduced mandatory two-step AI moderation confirmation (`prepare` + exact `CONFIRM MODERATION <token>` execution).',
      'Routed AI moderation execution through internal warning/DM/analytics paths and centralized moderation logging.',
      'Improved update-log embed presentation with clearer sections, numbering, and release metadata.',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-04-12',
    changes: [
      'Expanded /analytics with deeper trend metrics: active-day coverage, averages, top days, busiest hours, and channel-share insights.',
      'Rebuilt /alliance into a unified interactive panel with select-menu navigation, owner management actions, and an alliance-wide upgrade store.',
      'Added rotating weekly alliance challenge pool (30 variants), contributor leader tracking, completion rewards for all members, and alliance member DM notifications for challenge rewards and upgrade purchases.',
      'Added optional alliance approval-to-join flow with pending request review controls for alliance owners.',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-04-12',
    changes: [
      'Hardened persistence and interaction safety: atomic JSON updates, bake-again cooldown parity, bounded in-memory cleanup, and stronger bakery-name sanitization.',
      'Shipped server analytics, daily/weekly bakery challenges, and alliance foundations with persistent storage and leaderboard/challenge tracking.',
      'Added context menu workflows (Moderate User, View Profile, View Bakery, Report Message) and modernized admin flows with richer select menus.',
    ],
  },
  {
    version: 'v1.0.1',
    date: '2026-04-11',
    changes: [
      'Fixed burnt-cookie baking so burnt items are consistently tracked in inventory and item statistics.',
      'Removed bake-admin mod-role setter UI/action to keep bake-admin authorization fixed to the designated role.',
      'Standardized slash command deployment as global-only and removed single-server deployment configuration.',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-04-10',
    changes: [
      'Added Cookie Clicker Fandom-backed bake thumbnails with consistent small image sizing.',
      'Improved slash command reliability and user-facing command handling updates.',
      'Expanded moderation, utility, and shift quality-of-life improvements for public release.',
    ],
  },
  {
    version: 'v0.9.9',
    date: '2026-04-09',
    changes: [
      'Improved shift management reliability and history formatting.',
      'Refined moderation command output consistency.',
    ],
  },
  {
    version: 'v0.9.8',
    date: '2026-04-08',
    changes: [
      'Updated staff role mapping and department detection logic.',
      'Stabilized role-based command visibility handling.',
    ],
  },
  {
    version: 'v0.9.7',
    date: '2026-04-07',
    changes: [
      'Improved warning and infraction response formatting.',
      'Minor stability fixes across utility commands.',
    ],
  },
  {
    version: 'v0.9.6',
    date: '2026-04-06',
    changes: [
      'Expanded shift wave summary formatting and ranking presentation.',
      'Improved internal command loading safeguards.',
    ],
  },
  {
    version: 'v0.9.5',
    date: '2026-04-05',
    changes: [
      'Added improved embeds for moderation and shift workflows.',
      'General bug fixes and data consistency improvements.',
    ],
  },
  {
    version: 'v0.9.4',
    date: '2026-04-04',
    changes: [
      'Refined slash command response patterns for better readability.',
      'Improved error handling in interaction event processing.',
    ],
  },
  {
    version: 'v0.9.3',
    date: '2026-04-03',
    changes: [
      'Adjusted role checks for moderation-adjacent commands.',
      'Improved shift command informational responses.',
    ],
  },
  {
    version: 'v0.9.2',
    date: '2026-04-02',
    changes: [
      'Improved command help categorization and filtering logic.',
      'Minor UX adjustments in utility embeds.',
    ],
  },
  {
    version: 'v0.9.1',
    date: '2026-04-01',
    changes: [
      'Added internal quality-of-life improvements for command handling.',
      'Improved role utility helpers and constants organization.',
    ],
  },
  {
    version: 'v0.9.0',
    date: '2026-03-31',
    changes: [
      'Baseline public release of moderation, utility, and shift systems.',
      'Established structured data persistence for bot features.',
    ],
  },
];

function createUpdateEmbed(guild, currentBotVersion, entry, index = 0) {
  const isLatest = index === 0;
  const titlePrefix = isLatest ? '📢 Latest Public Update' : '📜 Public Update Log';
  const changeLines = (entry?.changes ?? []).map((change, idx) => `${idx + 1}. ${change}`);
  const sectionTitle = isLatest ? '### Highlights' : '### Changes';
  return new EmbedBuilder()
    .setColor(PALETTE.primary)
    .setTitle(`${titlePrefix} — ${entry.version}`)
    .setDescription([sectionTitle, ...changeLines].join('\n'))
    .addFields(
      { name: 'Bot Version', value: `\`${currentBotVersion}\``, inline: true },
      { name: 'Log Version', value: `\`${entry.version}\``, inline: true },
      { name: 'Release Date', value: entry.date, inline: true },
      { name: 'Entry', value: `#${index + 1} of ${UPDATE_LOGS.length}`, inline: true },
      { name: 'Changes', value: `${changeLines.length}`, inline: true },
    )
    .setTimestamp()
    .setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
}

module.exports = { UPDATE_LOGS, createUpdateEmbed };
