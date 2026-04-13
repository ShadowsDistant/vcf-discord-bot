'use strict';

const { Events, ActivityType } = require('discord.js');
const db = require('../utils/database');
const economy = require('../utils/bakeEconomy');
const alliances = require('../utils/bakeAlliances');
const { fetchLogChannel } = require('../utils/logChannels');

const COOKIE_EVENT_INTERVAL_MIN_MS = 30 * 60 * 1000;
const COOKIE_EVENT_INTERVAL_MAX_MS = 60 * 60 * 1000;
const COOKIE_EVENT_DURATION_MINUTES = 30;
const ALLIANCE_REWARD_TICK_MS = 60 * 1000;
const BAKE_COMMANDS_CHANNEL_ID = '1492310367869862089';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
    const guild = client.guilds.cache.get(notice.guildId) ?? null;
    const embed = {
      color: 0x57f287,
      title: '🎉 Alliance Challenge Completed',
      description: [
        `Alliance: **${notice.allianceName}**`,
        `Challenge: **${notice.challengeName}**`,
        `Reward: **${economy.toCookieNumber(notice.rewardCookiesPerMember)}** cookies`,
        `Alliance credits gained: **${notice.rewardAllianceCoins}**`,
      ].join('\n'),
      timestamp: new Date().toISOString(),
      footer: guild
        ? {
          text: guild.name,
          icon_url: guild.iconURL() ?? undefined,
        }
        : undefined,
    };

    const memberIds = notice.memberIds ?? [];
    await Promise.allSettled(memberIds.map(async (memberId) => {
      const user = await client.users.fetch(memberId).catch(() => null);
      if (!user) return;
      await user.send({ embeds: [embed] });
    }));
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
  },
};
