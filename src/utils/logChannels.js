'use strict';

const LOG_CHANNEL_IDS = {
  role: '1376736218863374406',
  join: '1376736097165377626',
  leave: '1376736138563158039',
  chatDelete: '1376736163867656192',
  automod: '1384358117986402487',
  cookieLogs: '1492706903938043904',
  cookieEvents: '1492690923333746790',
  modLog: '1381353087943442452',
  /** Punishment action logs (warn, kick, ban, timeout, mute, deafen, staff infractions) */
  punishmentLog: '1494891122432938108',
  /** General moderation & management command execution logs */
  commandLog: '1494889843887706172',
  /** AI interaction logs */
  aiLog: '1494887958543597668',
  /** Shift action logs */
  shiftLog: '1420950428446752849',
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
