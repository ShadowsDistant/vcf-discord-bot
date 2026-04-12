'use strict';

const { Events, ActivityType } = require('discord.js');
const db = require('../utils/database');
const economy = require('../utils/bakeEconomy');
const { fetchLogChannel } = require('../utils/logChannels');

const COOKIE_EVENT_INTERVAL_MIN_MS = 30 * 60 * 1000;
const COOKIE_EVENT_INTERVAL_MAX_MS = 60 * 60 * 1000;
const COOKIE_EVENT_DURATION_MINUTES = 30;

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
    const eventDef = economy.startRandomCookieEvent(guild.id, COOKIE_EVENT_DURATION_MINUTES);
    const channel = await fetchLogChannel(guild, 'cookieEvents');
    if (channel) {
      await channel.send({
        embeds: [
          {
            color: 0x5865f2,
            title: `Cookie Event Started: ${eventDef.name}`,
            description: `${eventDef.description}\nDuration: **${COOKIE_EVENT_DURATION_MINUTES} minutes**`,
            timestamp: new Date().toISOString(),
            footer: {
              text: guild.name,
              icon_url: guild.iconURL({ dynamic: true }) ?? undefined,
            },
          },
        ],
      }).catch(() => null);
    }
    setTimeout(run, randomInt(COOKIE_EVENT_INTERVAL_MIN_MS, COOKIE_EVENT_INTERVAL_MAX_MS));
  };
  setTimeout(run, randomInt(COOKIE_EVENT_INTERVAL_MIN_MS, COOKIE_EVENT_INTERVAL_MAX_MS));
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
    }, 60 * 60 * 1000);
    if (typeof monthlyTimer.unref === 'function') monthlyTimer.unref();
  },
};
