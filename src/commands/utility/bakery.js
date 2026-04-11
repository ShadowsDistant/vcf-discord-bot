'use strict';

const { SlashCommandBuilder } = require('discord.js');
const economy = require('../../utils/bakeEconomy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bakery')
    .setDescription('Open your bakery dashboard and manage your cookie empire.'),

  async execute(interaction) {
    const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
    const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'home');
    const components = economy.buildDashboardComponents(snapshot.user, 'home', { guild: interaction.guild });
    return interaction.reply({ embeds: [embed], components });
  },
};
