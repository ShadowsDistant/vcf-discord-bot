'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

const COOKIES = [
  {
    name: 'Perfect Cookie',
    rarity: 'Legendary',
    rarityEmoji: '🟡',
    image: 'https://orteil.dashnet.org/cookieclicker/img/perfectCookie.png',
  },
  {
    name: 'Wrath Cookie',
    rarity: 'Epic',
    rarityEmoji: '🟣',
    image: 'https://orteil.dashnet.org/cookieclicker/img/wrathCookie.png',
  },
  {
    name: 'Spooky Cookie',
    rarity: 'Rare',
    rarityEmoji: '🔵',
    image: 'https://orteil.dashnet.org/cookieclicker/img/spookyCookie.png',
  },
  {
    name: 'Chocolate Chip Cookie',
    rarity: 'Common',
    rarityEmoji: '🟤',
    image: 'https://orteil.dashnet.org/cookieclicker/img/perfectCookie.png',
  },
  {
    name: 'Sugar Cookie',
    rarity: 'Common',
    rarityEmoji: '🟤',
    image: 'https://orteil.dashnet.org/cookieclicker/img/wrathCookie.png',
  },
  {
    name: 'Snickerdoodle Cookie',
    rarity: 'Uncommon',
    rarityEmoji: '🟢',
    image: 'https://orteil.dashnet.org/cookieclicker/img/spookyCookie.png',
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bake')
    .setDescription('Bake a random cookie.'),

  async execute(interaction) {
    const cookie = COOKIES[Math.floor(Math.random() * COOKIES.length)];
    const embed = embeds.success(`${interaction.user} baked a **${cookie.name}**!`, interaction.guild);
    embed.addFields({
      name: 'Rarity',
      value: `${cookie.rarityEmoji} ${cookie.rarity}`,
      inline: true,
    });
    if (cookie.image) {
      embed.setThumbnail(cookie.image);
    }

    return interaction.reply({
      embeds: [embed],
    });
  },
};
