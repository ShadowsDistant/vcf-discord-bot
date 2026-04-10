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

const QUOTE_TEMPLATES = [
  (name) => `The ${name} smells incredible straight from the oven.`,
  (name) => `That warm ${name} aroma could stop anyone in their tracks.`,
  (name) => `One bite of this ${name} and the whole day feels better.`,
  (name) => `This ${name} looks so fresh it barely made it to the cooling rack.`,
  (name) => `The texture on this ${name} is exactly what you hoped for.`,
  (name) => `This ${name} has bakery vibes turned all the way up.`,
  (name) => `You can almost hear the crunch on this ${name}.`,
  (name) => `That ${name} sweetness is perfectly balanced.`,
  (name) => `This ${name} is the kind of treat people brag about baking.`,
  (name) => `The golden finish on this ${name} is absolutely perfect.`,
  (name) => `This ${name} came out so well it deserves a victory lap.`,
  (name) => `That first sniff of this ${name} is pure comfort.`,
  (name) => `This ${name} is dangerously snackable.`,
  (name) => `The flavor on this ${name} is spot on.`,
  (name) => `If treats had trophies, this ${name} would win one.`,
];
const BAKE_TITLES = [
  'Fresh Out of the Oven',
  'Baking Masterpiece',
  'Golden Batch Complete',
  'Sweet Treat Unlocked',
  'Chef\'s Special',
];
const RARITY_STYLES = {
  Common: { color: 0xa3a3a3, bg: 'a3a3a3' },
  Uncommon: { color: 0x57f287, bg: '57f287' },
  Rare: { color: 0x5865f2, bg: '5865f2' },
  Epic: { color: 0x9b59b6, bg: '9b59b6' },
  Legendary: { color: 0xf1c40f, bg: 'f1c40f' },
  Mythic: { color: 0xed4245, bg: 'ed4245' },
};
const TOTAL_COOKIE_WEIGHT = COOKIES.reduce((sum, cookie) => sum + cookie.weight, 0);
const MAX_BAKE_LABEL_LENGTH = 16;

const ITEM_QUOTES = new Map(COOKIES.map((cookie) => [
  cookie.name,
  QUOTE_TEMPLATES.map((template) => template(cookie.name)),
]));

function pickItemQuote(itemName) {
  const quotes = ITEM_QUOTES.get(itemName);
  if (!quotes || quotes.length === 0) {
    return `This ${itemName} smells amazing.`;
  }

  return quotes[Math.floor(Math.random() * quotes.length)];
}

function pickWeightedCookie() {
  let roll = Math.random() * TOTAL_COOKIE_WEIGHT;

  for (const cookie of COOKIES) {
    roll -= cookie.weight;
    if (roll <= 0) return cookie;
  }

  return COOKIES[COOKIES.length - 1];
}

function pickBakeTitle() {
  return BAKE_TITLES[Math.floor(Math.random() * BAKE_TITLES.length)];
}

function formatChance(weight) {
  const chance = (weight / TOTAL_COOKIE_WEIGHT) * 100;
  return `${chance.toFixed(2)}%`;
}

function buildBakeImageUrl(itemName, rarity) {
  const label = itemName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, MAX_BAKE_LABEL_LENGTH) || 'Treat';
  const style = RARITY_STYLES[rarity] ?? RARITY_STYLES.Common;
  return `https://dummyimage.com/128x128/${style.bg}/ffffff.png&text=${encodeURIComponent(label)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bake')
    .setDescription('Bake a random cookie or snack.'),

  async execute(interaction) {
    const cookie = pickWeightedCookie();
    const quote = pickItemQuote(cookie.name);
    const rarityStyle = RARITY_STYLES[cookie.rarity] ?? RARITY_STYLES.Common;
    const embed = embeds
      .base(interaction.guild)
      .setColor(rarityStyle.color)
      .setTitle(pickBakeTitle())
      .setDescription(`${interaction.user} baked a **${cookie.name}**!`);
    embed.addFields({
      name: 'Rarity',
      value: `${cookie.rarity} (**${formatChance(cookie.weight)}** chance)`,
      inline: true,
    }, {
      name: 'Quote',
      value: `*${quote}*`,
    });
    embed.setThumbnail(buildBakeImageUrl(cookie.name, cookie.rarity));

    return interaction.reply({
      embeds: [embed],
    });
  },
};
