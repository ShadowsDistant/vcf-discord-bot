'use strict';

const db = require('./database');

const ANALYTICS_FILE = 'server_analytics.json';
const ANALYTICS_RETENTION_DAYS = 120;

function toDayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function toHourKey(ts = Date.now()) {
  return new Date(ts).getUTCHours().toString().padStart(2, '0');
}

function getDefaultDay() {
  return {
    joins: 0,
    leaves: 0,
    messages: 0,
    channels: {},
    hours: {},
    modActions: {
      warn: 0,
      kick: 0,
      ban: 0,
    },
  };
}

function getGuildStore(data, guildId) {
  if (!data[guildId]) {
    data[guildId] = {
      days: {},
    };
  }
  return data[guildId];
}

function getDayStore(guildStore, dayKey) {
  if (!guildStore.days[dayKey]) guildStore.days[dayKey] = getDefaultDay();
  return guildStore.days[dayKey];
}

function pruneOldDays(guildStore, keepDays = ANALYTICS_RETENTION_DAYS) {
  const keys = Object.keys(guildStore.days).sort();
  const overflow = Math.max(0, keys.length - keepDays);
  for (const key of keys.slice(0, overflow)) {
    delete guildStore.days[key];
  }
}

function recordMessage(guildId, channelId, ts = Date.now()) {
  db.update(ANALYTICS_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const day = getDayStore(guildStore, toDayKey(ts));
    day.messages += 1;
    day.channels[channelId] = (day.channels[channelId] ?? 0) + 1;
    const hourKey = toHourKey(ts);
    day.hours[hourKey] = (day.hours[hourKey] ?? 0) + 1;
    pruneOldDays(guildStore);
  });
}

function recordUserMessage(guildId, userId, channelId, ts = Date.now()) {
  db.update(ANALYTICS_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const day = getDayStore(guildStore, toDayKey(ts));
    if (!day.users) day.users = {};
    if (!day.users[userId]) day.users[userId] = { messages: 0, channels: {}, hours: {} };
    const u = day.users[userId];
    u.messages += 1;
    u.channels[channelId] = (u.channels[channelId] ?? 0) + 1;
    const hourKey = toHourKey(ts);
    u.hours[hourKey] = (u.hours[hourKey] ?? 0) + 1;
    pruneOldDays(guildStore);
  });
}

function recordMemberJoin(guildId, ts = Date.now()) {
  db.update(ANALYTICS_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const day = getDayStore(guildStore, toDayKey(ts));
    day.joins += 1;
    pruneOldDays(guildStore);
  });
}

function recordMemberLeave(guildId, ts = Date.now()) {
  db.update(ANALYTICS_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const day = getDayStore(guildStore, toDayKey(ts));
    day.leaves += 1;
    pruneOldDays(guildStore);
  });
}

function recordModAction(guildId, action, ts = Date.now()) {
  if (!['warn', 'kick', 'ban', 'timeout'].includes(action)) return;
  db.update(ANALYTICS_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const day = getDayStore(guildStore, toDayKey(ts));
    if (!day.modActions.timeout) day.modActions.timeout = 0;
    day.modActions[action] = (day.modActions[action] ?? 0) + 1;
    pruneOldDays(guildStore);
  });
}

