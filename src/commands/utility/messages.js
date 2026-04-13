'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('messages')
    .setDescription('View your inbox: gift notifications, cookie gifts, and alliance updates.')
    .setDMPermission(false),

  async execute(interaction) {
    const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
    const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, 0);
    const components = economy.buildMessagesComponents(snapshot.user, 0);
    return interaction.reply({
      embeds: [embed],
      components,
      flags: MessageFlags.Ephemeral,
    });
  },
};
