'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');
const { PALETTE } = embeds;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftlog')
    .setDescription("View shift logs for a user or see all active shifts.")
    .addSubcommand((s) =>
      s
        .setName('active')
        .setDescription('See all currently active shifts in this server.'),
    )
    .addSubcommand((s) =>
      s
        .setName('user')
        .setDescription("View a user's shift history.")
        .addUserOption((o) =>
          o.setName('user').setDescription('The user to look up (defaults to you).'),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'active') {
      const active = db.getAllActiveShifts(interaction.guild.id);

      if (active.length === 0) {
        return interaction.reply({
          embeds: [embeds.info('🟡  Active Shifts', 'There are no active shifts right now.', interaction.guild)],
        });
      }

      const embed = new EmbedBuilder()
        .setColor(PALETTE.shift)
        .setTitle(`🟢  Active Shifts (${active.length})`)
        .setTimestamp()
        .setFooter({
          text: interaction.guild.name,
          iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
        });

      for (const s of active) {
        const startedTs = Math.floor(new Date(s.startedAt).getTime() / 1000);
        const elapsedMs = Date.now() - new Date(s.startedAt).getTime();
        embed.addFields({
          name: s.username,
          value: `Started <t:${startedTs}:R> · Elapsed: **${formatDuration(elapsedMs)}**`,
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // sub === 'user'
    const target = interaction.options.getUser('user') ?? interaction.user;
    const activeShift = db.getActiveShift(interaction.guild.id, target.id);
    const history = db.getUserShiftHistory(interaction.guild.id, target.id);
    const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);

    const embed = new EmbedBuilder()
      .setColor(PALETTE.shift)
      .setTitle(`📋  Shift Log — ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '📊  Statistics',
          value: [
            `Completed Shifts: **${history.length}**`,
            `Total Time: **${formatDuration(totalMs)}**`,
            `Status: ${activeShift ? '🟢 **On Shift**' : '🔴 **Off Shift**'}`,
          ].join('\n'),
        },
      )
      .setTimestamp()
      .setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    if (activeShift) {
      const startedTs = Math.floor(new Date(activeShift.startedAt).getTime() / 1000);
      embed.addFields({
        name: '🟢  Current Shift',
        value: `Started <t:${startedTs}:R> (<t:${startedTs}:T>)`,
      });
    }

    // Show last 5 completed shifts
    if (history.length > 0) {
      const recent = history.slice(-5).reverse();
      const historyLines = recent.map((s) => {
        const ts = Math.floor(new Date(s.startedAt).getTime() / 1000);
        return `<t:${ts}:D> — **${formatDuration(s.durationMs)}**`;
      });
      embed.addFields({
        name: '🕐  Recent Shifts (last 5)',
        value: historyLines.join('\n'),
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
