'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to warn.').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the warning.').setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (target.id === interaction.user.id) {
      return interaction.reply({
        embeds: [embeds.error('You cannot warn yourself.', interaction.guild)],
        ephemeral: true,
      });
    }

    const warnings = db.addWarning(interaction.guild.id, target.id, {
      moderatorId: interaction.user.id,
      reason,
    });

    return interaction.reply({
      embeds: [
        embeds
          .modAction({
            action: 'Member Warned',
            emoji: '⚠️',
            target,
            moderator: interaction.user,
            reason,
            guild: interaction.guild,
          })
          .setColor(0xfee75c)
          .addFields({
            name: 'Total Warnings',
            value: `${warnings.length}`,
            inline: true,
          }),
      ],
    });
  },
};
