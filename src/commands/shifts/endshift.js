'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');

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

    // Calculate total time across all completed shifts
    const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
    const totalMs = history.reduce((sum, s) => sum + s.durationMs, 0);

    return interaction.reply({
      embeds: [
        embeds
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
          ),
      ],
    });
  },
};
