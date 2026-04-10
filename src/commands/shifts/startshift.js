'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('startshift')
    .setDescription('Clock in and start your shift.'),

  async execute(interaction) {
    const result = db.startShift(
      interaction.guild.id,
      interaction.user.id,
      interaction.user.tag,
    );

    if (!result) {
      return interaction.reply({
        embeds: [
          embeds.warning(
            "You're already on shift! Use `/endshift` to clock out first.",
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const startedTs = Math.floor(new Date(result.startedAt).getTime() / 1000);

    return interaction.reply({
      embeds: [
        embeds
          .shift(
            '🟢  Shift Started',
            `Welcome back, ${interaction.user}! Your shift has begun.\n\nUse \`/endshift\` when you're done.`,
            interaction.guild,
          )
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤  Staff Member', value: `${interaction.user}`, inline: true },
            { name: '🕐  Started At', value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`, inline: true },
          ),
      ],
    });
  },
};
