'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');
const { PALETTE } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('endshift')
    .setDescription('Clock out and end your current shift.'),

  async execute(interaction) {
    const record = db.endShift(interaction.guild.id, interaction.user.id);

    if (!record) {
      return interaction.reply({
        embeds: [
          embeds.warning(
            "You're not currently on shift! Use `/startshift` to clock in.",
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const startedTs = Math.floor(new Date(record.startedAt).getTime() / 1000);
    const endedTs = Math.floor(new Date(record.endedAt).getTime() / 1000);

    // Totals across all completed shifts
    const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
    const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);

    // Wave totals
    const waveTimeMs = db.getUserShiftTimeInWave(interaction.guild.id, interaction.user.id);
    const wave = db.getCurrentWave(interaction.guild.id);

    const shiftEmbed = embeds
      .shift(
        '🔴  Shift Ended',
        `Thanks for your work, ${interaction.user}! Great job today.`,
        interaction.guild,
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤  Staff Member', value: `${interaction.user}`, inline: true },
        { name: '🕐  Duration', value: formatDuration(record.durationMs), inline: true },
        { name: '📅  Started', value: `<t:${startedTs}:T>`, inline: true },
        { name: '📅  Ended', value: `<t:${endedTs}:T>`, inline: true },
        { name: '⏱️  Total Time on Record', value: formatDuration(totalMs), inline: true },
        { name: '📋  Total Shifts', value: `${history.length}`, inline: true },
      );

    if (wave) {
      shiftEmbed.addFields({
        name: `📊  Wave #${wave.waveNumber} Time`,
        value: formatDuration(waveTimeMs),
        inline: true,
      });
    }

    await interaction.reply({ embeds: [shiftEmbed] });

    const config = db.getConfig(interaction.guild.id);

    // ── Quota notification ────────────────────────────────────────────────────
    if (config.quotaMs && config.quotaNotifChannelId) {
      const quotaMs = config.quotaMs;
      // Check if user just crossed the quota threshold in this wave
      const prevWaveTimeMs = waveTimeMs - record.durationMs;
      const metQuotaThisShift = prevWaveTimeMs < quotaMs && waveTimeMs >= quotaMs;

      if (metQuotaThisShift) {
        const notifChannel = interaction.guild.channels.cache.get(config.quotaNotifChannelId);
        if (notifChannel) {
          const notifEmbed = new EmbedBuilder()
            .setColor(PALETTE.success)
            .setTitle('✅  Quota Met!')
            .setDescription(`${interaction.user} has met the shift quota for this wave!`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: '👤  Staff Member', value: `${interaction.user}`, inline: true },
              { name: '⏱️  Required', value: formatDuration(quotaMs), inline: true },
              { name: '✅  Completed', value: formatDuration(waveTimeMs), inline: true },
              ...(wave ? [{ name: '🌊  Wave', value: `#${wave.waveNumber}`, inline: true }] : []),
            )
            .setTimestamp()
            .setFooter({
              text: interaction.guild.name,
              iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
            });
          await notifChannel.send({ embeds: [notifEmbed] }).catch(() => null);
        }
      }
    }

    // ── DM the user ───────────────────────────────────────────────────────────
    if (config.shiftDmsEnabled) {
      const recentShifts = history.slice(-5).reverse();
      const recentLines = recentShifts
        .map((s) => {
          const ts = Math.floor(new Date(s.startedAt).getTime() / 1000);
          return `<t:${ts}:D> — **${formatDuration(s.durationMs)}**`;
        })
        .join('\n');

      const dmEmbed = new EmbedBuilder()
        .setColor(PALETTE.shift)
        .setTitle('🔴  Shift Ended — Summary')
        .setDescription(`Your shift at **${interaction.guild.name}** has ended.`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }) ?? null)
        .addFields(
          { name: '🏠  Server', value: interaction.guild.name, inline: true },
          { name: '🕐  Duration', value: formatDuration(record.durationMs), inline: true },
          { name: '📅  Started', value: `<t:${startedTs}:T>`, inline: true },
          { name: '📅  Ended', value: `<t:${endedTs}:T>`, inline: true },
          { name: '📊  All-Time Total', value: formatDuration(totalMs), inline: true },
          { name: '📋  Total Shifts', value: `${history.length}`, inline: true },
        )
        .setTimestamp();

      if (wave) {
        const quotaMs = config.quotaMs ?? 0;
        const pct = quotaMs > 0 ? Math.min(100, Math.round((waveTimeMs / quotaMs) * 100)) : null;
        dmEmbed.addFields({
          name: `🌊  Wave #${wave.waveNumber} Progress`,
          value: [
            `Time: **${formatDuration(waveTimeMs)}**`,
            quotaMs > 0 ? `Required: **${formatDuration(quotaMs)}**` : null,
            pct !== null ? `Progress: **${pct}%**${pct >= 100 ? ' ✅' : ''}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          inline: false,
        });
      }

      if (recentLines) {
        dmEmbed.addFields({ name: '🕐  Recent Shifts (last 5)', value: recentLines });
      }

      await interaction.user.send({ embeds: [dmEmbed] }).catch(() => null);
    }
  },
};
