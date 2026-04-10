'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration, makeProgressBar } = require('../../utils/helpers');
const { hasShiftAccessRole } = require('../../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shift-history')
    .setDescription("View a user's shift history.")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName('user').setDescription('The user to look up (defaults to you).'),
    ),

  async execute(interaction) {
    if (!hasShiftAccessRole(interaction.member)) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'You do not have the required role access to use shift commands.',
            interaction.guild,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const history = db.getUserShiftHistory(interaction.guild.id, target.id);
    const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);
    const config = db.getConfig(interaction.guild.id);
    const wave = db.getCurrentWave(interaction.guild.id);
    const quotaMs = config.quotaMs ?? 0;
    const waveTimeMs = wave ? db.getUserShiftTimeInWave(interaction.guild.id, target.id) : 0;
    const progressPct = quotaMs > 0 ? Math.min(100, (waveTimeMs / quotaMs) * 100) : null;

    const embed = embeds
      .shift(`  Shift History — ${target.tag}`, 'Shift history overview.', interaction.guild)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '  Completed Shifts', value: `${history.length}`, inline: true },
        { name: '⏱  Total Time', value: formatDuration(totalMs), inline: true },
      );

    if (wave && quotaMs > 0) {
      embed.addFields({
        name: `  Quota Progress (Wave #${wave.waveNumber})`,
        value: [
          `Completed: **${formatDuration(waveTimeMs)}**`,
          `Required: **${formatDuration(quotaMs)}**`,
          makeProgressBar(progressPct, 12),
        ].join('\n'),
      });
    }

    if (history.length > 0) {
      const lines = history
        .slice(-10)
        .reverse()
        .map((s) => {
          const ts = Math.floor(new Date(s.startedAt).getTime() / 1000);
          return `ID \`${s.id}\` · <t:${ts}:D> — **${formatDuration(s.durationMs)}**`;
        });
      embed.addFields({ name: '  Recent Shifts (last 10)', value: lines.join('\n') });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
