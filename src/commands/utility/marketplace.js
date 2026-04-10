'use strict';

const { SlashCommandBuilder } = require('discord.js');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('marketplace')
    .setDescription('Browse, buy, and list items in the user marketplace.'),

  async execute(interaction) {
    const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
    const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, 0, 'all');
    const components = economy.getMarketplaceComponents(snapshot.guildState, 0, 'all');
    return interaction.reply({ embeds: [market.embed], components });
  },
};
