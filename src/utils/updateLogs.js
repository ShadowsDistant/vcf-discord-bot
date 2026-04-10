'use strict';

const { EmbedBuilder } = require('discord.js');
const { PALETTE } = require('./embeds');

const UPDATE_LOGS = [
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
  const titlePrefix = isLatest ? '📢 Latest Public Update' : '📜 Update Log';
  return new EmbedBuilder()
    .setColor(PALETTE.primary)
    .setTitle(`${titlePrefix} — ${entry.version}`)
    .setDescription(entry.changes.map((change) => `• ${change}`).join('\n'))
    .addFields(
      { name: 'Bot Version', value: `\`${currentBotVersion}\``, inline: true },
      { name: 'Log Version', value: `\`${entry.version}\``, inline: true },
      { name: 'Date', value: entry.date, inline: true },
    )
    .setTimestamp()
    .setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
}

module.exports = { UPDATE_LOGS, createUpdateEmbed };