function getAnalytics(guildId, periodDays = 7) {
  const data = db.read(ANALYTICS_FILE, {});
  const guildStore = data[guildId] ?? { days: {} };
  const allDayKeys = Object.keys(guildStore.days).sort();
  if (allDayKeys.length === 0) {
    return {
      dayKeys: [],
      joins: 0,
      leaves: 0,
      messages: 0,
      modActions: { warn: 0, kick: 0, ban: 0 },
      channelTotals: [],
      peakHour: null,
      activeDays: 0,
      avgDailyMessages: 0,
      avgMessagesPerActiveDay: 0,
      topAction: null,
      topDays: [],
      busyHours: [],
    };
  }

  const dayKeys = allDayKeys.slice(-Math.max(1, periodDays));
  const summary = {
    dayKeys,
    joins: 0,
    leaves: 0,
    messages: 0,
    modActions: { warn: 0, kick: 0, ban: 0 },
    channelTotals: {},
    hourTotals: {},
    dayMessageTotals: {},
  };

  for (const dayKey of dayKeys) {
    const day = guildStore.days[dayKey] ?? getDefaultDay();
    summary.joins += Number(day.joins ?? 0);
    summary.leaves += Number(day.leaves ?? 0);
    summary.messages += Number(day.messages ?? 0);
    summary.dayMessageTotals[dayKey] = Number(day.messages ?? 0);

    for (const action of ['warn', 'kick', 'ban']) {
      summary.modActions[action] += Number(day.modActions?.[action] ?? 0);
    }

    for (const [channelId, count] of Object.entries(day.channels ?? {})) {
      summary.channelTotals[channelId] = (summary.channelTotals[channelId] ?? 0) + Number(count ?? 0);
    }

    for (const [hour, count] of Object.entries(day.hours ?? {})) {
      summary.hourTotals[hour] = (summary.hourTotals[hour] ?? 0) + Number(count ?? 0);
    }
  }

  const channelTotals = Object.entries(summary.channelTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([channelId, count]) => ({ channelId, count }));

  const peakHourEntry = Object.entries(summary.hourTotals)
    .sort((a, b) => b[1] - a[1])[0] ?? null;
  const activeDays = dayKeys.filter((dayKey) => {
    const day = guildStore.days[dayKey] ?? getDefaultDay();
    return Number(day.messages ?? 0) > 0 || Number(day.joins ?? 0) > 0 || Number(day.leaves ?? 0) > 0;
  }).length;
  const avgDailyMessages = dayKeys.length > 0 ? summary.messages / dayKeys.length : 0;
  const avgMessagesPerActiveDay = activeDays > 0 ? summary.messages / activeDays : 0;
  const topActionEntry = Object.entries(summary.modActions).sort((a, b) => b[1] - a[1])[0] ?? null;
  const topDays = Object.entries(summary.dayMessageTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day, count]) => ({ day, count }));
  const busyHours = Object.entries(summary.hourTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour, count }));

  return {
    dayKeys: summary.dayKeys,
    joins: summary.joins,
    leaves: summary.leaves,
    messages: summary.messages,
    modActions: summary.modActions,
    channelTotals,
    peakHour: peakHourEntry ? { hour: peakHourEntry[0], count: peakHourEntry[1] } : null,
    activeDays,
    avgDailyMessages,
    avgMessagesPerActiveDay,
    topAction: topActionEntry ? { action: topActionEntry[0], count: topActionEntry[1] } : null,
    topDays,
    busyHours,
  };
}

function getUserAnalytics(guildId, userId, periodDays = 7) {
  const data = db.read(ANALYTICS_FILE, {});
  const guildStore = data[guildId] ?? { days: {} };
  const allDayKeys = Object.keys(guildStore.days).sort();
  if (allDayKeys.length === 0) {
    return {
      dayKeys: [],
      messages: 0,
      channelTotals: [],
      peakHour: null,
      activeDays: 0,
      busyHours: [],
    };
  }

  const dayKeys = allDayKeys.slice(-Math.max(1, periodDays));
  const channelTotals = {};
  const hourTotals = {};
  let totalMessages = 0;
  let activeDays = 0;

  for (const dayKey of dayKeys) {
    const day = guildStore.days[dayKey] ?? {};
    const u = day.users?.[userId];
    if (!u) continue;
    const dayMsgs = Number(u.messages ?? 0);
    if (dayMsgs > 0) activeDays += 1;
    totalMessages += dayMsgs;
    for (const [channelId, count] of Object.entries(u.channels ?? {})) {
      channelTotals[channelId] = (channelTotals[channelId] ?? 0) + Number(count ?? 0);
    }
    for (const [hour, count] of Object.entries(u.hours ?? {})) {
      hourTotals[hour] = (hourTotals[hour] ?? 0) + Number(count ?? 0);
    }
  }

  const sortedChannels = Object.entries(channelTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([channelId, count]) => ({ channelId, count }));

  const peakHourEntry = Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0] ?? null;
  const busyHours = Object.entries(hourTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour, count }));

  return {
    dayKeys,
    messages: totalMessages,
    channelTotals: sortedChannels,
    peakHour: peakHourEntry ? { hour: peakHourEntry[0], count: peakHourEntry[1] } : null,
    activeDays,
    busyHours,
  };
}

module.exports = {
  recordMessage,
  recordUserMessage,
  recordMemberJoin,
  recordMemberLeave,
  recordModAction,
  getAnalytics,
  getUserAnalytics,
};
