'use strict';

const { Events, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/database');
const economy = require('../utils/bakeEconomy');
const alliances = require('../utils/bakeAlliances');
const { fetchLogChannel } = require('../utils/logChannels');
const challenges = require('../utils/bakeryChallenges');
const giveaways = require('../utils/giveaways');

const COOKIE_EVENT_INTERVAL_MIN_MS = 30 * 60 * 1000;
const COOKIE_EVENT_INTERVAL_MAX_MS = 60 * 60 * 1000;
const COOKIE_EVENT_DURATION_MINUTES = 30;
const ALLIANCE_REWARD_TICK_MS = 60 * 1000;
const GIVEAWAY_TICK_MS = 30 * 1000;
const CHALLENGE_ROTATION_TICK_MS = 60 * 1000;
const CHALLENGE_ROTATION_FILE = 'challenge_rotation_state.json';
const BAKE_COMMANDS_CHANNEL_ID = '1492310367869862089';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getInboxMessageTitle(messageData) {
  if (messageData?.title) return String(messageData.title).slice(0, 100);
  if (messageData?.type === 'gift_box') return 'Gift Box Delivery';
  if (messageData?.type === 'gift_cookies') return 'Cookie Gift Delivery';
  if (messageData?.type === 'rank_reward') return 'New Rank Reward';
  if (messageData?.type === 'boost_notification') return 'Boost Update';
  if (messageData?.type === 'alliance_notification') return 'Alliance Update';
  if (messageData?.type === 'staff_message') return 'Staff Message';
  return 'Inbox Update';
}

async function sendInboxDeliveryDm(client, payload) {
  const guildId = String(payload?.guildId ?? '');
  const userId = String(payload?.userId ?? '');
  if (!guildId || !userId) return;
  const messageData = payload?.messageData ?? {};
  if (messageData?.suppressDeliveryDm) return;
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  const user = await client.users.fetch(userId).catch(() => null);
  if (!guild || !user || user.bot) return;
  const dmEmbed = {
    color: 0x5865f2,
    title: '📬 You have a new inbox message',
    description: [
      `Server: **${guild.name}**`,
      `Type: **${getInboxMessageTitle(messageData)}**`,
      '',
      'Run `/messages` in the server to view it.',
    ].join('\n'),
    timestamp: new Date().toISOString(),
  };
  await user.send({ embeds: [dmEmbed] }).catch(() => null);
}

async function ensureMonthlyWaveStart(guild, client) {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const currentWave = db.getCurrentWave(guild.id);
  const currentWaveMonth = currentWave?.startedAt
    ? `${new Date(currentWave.startedAt).getUTCFullYear()}-${String(new Date(currentWave.startedAt).getUTCMonth() + 1).padStart(2, '0')}`
    : null;
  if (currentWaveMonth === currentMonth) return;
  db.startWave(guild.id, client.user.id);
}

function scheduleCookieEventLoop(guild, client) {
  const run = async () => {
    const nowTs = Date.now();
    const endsAtTs = nowTs + (COOKIE_EVENT_DURATION_MINUTES * 60_000);
    const eventDef = economy.startRandomCookieEvent(guild.id, COOKIE_EVENT_DURATION_MINUTES);
    const channel = await fetchLogChannel(guild, 'cookieEvents');
    if (channel) {
      const eventEmojis = {
        special_cookie_hunt: '🍪',
        golden_fever: '✨',
        sugar_rush: '⚡',
        steady_heat: '🔥',
      };
      const emoji = eventEmojis[eventDef.id] ?? '🎉';
      const color = {
        special_cookie_hunt: 0xf1c40f,
        golden_fever: 0xfee75c,
        sugar_rush: 0xff6b35,
        steady_heat: 0xed4245,
      }[eventDef.id] ?? 0x5865f2;

      await channel.send({
        embeds: [
          {
            color,
            title: `${emoji} Cookie Event — ${eventDef.name}`,
            description: `**${eventDef.description}**\n\nA new limited-time event has just started! Head to <#${BAKE_COMMANDS_CHANNEL_ID}> and start baking to take advantage of the boost.`,
            fields: [
              { name: '⏰ Started', value: `<t:${Math.floor(nowTs / 1000)}:F>`, inline: true },
              { name: '🏁 Ends', value: `<t:${Math.floor(endsAtTs / 1000)}:R>`, inline: true },
              { name: '⏱️ Duration', value: `**${COOKIE_EVENT_DURATION_MINUTES} minute${COOKIE_EVENT_DURATION_MINUTES === 1 ? '' : 's'}**`, inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: guild.name,
              icon_url: guild.iconURL() ?? undefined,
            },
          },
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('🍪 Go Bake Now')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${guild.id}/${BAKE_COMMANDS_CHANNEL_ID}`),
          ),
        ],
      }).catch(() => null);
    }
    setTimeout(run, randomInt(COOKIE_EVENT_INTERVAL_MIN_MS, COOKIE_EVENT_INTERVAL_MAX_MS));
  };
  setTimeout(run, randomInt(COOKIE_EVENT_INTERVAL_MIN_MS, COOKIE_EVENT_INTERVAL_MAX_MS));
}

async function processAllianceRewardDms(client) {
  const notices = alliances.processAllianceChallengeRewards();
  if (!notices.length) return;
  for (const notice of notices) {
    const memberIds = notice.memberIds ?? [];
    for (const memberId of memberIds) {
      economy.addPendingMessage(notice.guildId, memberId, {
        type: 'alliance_notification',
        notificationType: 'alliance_challenge_reward',
        from: 'Alliance System',
        title: '🎉 Alliance Challenge Completed',
        content: [
          `Alliance: **${notice.allianceName}**`,
          `Challenge: **${notice.challengeName}**`,
          `Reward: **${economy.toCookieNumber(notice.rewardCookiesPerMember)}** cookies`,
          `Alliance credits gained: **${notice.rewardAllianceCoins}**`,
        ].join('\n'),
      });
    }
  }
}

async function processDueGiveaways(client) {
  const due = giveaways.listDueActiveGiveaways(Date.now());
  if (!due.length) return;
  for (const item of due) {
    const guild = client.guilds.cache.get(item.guildId) ?? await client.guilds.fetch(item.guildId).catch(() => null);
    if (!guild) continue;
    await giveaways.concludeGiveawayRecord(guild, item.record, 'Automatic Timer').catch(() => null);
  }
}

async function processChallengeRotations(client) {
  const nowTs = Date.now();
  const guilds = [...client.guilds.cache.values()];
  for (const guild of guilds) {
    const rotation = challenges.getGuildChallengeRotation(guild.id, nowTs);
    const allianceSnapshot = alliances.listAlliances(guild.id);
    const eventChannel = await fetchLogChannel(guild, 'cookieEvents').catch(() => null);
    if (!eventChannel) continue;
    db.update(CHALLENGE_ROTATION_FILE, {}, (data) => {
      const current = data[guild.id] ?? {};
      const hasDailyChanged = current.dailyKey !== rotation.daily.key;
      const hasWeeklyChanged = current.weeklyKey !== rotation.weekly.key;
      const allianceWeekKey = rotation.weekly.key;
      const hasAllianceChanged = current.allianceWeekKey !== allianceWeekKey;
      if (hasDailyChanged || hasWeeklyChanged || hasAllianceChanged) {
        const lines = [];
        if (hasDailyChanged) {
          lines.push(`🗓️ New **Daily Challenge**: **${rotation.daily.name}**`);
        }
        if (hasWeeklyChanged) {
          lines.push(`📆 New **Weekly Challenge**: **${rotation.weekly.name}**`);
        }
        if (hasAllianceChanged) {
          lines.push(`🏰 Alliance weekly quests rotated for **${allianceSnapshot.length}** alliance(s).`);
        }
        eventChannel.send({
          embeds: [
            {
              color: 0x5865f2,
              title: '🎯 Challenge Rotation Update',
              description: lines.join('\n'),
              timestamp: new Date(nowTs).toISOString(),
            },
          ],
        }).catch(() => null);
      }
      data[guild.id] = {
        dailyKey: rotation.daily.key,
        dailyId: rotation.daily.id,
        weeklyKey: rotation.weekly.key,
        weeklyId: rotation.weekly.id,
        allianceWeekKey,
        updatedAt: new Date(nowTs).toISOString(),
      };
    });
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`  Serving ${client.guilds.cache.size} guild(s) | ${client.users.cache.size} cached users`);

    client.user.setPresence({
      activities: [
        {
          name: '/help',
          type: ActivityType.Listening,
        },
      ],
      status: 'online',
    });
    economy.setInboxDeliveryNotifier((payload) => sendInboxDeliveryDm(client, payload));

    for (const guild of client.guilds.cache.values()) {
      ensureMonthlyWaveStart(guild, client).catch(() => null);
      scheduleCookieEventLoop(guild, client);
    }

    const monthlyTimer = setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        ensureMonthlyWaveStart(guild, client).catch(() => null);
      }
    }, 24 * 60 * 60 * 1000);
    if (typeof monthlyTimer.unref === 'function') monthlyTimer.unref();

    const allianceRewardTimer = setInterval(() => {
      processAllianceRewardDms(client).catch((error) => {
        console.error('Alliance reward DM processing failed:', error);
      });
    }, ALLIANCE_REWARD_TICK_MS);
    if (typeof allianceRewardTimer.unref === 'function') allianceRewardTimer.unref();

    const giveawayTimer = setInterval(() => {
      processDueGiveaways(client).catch((error) => {
        console.error('Giveaway processing failed:', error);
      });
    }, GIVEAWAY_TICK_MS);
    if (typeof giveawayTimer.unref === 'function') giveawayTimer.unref();

    const challengeRotationTimer = setInterval(() => {
      processChallengeRotations(client).catch((error) => {
        console.error('Challenge rotation processing failed:', error);
      });
    }, CHALLENGE_ROTATION_TICK_MS);
    if (typeof challengeRotationTimer.unref === 'function') challengeRotationTimer.unref();

    processDueGiveaways(client).catch(() => null);
    processChallengeRotations(client).catch(() => null);
  },
};
