'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../utils/bakeEconomy');
const embeds = require('../../utils/embeds');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cookieleaderboard')
    .setDescription('View the special cookie leaderboard for this server.'),

  async execute(interaction) {
    const leaderboard = economy.getSpecialCookieLeaderboard(interaction.guild.id);
    const cookieEmoji = economy.getCookieEmoji(interaction.guild);

    if (leaderboard.length === 0) {
      return interaction.reply({
        embeds: [
          embeds.info(
            `${cookieEmoji}  Special Cookie Leaderboard`,
            'No special cookies have been baked yet.',
            interaction.guild,
          ),
        ],
      });
    }

    const top = leaderboard.slice(0, 10);
    const lines = top.map((entry, index) => {
      const rank = MEDALS[index] ?? `**${index + 1}.**`;
      const breakdown = `Perfect: ${entry.counts.perfect} • Gold: ${entry.counts.gold} • Spoopier: ${entry.counts.spoopier}`;
      return `${rank} <@${entry.userId}> — **${economy.toCookieNumber(entry.total)}** total\n${breakdown}`;
    });

    const embed = new EmbedBuilder()
      .setColor(embeds.PALETTE.primary)
      .setTitle(`${cookieEmoji}  Special Cookie Leaderboard`)
      .setDescription(lines.join('\n\n'))
      .setTimestamp()
      .setFooter({
        text: `${leaderboard.length} baker${leaderboard.length === 1 ? '' : 's'} tracked · ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    const callerRank = leaderboard.findIndex((entry) => entry.userId === interaction.user.id);
    if (callerRank >= 10) {
      const caller = leaderboard[callerRank];
      embed.addFields({
        name: 'Your Rank',
        value: `#${callerRank + 1} — **${economy.toCookieNumber(caller.total)}** total (Perfect: ${caller.counts.perfect} • Gold: ${caller.counts.gold} • Spoopier: ${caller.counts.spoopier})`,
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
