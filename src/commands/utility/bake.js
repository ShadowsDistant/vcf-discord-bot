'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

const COOKIES = [
  {
    name: 'Chocolate Chip Cookie',
    rarity: 'Common',
    weight: 28,
    image: 'https://orteil.dashnet.org/cookieclicker/img/plainCookie.png',
  },
  {
    name: 'Sugar Cookie',
    rarity: 'Common',
    weight: 26,
    image: 'https://orteil.dashnet.org/cookieclicker/img/sugarCookie.png',
  },
  {
    name: 'Oatmeal Raisin Cookie',
    rarity: 'Common',
    weight: 22,
    image: 'https://orteil.dashnet.org/cookieclicker/img/oatmealCookie.png',
  },
  {
    name: 'Butter Cookie',
    rarity: 'Uncommon',
    weight: 14,
    image: 'https://orteil.dashnet.org/cookieclicker/img/butterCookie.png',
  },
  {
    name: 'Coconut Cookie',
    rarity: 'Uncommon',
    weight: 11,
    image: 'https://orteil.dashnet.org/cookieclicker/img/coconutCookie.png',
  },
  {
    name: 'Gingerbread Cookie',
    rarity: 'Uncommon',
    weight: 10,
    image: 'https://orteil.dashnet.org/cookieclicker/img/gingerbreadCookie.png',
  },
  {
    name: 'Shortbread Cookie',
    rarity: 'Uncommon',
    weight: 9,
    image: 'https://orteil.dashnet.org/cookieclicker/img/shortbreadCookie.png',
  },
  {
    name: 'Spooky Cookie',
    rarity: 'Rare',
    weight: 7,
    image: 'https://orteil.dashnet.org/cookieclicker/img/spookyCookie.png',
  },
  {
    name: 'Fortune Cookie',
    rarity: 'Rare',
    weight: 6,
    image: 'https://orteil.dashnet.org/cookieclicker/img/fortuneCookie.png',
  },
  {
    name: 'Wrath Cookie',
    rarity: 'Epic',
    weight: 4,
    image: 'https://orteil.dashnet.org/cookieclicker/img/wrathCookie.png',
  },
  {
    name: 'Brownie',
    rarity: 'Rare',
    weight: 6,
    image: 'https://orteil.dashnet.org/cookieclicker/img/brownie.png',
  },
  {
    name: 'Muffin',
    rarity: 'Rare',
    weight: 5,
    image: 'https://orteil.dashnet.org/cookieclicker/img/muffin.png',
  },
  {
    name: 'Croissant',
    rarity: 'Rare',
    weight: 5,
    image: 'https://orteil.dashnet.org/cookieclicker/img/croissant.png',
  },
  {
    name: 'Donut',
    rarity: 'Rare',
    weight: 5,
    image: 'https://orteil.dashnet.org/cookieclicker/img/donut.png',
  },
  {
    name: 'Cupcake',
    rarity: 'Rare',
    weight: 4,
    image: 'https://orteil.dashnet.org/cookieclicker/img/cupcake.png',
  },
  {
    name: 'Macaron',
    rarity: 'Epic',
    weight: 3,
    image: 'https://orteil.dashnet.org/cookieclicker/img/macaron.png',
  },
  {
    name: 'Madeleine',
    rarity: 'Epic',
    weight: 3,
    image: 'https://orteil.dashnet.org/cookieclicker/img/madeleine.png',
  },
  {
    name: 'Biscuit',
    rarity: 'Uncommon',
    weight: 8,
    image: 'https://orteil.dashnet.org/cookieclicker/img/biscuit.png',
  },
  {
    name: 'Wafer',
    rarity: 'Uncommon',
    weight: 8,
    image: 'https://orteil.dashnet.org/cookieclicker/img/wafer.png',
  },
  {
    name: 'Pretzel',
    rarity: 'Uncommon',
    weight: 7,
    image: 'https://orteil.dashnet.org/cookieclicker/img/pretzel.png',
  },
  {
    name: 'Caramel Bar',
    rarity: 'Epic',
    weight: 2,
    image: 'https://orteil.dashnet.org/cookieclicker/img/caramelBar.png',
  },
  {
    name: 'Jam Biscuit',
    rarity: 'Uncommon',
    weight: 9,
    image: 'https://orteil.dashnet.org/cookieclicker/img/jamBiscuit.png',
  },
  {
    name: 'Perfect Cookie',
    rarity: 'Legendary',
    weight: 2,
    image: 'https://orteil.dashnet.org/cookieclicker/img/perfectCookie.png',
  },
  {
    name: 'Golden Cookie',
    rarity: 'Mythic',
    weight: 1,
    image: 'https://orteil.dashnet.org/cookieclicker/img/goldCookie.png',
  },
];

function pickWeightedCookie() {
  const totalWeight = COOKIES.reduce((sum, cookie) => sum + cookie.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const cookie of COOKIES) {
    roll -= cookie.weight;
    if (roll <= 0) return cookie;
  }

  return COOKIES[COOKIES.length - 1];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bake')
    .setDescription('Bake a random cookie or snack.'),

  async execute(interaction) {
    const cookie = pickWeightedCookie();
    const embed = embeds.success(`${interaction.user} baked a **${cookie.name}**!`, interaction.guild);
    embed.addFields({
      name: 'Rarity',
      value: cookie.rarity,
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
