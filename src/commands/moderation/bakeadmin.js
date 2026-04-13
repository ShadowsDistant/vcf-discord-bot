'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
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

    const dashboardEmbed = economy.buildBakeAdminDashboardEmbed(interaction.guild, interaction.user.id);
    const dashboardComponents = economy.buildBakeAdminDashboardComponents(interaction.user.id);
    return interaction.reply({
      embeds: [dashboardEmbed],
      components: dashboardComponents,
      flags: MessageFlags.Ephemeral,
    });
  },
};
