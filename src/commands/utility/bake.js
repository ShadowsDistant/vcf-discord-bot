'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');

const BURNT_BAKE_LINES = [
  'You forgot the timer and summoned a smoke alarm solo.',
  'The oven achieved sentience and chose arson.',
  'That batch came out looking like fossil fuel.',
  'You baked a cookie and unlocked charcoal mode.',
  'The dough saw the heat and gave up immediately.',
  'Congratulations, you invented edible ash.',
  'The tray is fine. The cookies are a crime scene.',
  'Your bakery now smells like dramatic failure.',
  'The cookies were brave, but the fire was braver.',
  'You asked for crisp. The oven heard apocalypse.',
  'One bite and your dentist filed a complaint.',
  'This batch is sponsored by overconfidence.',
  'You discovered a new rarity: overtoasted.',
  'The dough turned into a warning label.',
  'Kitchen status: smoky, crunchy, regrettable.',
  'You made cookies with notes of campfire and sadness.',
  'Heat level: yes. Cookie level: no.',
  'The batch got promoted to pure carbon.',
  'Your timer called. It said “too late.”',
  'Fresh from the oven: one premium burnt disaster.',
];

function randomBurntLine() {
  return BURNT_BAKE_LINES[Math.floor(Math.random() * BURNT_BAKE_LINES.length)];
}

function buildBakeReply(guild, userId) {
  const result = economy.bake(guild.id, userId);
  const {
    user,
    item,
    passive,
    manualYield,
    golden,
    newlyEarned,
    burnt,
  } = result;
  const rarity = economy.RARITY[item.rarity];
  const dropChance = economy.getItemDropChance(user, item) * 100;
  const cps = economy.computeCps(user, Date.now());
  const itemEmoji = economy.getItemEmoji(item, guild);
  const description = burnt
    ? `${itemEmoji} **Burnt batch!** ${randomBurntLine()}\nNo cookies gained from this bake.`
    : `You baked **${item.name}** and pocketed **${economy.toCookieNumber(manualYield)}** manual cookies.`;

  const embed = new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(burnt ? `Fresh Batch: ${item.name}` : `${itemEmoji} Fresh Batch: ${item.name}`)
    .setDescription(description)
    .setTimestamp()
    .addFields(
      { name: 'Rarity', value: `${economy.getRarityEmoji(item.rarity, guild)} ${rarity.name}\nChance: **${dropChance.toFixed(3)}%**`, inline: true },
      { name: 'Cookies', value: economy.toCookieNumber(user.cookies), inline: true },
      { name: 'CPS', value: economy.toCookieNumber(cps), inline: true },
      { name: 'Passive payout', value: `+${economy.toCookieNumber(passive.gained)} (${Math.floor(passive.elapsedMs / 1000)}s)`, inline: true },
    );

  if (guild) {
    embed.setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }

  if (newlyEarned.length > 0) {
    embed.setAuthor({
      name: '🏆 New achievement unlocked!',
    });
    embed.addFields({
      name: '🏆 New achievements',
      value: newlyEarned.slice(0, 4).map((achievement) => `• **${achievement.name}**`).join('\n'),
    });
  }

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bake_again').setLabel('Bake Again').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bakery_nav:buildings').setLabel('Store').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bakery_nav:inventory').setLabel('Inventory').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bakery_nav:stats').setLabel('Stats').setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (golden) {
    const seconds = Math.max(1, Math.floor((golden.expiresAt - Date.now()) / 1000));
    embed.addFields({
      name: '🌟 Golden Cookie!',
      value: `Smash it within **${seconds}s** or it mocks your reflexes forever.`,
    });
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bake_golden_claim:${userId}:${golden.token}`)
          .setLabel('Claim Golden Cookie')
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  return { embeds: [embed], components };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bake')
    .setDescription('Bake cookies, trigger events, and grow your chaotic pastry empire.'),

  async execute(interaction) {
    return interaction.reply(buildBakeReply(interaction.guild, interaction.user.id));
  },
  buildBakeReply,
};
