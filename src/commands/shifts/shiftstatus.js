'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');
const { hasShiftAccessRole } = require('../../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftstatus')
    .setDescription("View a user's current shift status.")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName('user').setDescription('The user to check (defaults to you).'),
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
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const active = db.getActiveShift(interaction.guild.id, target.id);

    if (!active) {
      return interaction.reply({
        embeds: [
          embeds.info(
            '  Shift Status',
            `${target} is currently **off shift**.`,
            interaction.guild,
          ),
        ],
      });
    }

    const startedTs = Math.floor(new Date(active.startedAt).getTime() / 1000);
    const elapsedMs = Date.now() - new Date(active.startedAt).getTime();

    return interaction.reply({
      embeds: [
        embeds
          .shift('  Shift Status', `${target} is currently **on shift**.`, interaction.guild)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '  Started', value: `<t:${startedTs}:F>`, inline: true },
            { name: '⏱  Elapsed', value: formatDuration(elapsedMs), inline: true },
          ),
      ],
    });
  },
};
