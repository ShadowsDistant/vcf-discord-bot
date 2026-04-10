'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embeds = require('../../utils/embeds');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bakeadmin')
    .setDescription('Moderator baking economy controls.')
    .addUserOption((option) =>
      option
        .setName('target')
        .setDescription('Target user for admin actions (defaults to yourself).')
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!economy.isBakeAdminAuthorized(interaction.member, interaction.guild.id)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to use `/bakeadmin`.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('target') ?? interaction.user;
    const embed = economy.buildBakeAdminEmbed(interaction.guild, interaction.user.id, target.id);
    const components = economy.buildBakeAdminComponents(interaction.user.id, target.id);
    return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
  },
};
