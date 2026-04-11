'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');
const BAKE_COOLDOWN_MS = 30_000;
const bakeCooldowns = new Map();
const COOLDOWN_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
let lastCooldownPruneAt = 0;

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
const BURNT_BAKE_LINE_COUNT = BURNT_BAKE_LINES.length;

function randomBurntLine() {
  return BURNT_BAKE_LINES[Math.floor(Math.random() * BURNT_BAKE_LINE_COUNT)];
}

function pruneCooldowns(now = Date.now()) {
  if ((now - lastCooldownPruneAt) < COOLDOWN_PRUNE_INTERVAL_MS) return;
  for (const [key, lastUsedAt] of bakeCooldowns.entries()) {
    if ((now - lastUsedAt) > BAKE_COOLDOWN_MS) bakeCooldowns.delete(key);
  }
  lastCooldownPruneAt = now;
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
    rankUpdate,
  } = result;
  const rarity = economy.RARITY[item.rarity];
  const dropChance = economy.getItemDropChance(user, item, new Date()) * 100;
  const cps = economy.computeCps(user, Date.now());
  const itemEmoji = economy.getItemEmoji(item, guild);
  const sellValue = economy.getItemSellValue(item);
  const titlePrefix = burnt ? '' : `${itemEmoji} `;
  const batchLabel = burnt ? 'Burnt Batch' : 'Fresh Batch';
  const description = burnt
    ? `${itemEmoji} **Burnt Batch!** ${randomBurntLine()}\nNo cookies gained from this bake.`
    : `You baked **${item.name}** and pocketed **${economy.toCookieNumber(manualYield)}** manual cookies.`;

  const embed = new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(`${titlePrefix}${batchLabel}: ${item.name}`)
    .setDescription(description)
    .setTimestamp()
    .addFields(
      { name: 'Rarity', value: `${rarity.name}\nChance: **${dropChance.toFixed(3)}%**`, inline: true },
      { name: 'Cookies', value: economy.toCookieNumber(user.cookies), inline: true },
      { name: 'CPS', value: economy.toCookieNumber(cps), inline: true },
      { name: 'Sell value', value: economy.toCookieNumber(sellValue), inline: true },
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

  if ((rankUpdate?.unlockedRanks?.length ?? 0) > 0) {
    const unlockedRank = rankUpdate.unlockedRanks[rankUpdate.unlockedRanks.length - 1];
    const nextRank = rankUpdate.nextRank;
    embed.addFields({
      name: `${economy.getRankEmoji(unlockedRank, guild)} Rank unlocked: ${unlockedRank.name}`,
      value: nextRank
        ? `Next rank: ${economy.getRankEmoji(nextRank, guild)} **${nextRank.name}**\nRequirements:\n${economy.formatRankRequirements(nextRank)}\nReward:\n${economy.formatRankReward(nextRank)}`
        : 'You reached the highest rank. 👑',
    });
  }

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bake_again').setLabel('Bake Again').setStyle(ButtonStyle.Primary).setEmoji(economy.getButtonEmoji(guild, ['cookie', 'plain_cookie', 'plain_cookies'], '🍪')),
      new ButtonBuilder().setCustomId('bakery_nav:buildings').setLabel('Store').setStyle(ButtonStyle.Success).setEmoji(economy.getButtonEmoji(guild, ['Builder', 'building'], '🏪')),
      new ButtonBuilder().setCustomId('bakery_nav:inventory').setLabel('Inventory').setStyle(ButtonStyle.Secondary).setEmoji(economy.getButtonEmoji(guild, ['Cookie_dough', 'inventory'], '🎒')),
      new ButtonBuilder().setCustomId('bakery_nav:stats').setLabel('Stats').setStyle(ButtonStyle.Secondary).setEmoji(economy.getButtonEmoji(guild, ['CookieProduction10', 'stats'], '📊')),
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
          .setStyle(ButtonStyle.Primary)
          .setEmoji(economy.getButtonEmoji(guild, ['GoldCookie', 'gold_cookie', 'golden_cookie'], '🌟')),
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
    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command can only be used inside a server.',
      });
    }
    if (economy.isUserBakeBanned(interaction.guild.id, interaction.user.id)) {
      return interaction.reply({
        content: 'You are banned from baking commands in this server.',
        ephemeral: true,
      });
    }
    const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
    const now = Date.now();
    pruneCooldowns(now);
    const nextAllowed = (bakeCooldowns.get(cooldownKey) ?? 0) + BAKE_COOLDOWN_MS;
    if (nextAllowed > now) {
      const remainingSeconds = Math.ceil((nextAllowed - now) / 1000);
      return interaction.reply({
        content: `Slow down, baker. You can use \`/bake\` again in **${remainingSeconds}s**.`,
        ephemeral: true,
      });
    }
    bakeCooldowns.set(cooldownKey, now);
    return interaction.reply(buildBakeReply(interaction.guild, interaction.user.id));
  },
  buildBakeReply,
};
