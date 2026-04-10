'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

const COOKIES = [
  'Chocolate Chip Cookie',
  'Oatmeal Raisin Cookie',
  'Sugar Cookie',
  'Double Chocolate Cookie',
  'Peanut Butter Cookie',
  'Snickerdoodle Cookie',
  'White Chocolate Macadamia Cookie',
  'Molasses Cookie',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bake')
    .setDescription('Bake a random cookie.'),

  async execute(interaction) {
    const cookie = COOKIES[Math.floor(Math.random() * COOKIES.length)];

    return interaction.reply({
      embeds: [
        typeof embeds.fun === 'function'
          ? embeds.fun('  Fresh Batch!', `${interaction.user} baked a **${cookie}**!`, interaction.guild)
          : embeds.success(`${interaction.user} baked a **${cookie}**! `, interaction.guild),
      ],
    });
  },
};
