'use strict';

const LOG_CHANNEL_IDS = {
  role: '1376736218863374406',
  join: '1376736097165377626',
  leave: '1376736138563158039',
  chatDelete: '1376736163867656192',
  automod: '1384358117986402487',
  cookieLogs: '1492706903938043904',
  cookieEvents: '1492690923333746790',
};

async function fetchLogChannel(guild, key) {
  const channelId = LOG_CHANNEL_IDS[key];
  if (!guild || !channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;
  return channel;
}

module.exports = {
  LOG_CHANNEL_IDS,
  fetchLogChannel,
};
