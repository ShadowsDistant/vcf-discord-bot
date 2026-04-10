'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');
const { PALETTE } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftwave')
    .setDescription('Manage shift wave periods (quota tracking windows).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a new wave period. Resets wave-based quota tracking.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End the current wave, DM all staff their wave summary, and start a new one.'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('View the current wave status and leaderboard.'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;
    const config = db.getConfig(guild.id);

    if (sub === 'start') {
      const existingWave = db.getCurrentWave(guild.id);
      if (existingWave) {
        return interaction.reply({
          embeds: [
            embeds
              .warning(
                `A wave is already in progress (Wave #${existingWave.waveNumber}).\nUse \`/shiftwave end\` to close it first.`,
                guild,
              ),
          ],
          ephemeral: true,
        });
      }

      const wave = db.startWave(guild.id, interaction.user.id);
      const startedTs = Math.floor(new Date(wave.startedAt).getTime() / 1000);

      return interaction.reply({
        embeds: [
          embeds
            .setup(`🌊  Wave #${wave.waveNumber} Started`, 'A new shift wave period has begun!', guild)
            .addFields(
              { name: '🔢  Wave Number', value: `\`#${wave.waveNumber}\``, inline: true },
              { name: '📅  Started At', value: `<t:${startedTs}:F>`, inline: true },
              { name: '👤  Started By', value: `${interaction.user}`, inline: true },
            ),
        ],
      });
    }

    if (sub === 'end') {
      const wave = db.getCurrentWave(guild.id);
      if (!wave) {
        return interaction.reply({
          embeds: [embeds.warning('No wave is currently active. Use `/shiftwave start` to begin one.', guild)],
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const waveStartTs = Math.floor(new Date(wave.startedAt).getTime() / 1000);
      const waveEndTs = Math.floor(Date.now() / 1000);
      const waveDurationMs = Date.now() - new Date(wave.startedAt).getTime();

      // Gather all shifts in this wave
      const waveShifts = db.getShiftsInCurrentWave(guild.id);

      // Aggregate per user
      const userTotals = {};
      for (const s of waveShifts) {
        if (!userTotals[s.userId]) {
          userTotals[s.userId] = { userId: s.userId, username: s.username, totalMs: 0, shiftCount: 0 };
        }
        userTotals[s.userId].totalMs += s.durationMs;
        userTotals[s.userId].shiftCount += 1;
      }

      const sortedUsers = Object.values(userTotals).sort((a, b) => b.totalMs - a.totalMs);
      const quotaMs = config.quotaMs ?? 0;
      const metQuota = sortedUsers.filter((u) => u.totalMs >= quotaMs);
      const missedQuota = sortedUsers.filter((u) => u.totalMs < quotaMs);

      // Build the channel summary embed
      const summaryEmbed = new EmbedBuilder()
        .setColor(PALETTE.setup)
        .setTitle(`🏁  Wave #${wave.waveNumber} Closed`)
        .setDescription(
          `The wave period has ended.\n**Period:** <t:${waveStartTs}:D> → <t:${waveEndTs}:D> (${formatDuration(waveDurationMs)})`,
        )
        .addFields(
          { name: '👥  Participants', value: `${sortedUsers.length}`, inline: true },
          { name: '✅  Met Quota', value: `${metQuota.length}`, inline: true },
          { name: '❌  Missed Quota', value: `${missedQuota.length}`, inline: true },
        )
        .setTimestamp()
        .setFooter({
          text: guild.name,
          iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
        });

      if (sortedUsers.length > 0) {
        const top = sortedUsers.slice(0, 10);
        const MEDALS = ['🥇', '🥈', '🥉'];
        summaryEmbed.addFields({
          name: '🏆  Wave Leaderboard',
          value: top
            .map((u, i) => {
              const medal = MEDALS[i] ?? `**${i + 1}.**`;
              const quotaCheck = quotaMs > 0 ? (u.totalMs >= quotaMs ? ' ✅' : ' ❌') : '';
              return `${medal}  <@${u.userId}> — **${formatDuration(u.totalMs)}** (${u.shiftCount} shift${u.shiftCount !== 1 ? 's' : ''})${quotaCheck}`;
            })
            .join('\n'),
        });
      }

      await interaction.editReply({ embeds: [summaryEmbed] });

      // ── DM every staff member who had a shift in this wave ──────────────────
      let dmsSent = 0;
      for (const u of sortedUsers) {
        const pct = quotaMs > 0 ? Math.min(100, Math.round((u.totalMs / quotaMs) * 100)) : null;
        const metQ = quotaMs > 0 ? u.totalMs >= quotaMs : null;

        const dmEmbed = new EmbedBuilder()
          .setColor(metQ === false ? PALETTE.error : PALETTE.shift)
          .setTitle(`🏁  Wave #${wave.waveNumber} — Your Summary`)
          .setDescription(`The shift wave at **${guild.name}** has ended.`)
          .setThumbnail(guild.iconURL({ dynamic: true }) ?? null)
          .addFields(
            { name: '🌊  Wave', value: `#${wave.waveNumber}`, inline: true },
            { name: '⏱️  Your Time', value: formatDuration(u.totalMs), inline: true },
            { name: '📋  Your Shifts', value: `${u.shiftCount}`, inline: true },
            { name: '📅  Period', value: `<t:${waveStartTs}:D> → <t:${waveEndTs}:D>`, inline: false },
          )
          .setTimestamp();

        if (quotaMs > 0) {
          dmEmbed.addFields({
            name: metQ ? '✅  Quota Status' : '❌  Quota Status',
            value: [
              `Required: **${formatDuration(quotaMs)}**`,
              `Completed: **${formatDuration(u.totalMs)}**`,
              `Progress: **${pct}%**`,
              metQ ? '> You have **met** the quota for this wave!' : '> You have **not met** the quota for this wave.',
            ].join('\n'),
          });
        }

        // Try to fetch and DM the user
        const discordUser = await guild.client.users.fetch(u.userId).catch(() => null);
        if (discordUser) {
          const sent = await discordUser.send({ embeds: [dmEmbed] }).catch(() => null);
          if (sent) dmsSent++;
        }
      }

      // Start the next wave automatically
      const newWave = db.startWave(guild.id, interaction.user.id);

      await interaction.followUp({
        embeds: [
          embeds
            .success(
              `Wave #${wave.waveNumber} has been closed.\n📨 Sent summaries to **${dmsSent}** staff member${dmsSent !== 1 ? 's' : ''}.\n🌊 Wave **#${newWave.waveNumber}** has started automatically.`,
              guild,
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'status') {
      const wave = db.getCurrentWave(guild.id);

      if (!wave) {
        return interaction.reply({
          embeds: [
            embeds.info(
              '🌊  No Active Wave',
              'No wave is currently running. Use `/shiftwave start` to begin one.',
              guild,
            ),
          ],
          ephemeral: true,
        });
      }

      const startedTs = Math.floor(new Date(wave.startedAt).getTime() / 1000);
      const elapsedMs = Date.now() - new Date(wave.startedAt).getTime();

      const waveShifts = db.getShiftsInCurrentWave(guild.id);
      const userTotals = {};
      for (const s of waveShifts) {
        if (!userTotals[s.userId]) {
          userTotals[s.userId] = { userId: s.userId, totalMs: 0, shiftCount: 0 };
        }
        userTotals[s.userId].totalMs += s.durationMs;
        userTotals[s.userId].shiftCount += 1;
      }

      const sorted = Object.values(userTotals).sort((a, b) => b.totalMs - a.totalMs);
      const quotaMs = config.quotaMs ?? 0;
      const metQuota = sorted.filter((u) => u.totalMs >= quotaMs).length;

      const MEDALS = ['🥇', '🥈', '🥉'];
      const leaderboardLines = sorted.slice(0, 10).map((u, i) => {
        const medal = MEDALS[i] ?? `**${i + 1}.**`;
        const check = quotaMs > 0 ? (u.totalMs >= quotaMs ? ' ✅' : ' ❌') : '';
        return `${medal}  <@${u.userId}> — **${formatDuration(u.totalMs)}**${check}`;
      });

      const embed = embeds
        .setup(`🌊  Wave #${wave.waveNumber} Status`, 'Current wave progress.', guild)
        .addFields(
          { name: '📅  Started', value: `<t:${startedTs}:F>`, inline: true },
          { name: '⏱️  Elapsed', value: formatDuration(elapsedMs), inline: true },
          { name: '👥  Participants', value: `${sorted.length}`, inline: true },
        );

      if (quotaMs > 0) {
        embed.addFields({
          name: '⏱️  Quota',
          value: `Required: **${formatDuration(quotaMs)}** — Met by **${metQuota}** / ${sorted.length} staff`,
          inline: false,
        });
      }

      if (leaderboardLines.length > 0) {
        embed.addFields({ name: '🏆  Leaderboard (Wave)', value: leaderboardLines.join('\n') });
      } else {
        embed.addFields({ name: '🏆  Leaderboard', value: 'No completed shifts in this wave yet.' });
      }

      return interaction.reply({ embeds: [embed] });
    }
  },
};
