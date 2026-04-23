'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');
const BAKE_COOLDOWN_MS = 30_000;
const bakeCooldowns = new Map();
const COOLDOWN_PRUNE_INTERVAL_MS = BAKE_COOLDOWN_MS;
const MAX_BAKE_COOLDOWN_ENTRIES = 10_000;
let lastCooldownPruneAt = 0;
const COOKIE_LOG_CHANNEL_ID = '1492706903938043904';
const SPECIAL_COOKIE_EVENT_DETAILS = {
  perfectcookie: {
    title: '- Perfect Cookie Event',
    description: 'A mathematically flawless cookie has emerged.',
    color: 0xfee75c,
  },
  goldcookie: {
    title: '🌟 Gold Cookie Event',
    description: 'A gilded cookie has entered the oven economy.',
    color: 0xf1c40f,
  },
  spoopiercookie: {
    title: '👻 Spoopier Cookie Event',
    description: 'A spooky rare bake has been discovered.',
    color: 0x8e44ad,
  },
};

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
  const expiredKeys = [...bakeCooldowns.entries()]
    .filter(([, lastUsedAt]) => (now - lastUsedAt) > BAKE_COOLDOWN_MS)
    .map(([key]) => key);
  for (const key of expiredKeys) bakeCooldowns.delete(key);
  if (bakeCooldowns.size > MAX_BAKE_COOLDOWN_ENTRIES) {
    const overflow = bakeCooldowns.size - MAX_BAKE_COOLDOWN_ENTRIES;
    const oldest = [...bakeCooldowns.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, overflow)
      .map(([key]) => key);
    for (const key of oldest) bakeCooldowns.delete(key);
  }
  lastCooldownPruneAt = now;
}

function getCooldownKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getCooldownRemainingMs(guildId, userId, now = Date.now()) {
  pruneCooldowns(now);
  const cooldownKey = getCooldownKey(guildId, userId);
  const nextAllowed = (bakeCooldowns.get(cooldownKey) ?? 0) + BAKE_COOLDOWN_MS;
  return Math.max(0, nextAllowed - now);
}

function touchCooldown(guildId, userId, now = Date.now()) {
  pruneCooldowns(now);
  bakeCooldowns.set(getCooldownKey(guildId, userId), now);
}

const cooldownPruneTimer = setInterval(() => pruneCooldowns(Date.now()), COOLDOWN_PRUNE_INTERVAL_MS);
// Avoid keeping the Node process alive solely for periodic cache pruning.
if (typeof cooldownPruneTimer.unref === 'function') cooldownPruneTimer.unref();

function buildBakeReply(guild, userId) {
  return buildBakeOutcome(guild, userId).reply;
}

function getTotalSpecialCookies(user) {
  return economy.SPECIAL_COOKIE_IDS.reduce((sum, itemId) => sum + Number(user.inventory?.[itemId] ?? 0), 0);
}

function buildBakeOutcome(guild, userId) {
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
    activeEvent,
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
        ? `Reward sent to your inbox. Use \`/messages\` to claim it.\n\nNext rank: ${economy.getRankEmoji(nextRank, guild)} **${nextRank.name}**\nRequirements:\n${economy.formatRankRequirements(nextRank)}\nReward:\n${economy.formatRankReward(nextRank)}`
        : 'Reward sent to your inbox. Use `/messages` to claim it.\nYou reached the highest rank. 👑',
    });
  }

  if (activeEvent?.id === 'special_cookie_hunt' && Number.isFinite(activeEvent.endsAt)) {
    const endsAtTs = Math.floor(activeEvent.endsAt / 1000);
    embed.addFields({
      name: '🎉 Active Event: Special Cookie Hunt',
      value: `Special cookie drops are boosted.\nEnds: <t:${endsAtTs}:F> (<t:${endsAtTs}:R>).`,
    });
  }

  const components = [
      new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bake_again').setLabel('Bake Again').setStyle(ButtonStyle.Primary).setEmoji(economy.getButtonEmoji(guild, ['cookie', 'plain_cookie', 'plain_cookies'], '🍪')),
      new ButtonBuilder().setCustomId('bakery_nav:buildings').setLabel('Store').setStyle(ButtonStyle.Success).setEmoji(economy.getButtonEmoji(guild, ['Builder', 'building'], '🏪')),
      new ButtonBuilder().setCustomId('bakery_nav:inventory').setLabel('Inventory').setStyle(ButtonStyle.Secondary).setEmoji(economy.getButtonEmoji(guild, ['Cookie_dough', 'inventory'], '🎒')),
      new ButtonBuilder().setCustomId('bakery_nav:stats').setLabel('Stats').setStyle(ButtonStyle.Secondary).setEmoji(economy.getButtonEmoji(guild, ['CookieProduction10', 'stats'], '📈')),
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

  const eventDetails = SPECIAL_COOKIE_EVENT_DETAILS[item.id] ?? null;
  const specialCookieEvent = (!burnt && eventDetails)
    ? {
      item,
      userId,
      totalSpecialCookies: getTotalSpecialCookies(user),
      details: eventDetails,
    }
    : null;

  return {
    reply: { embeds: [embed], components },
    specialCookieEvent,
  };
}

async function postSpecialCookieEvent(guild, bakerUser, event) {
  if (!guild || !bakerUser || !event) return;
  const channel = await guild.channels.fetch(COOKIE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const eventEmbed = new EmbedBuilder()
    .setColor(event.details.color)
    .setTitle(`${event.details.title}: ${event.item.name}`)
    .setDescription([
      `${economy.getItemEmoji(event.item.id, guild)} <@${bakerUser.id}> just baked **${event.item.name}**!`,
      event.details.description,
      `Total special cookies owned: **${economy.toCookieNumber(event.totalSpecialCookies)}**`,
    ].join('\n'))
    .setTimestamp()
    .setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  await channel.send({ embeds: [eventEmbed] }).catch(() => null);
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
        flags: MessageFlags.Ephemeral,
      });
    }
    const now = Date.now();
    const remainingMs = getCooldownRemainingMs(interaction.guild.id, interaction.user.id, now);
    if (remainingMs > 0) {
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      return interaction.reply({
        content: `Slow down, baker. You can use \`/bake\` again in **${remainingSeconds}s**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    touchCooldown(interaction.guild.id, interaction.user.id, now);
    const outcome = buildBakeOutcome(interaction.guild, interaction.user.id);
    await interaction.reply(outcome.reply);
    if (outcome.specialCookieEvent) {
      await postSpecialCookieEvent(interaction.guild, interaction.user, outcome.specialCookieEvent);
    }
    return;
  },
  buildBakeReply,
  buildBakeOutcome,
  postSpecialCookieEvent,
  getCooldownRemainingMs,
  touchCooldown,
};
