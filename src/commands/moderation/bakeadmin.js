'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const economy = require('../../utils/bakeEconomy');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bakeadmin')
    .setDescription('Moderator baking economy controls.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You need to be a **Moderator** or above to use `/bakeadmin`.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

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
