'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bakeadmin')
    .setDescription('Moderator baking economy controls.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!economy.isBakeAdminAuthorized(interaction.member, interaction.guild.id)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to use `/bakeadmin`.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [embeds.info('Bake Admin', 'Select a target user to open the admin panel.', interaction.guild)],
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`bakeadmin_target_select:${interaction.user.id}`)
            .setPlaceholder('Select target user')
            .setMinValues(1)
            .setMaxValues(1),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
