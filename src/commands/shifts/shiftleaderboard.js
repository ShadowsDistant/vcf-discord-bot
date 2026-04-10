'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');
const { PALETTE } = embeds;
const { hasShiftAccessRole } = require('../../utils/roles');

const MEDALS = ['', '', ''];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftleaderboard')
    .setDescription('View the shift time leaderboard for this server.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!hasShiftAccessRole(interaction.member)) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'You do not have the required role access to use shift commands.',
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const leaderboard = db.getShiftLeaderboard(interaction.guild.id);

    if (leaderboard.length === 0) {
      return interaction.reply({
        embeds: [
          embeds.info(
            '  Shift Leaderboard',
            'No completed shifts yet. Use `/startshift` to begin!',
            interaction.guild,
          ),
        ],
      });
    }

    const top = leaderboard.slice(0, 10);

    const rows = top.map((entry, i) => {
      const medal = MEDALS[i] ?? `**${i + 1}.**`;
      return `${medal}  <@${entry.userId}> — **${formatDuration(entry.totalMs)}** (${entry.shiftCount} shift${entry.shiftCount !== 1 ? 's' : ''})`;
    });

    const embed = new EmbedBuilder()
      .setColor(PALETTE.shift)
      .setTitle('  Shift Leaderboard')
      .setDescription(rows.join('\n'))
      .setTimestamp()
      .setFooter({
        text: `${leaderboard.length} staff member${leaderboard.length !== 1 ? 's' : ''} on record · ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    // Highlight the caller's rank if outside the top 10
    const callerRank = leaderboard.findIndex((e) => e.userId === interaction.user.id);
    if (callerRank >= 10) {
      const callerEntry = leaderboard[callerRank];
      embed.addFields({
        name: '  Your Rank',
        value: `#${callerRank + 1} — **${formatDuration(callerEntry.totalMs)}** (${callerEntry.shiftCount} shift${callerEntry.shiftCount !== 1 ? 's' : ''})`,
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
