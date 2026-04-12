'use strict';

const db = require('./database');
const economy = require('./bakeEconomy');

const CHALLENGE_FILE = 'bake_challenges.json';

const DAILY_CHALLENGES = [
  { id: 'daily_bakes_25', name: 'Bake 25 cookies', metric: 'totalBakes', target: 25, rewardCookies: 15_000 },
  { id: 'daily_items_5', name: 'Discover 5 unique items', metric: 'uniqueItemsDiscovered', target: 5, rewardCookies: 20_000 },
  { id: 'daily_cookies_50k', name: 'Bake 50,000 total cookies', metric: 'cookiesBakedAllTime', target: 50_000, rewardCookies: 25_000 },
];

const WEEKLY_CHALLENGES = [
  { id: 'weekly_bakes_250', name: 'Bake 250 cookies', metric: 'totalBakes', target: 250, rewardCookies: 250_000 },
  { id: 'weekly_items_20', name: 'Discover 20 unique items', metric: 'uniqueItemsDiscovered', target: 20, rewardCookies: 300_000 },
  { id: 'weekly_cookies_1m', name: 'Bake 1,000,000 total cookies', metric: 'cookiesBakedAllTime', target: 1_000_000, rewardCookies: 500_000 },
];

function hashNumber(input) {
  let hash = 0;
  for (const ch of String(input)) {
    hash = ((hash << 5) - hash) + ch.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDaySeed(ts = Date.now()) {
  return Math.floor(ts / 86_400_000);
}

function getWeekSeed(ts = Date.now()) {
  return Math.floor(ts / (7 * 86_400_000));
}

function getDailyChallenge(guildId, ts = Date.now()) {
  const idx = (getDaySeed(ts) + hashNumber(guildId)) % DAILY_CHALLENGES.length;
  return DAILY_CHALLENGES[idx];
}

function getWeeklyChallenge(guildId, ts = Date.now()) {
  const idx = (getWeekSeed(ts) + hashNumber(guildId)) % WEEKLY_CHALLENGES.length;
  return WEEKLY_CHALLENGES[idx];
}

function getMetricValue(user, metric) {
  if (metric === 'uniqueItemsDiscovered') return (user.uniqueItemsDiscovered ?? []).length;
  return Number(user[metric] ?? 0);
}

function getDailyKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function getWeeklyKey(ts = Date.now()) {
  return `wk-${getWeekSeed(ts)}`;
}

function getClaimStore(data, guildId, userId) {
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = { daily: {}, weekly: {} };
  return data[guildId][userId];
}

function getChallengeStatus(guildId, userId, ts = Date.now()) {
  const snapshot = economy.getUserSnapshot(guildId, userId);
  const user = snapshot.user;
  const data = db.read(CHALLENGE_FILE, {});
  const claimStore = data?.[guildId]?.[userId] ?? { daily: {}, weekly: {} };

  const daily = getDailyChallenge(guildId, ts);
  const weekly = getWeeklyChallenge(guildId, ts);

  const dailyProgress = Math.min(daily.target, getMetricValue(user, daily.metric));
  const weeklyProgress = Math.min(weekly.target, getMetricValue(user, weekly.metric));

  const dailyKey = getDailyKey(ts);
  const weeklyKey = getWeeklyKey(ts);

  return {
    user,
    daily: {
      ...daily,
      key: dailyKey,
      progress: dailyProgress,
      complete: dailyProgress >= daily.target,
      claimed: Boolean(claimStore.daily?.[dailyKey] === daily.id),
    },
    weekly: {
      ...weekly,
      key: weeklyKey,
      progress: weeklyProgress,
      complete: weeklyProgress >= weekly.target,
      claimed: Boolean(claimStore.weekly?.[weeklyKey] === weekly.id),
    },
  };
}

function claimAvailableRewards(guildId, userId, ts = Date.now()) {
  const status = getChallengeStatus(guildId, userId, ts);
  const rewardsToGrant = [];

  db.update(CHALLENGE_FILE, {}, (data) => {
    const claimStore = getClaimStore(data, guildId, userId);

    if (status.daily.complete && !status.daily.claimed) {
      claimStore.daily[status.daily.key] = status.daily.id;
      rewardsToGrant.push({ type: 'daily', cookies: status.daily.rewardCookies, challenge: status.daily.name });
    }

    if (status.weekly.complete && !status.weekly.claimed) {
      claimStore.weekly[status.weekly.key] = status.weekly.id;
      rewardsToGrant.push({ type: 'weekly', cookies: status.weekly.rewardCookies, challenge: status.weekly.name });
    }
  });

  for (const reward of rewardsToGrant) {
    economy.adminGiveCookies(guildId, userId, reward.cookies);
  }

  return rewardsToGrant;
}

module.exports = {
  getChallengeStatus,
  claimAvailableRewards,
};
