'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

const COOKIES = [
  {
    name: 'Chocolate Chip Cookie',
    rarity: 'Common',
    weight: 28,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/5/55/Chocolate_chip_cookie.png/revision/latest?cb=20210404132052',
  },
  {
    name: 'Sugar Cookie',
    rarity: 'Common',
    weight: 26,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/5/5a/Sugar_cookies.png/revision/latest?cb=20160217141253',
  },
  {
    name: 'Oatmeal Raisin Cookie',
    rarity: 'Common',
    weight: 22,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/1/1e/Oatmeal_raisin_cookies.png/revision/latest?cb=20160217140448',
  },
  {
    name: 'Butter Cookie',
    rarity: 'Uncommon',
    weight: 14,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/4/4d/Butter_cookies.png/revision/latest?cb=20160217135545',
  },
  {
    name: 'Coconut Cookie',
    rarity: 'Uncommon',
    weight: 11,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/1/1c/Coconut_cookies.png/revision/latest?cb=20160217135857',
  },
  {
    name: 'Gingerbread Cookie',
    rarity: 'Uncommon',
    weight: 10,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/e/ec/Gingersnaps.png/revision/latest?cb=20160217140137',
  },
  {
    name: 'Shortbread Cookie',
    rarity: 'Uncommon',
    weight: 9,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/0/0e/Shortbread_biscuits.png/revision/latest?cb=20160217141043',
  },
  {
    name: 'Spooky Cookie',
    rarity: 'Rare',
    weight: 7,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/1/13/Ghost_cookies.png/revision/latest?cb=20160217140107',
  },
  {
    name: 'Fortune Cookie',
    rarity: 'Rare',
    weight: 6,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/5/52/Flavor_text_cookie.png/revision/latest?cb=20181024003750',
  },
  {
    name: 'Wrath Cookie',
    rarity: 'Epic',
    weight: 4,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/8/84/Burnt_cookie.png/revision/latest?cb=20181024003749',
  },
  {
    name: 'Brownie',
    rarity: 'Rare',
    weight: 6,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/d/dd/Fudge_squares.png/revision/latest?cb=20160217140058',
  },
  {
    name: 'Muffin',
    rarity: 'Rare',
    weight: 5,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/e/ed/Fat_rascals.png/revision/latest?cb=20201030060059',
  },
  {
    name: 'Croissant',
    rarity: 'Rare',
    weight: 5,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/e/e5/Butter_croissant.png/revision/latest?cb=20181024003749',
  },
  {
    name: 'Donut',
    rarity: 'Rare',
    weight: 5,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/6/61/Glazed_donut.png/revision/latest?cb=20181024003750',
  },
  {
    name: 'Cupcake',
    rarity: 'Rare',
    weight: 4,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/7/74/Chocolate_cake.png/revision/latest?cb=20181024003750',
  },
  {
    name: 'Macaron',
    rarity: 'Epic',
    weight: 3,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/a/af/Box_of_macarons.png/revision/latest?cb=20151230163225',
  },
  {
    name: 'Madeleine',
    rarity: 'Epic',
    weight: 3,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/0/00/Madeleines.png/revision/latest?cb=20160217140353',
  },
  {
    name: 'Biscuit',
    rarity: 'Uncommon',
    weight: 8,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/c/c1/British_tea_biscuits.png/revision/latest?cb=20160217135525',
  },
  {
    name: 'Wafer',
    rarity: 'Uncommon',
    weight: 8,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/c/cf/Zilla_wafers.png/revision/latest?cb=20190925151608',
  },
  {
    name: 'Pretzel',
    rarity: 'Uncommon',
    weight: 7,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/9/9e/Pokey.png/revision/latest?cb=20201030060100',
  },
  {
    name: 'Caramel Bar',
    rarity: 'Epic',
    weight: 2,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/9/94/Cookie_bars.png/revision/latest?cb=20220809061541',
  },
  {
    name: 'Jam Biscuit',
    rarity: 'Uncommon',
    weight: 9,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/b/b5/Thumbprint_cookies.png/revision/latest?cb=20190925151607',
  },
  {
    name: 'Perfect Cookie',
    rarity: 'Legendary',
    weight: 2,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/f/f6/High-definition_cookie.png/revision/latest?cb=20181024003750',
  },
  {
    name: 'Golden Cookie',
    rarity: 'Mythic',
    weight: 1,
    image: 'https://static.wikia.nocookie.net/cookieclicker/images/5/5b/Golden_heart_biscuits.png/revision/latest?cb=20160217140147',
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
  Common: { color: 0xa3a3a3 },
  Uncommon: { color: 0x57f287 },
  Rare: { color: 0x5865f2 },
  Epic: { color: 0x9b59b6 },
  Legendary: { color: 0xf1c40f },
  Mythic: { color: 0xed4245 },
};
const TOTAL_COOKIE_WEIGHT = COOKIES.reduce((sum, cookie) => sum + cookie.weight, 0);

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

function makeSmallImageUrl(url) {
  if (!url) return null;
  return url.replace('/revision/latest?', '/revision/latest/scale-to-width-down/128?');
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
    const thumbnail = makeSmallImageUrl(cookie.image);
    if (thumbnail) embed.setThumbnail(thumbnail);

    return interaction.reply({
      embeds: [embed],
    });
  },
};
