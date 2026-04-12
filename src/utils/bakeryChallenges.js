'use strict';

const db = require('./database');
const economy = require('./bakeEconomy');

const CHALLENGE_FILE = 'bake_challenges.json';
const ORDERED_RANKS = ['cookie_novice', 'dough_scout', 'oven_knight', 'crumb_commander', 'sugar_overlord', 'cosmic_baker', 'stellar_confectioner', 'galactic_patissier', 'void_oven_archon'];

const DAILY_CHALLENGES = [
  { id: 'daily_bakes_25', name: 'Bake 25 cookies', metric: 'totalBakes', target: 25, rewardCookies: 15_000 },
  { id: 'daily_bakes_40', name: 'Bake 40 cookies', metric: 'totalBakes', target: 40, rewardCookies: 22_000 },
  { id: 'daily_bakes_60', name: 'Bake 60 cookies', metric: 'totalBakes', target: 60, rewardCookies: 30_000 },
  { id: 'daily_items_4', name: 'Discover 4 unique items', metric: 'uniqueItemsDiscovered', target: 4, rewardCookies: 16_000 },
  { id: 'daily_items_5', name: 'Discover 5 unique items', metric: 'uniqueItemsDiscovered', target: 5, rewardCookies: 20_000 },
  { id: 'daily_items_7', name: 'Discover 7 unique items', metric: 'uniqueItemsDiscovered', target: 7, rewardCookies: 30_000 },
  { id: 'daily_cookies_25k', name: 'Bake 25,000 total cookies', metric: 'cookiesBakedAllTime', target: 25_000, rewardCookies: 12_000 },
  { id: 'daily_cookies_50k', name: 'Bake 50,000 total cookies', metric: 'cookiesBakedAllTime', target: 50_000, rewardCookies: 25_000 },
  { id: 'daily_cookies_100k', name: 'Bake 100,000 total cookies', metric: 'cookiesBakedAllTime', target: 100_000, rewardCookies: 40_000 },
  { id: 'daily_golden_3', name: 'Claim 3 Golden Cookies', metric: 'goldenCookiesClaimed', target: 3, rewardCookies: 20_000 },
  { id: 'daily_golden_5', name: 'Claim 5 Golden Cookies', metric: 'goldenCookiesClaimed', target: 5, rewardCookies: 32_000 },
  { id: 'daily_market_buy_2', name: 'Buy 2 marketplace listings', metric: 'marketplaceBuys', target: 2, rewardCookies: 18_000 },
  { id: 'daily_market_sell_2', name: 'Sell 2 marketplace listings', metric: 'marketplaceSells', target: 2, rewardCookies: 18_000 },
  { id: 'daily_market_tx_5', name: 'Complete 5 marketplace transactions', metric: 'marketplaceTransactions', target: 5, rewardCookies: 32_000 },
  { id: 'daily_milk_100', name: 'Reach 100 milk level', metric: 'milkLevel', target: 100, rewardCookies: 20_000 },
  { id: 'daily_milk_150', name: 'Reach 150 milk level', metric: 'milkLevel', target: 150, rewardCookies: 26_000 },
  { id: 'daily_milk_200', name: 'Reach 200 milk level', metric: 'milkLevel', target: 200, rewardCookies: 35_000 },
  { id: 'daily_buildings_25', name: 'Own 25 buildings', metric: 'totalBuildings', target: 25, rewardCookies: 20_000 },
  { id: 'daily_buildings_50', name: 'Own 50 buildings', metric: 'totalBuildings', target: 50, rewardCookies: 35_000 },
  { id: 'daily_buildings_75', name: 'Own 75 buildings', metric: 'totalBuildings', target: 75, rewardCookies: 50_000 },
  { id: 'daily_achievements_8', name: 'Unlock 8 achievements', metric: 'achievements', target: 8, rewardCookies: 24_000 },
  { id: 'daily_achievements_12', name: 'Unlock 12 achievements', metric: 'achievements', target: 12, rewardCookies: 40_000 },
  { id: 'daily_inventory_100', name: 'Hold 100 inventory items', metric: 'inventoryTotal', target: 100, rewardCookies: 22_000 },
  { id: 'daily_inventory_200', name: 'Hold 200 inventory items', metric: 'inventoryTotal', target: 200, rewardCookies: 36_000 },
  { id: 'daily_manual_5k', name: 'Earn 5,000 manual cookies', metric: 'manualCookiesEarned', target: 5_000, rewardCookies: 15_000 },
  { id: 'daily_manual_10k', name: 'Earn 10,000 manual cookies', metric: 'manualCookiesEarned', target: 10_000, rewardCookies: 28_000 },
  { id: 'daily_special_2', name: 'Collect 2 special cookies', metric: 'specialCookiesTotal', target: 2, rewardCookies: 24_000 },
  { id: 'daily_special_4', name: 'Collect 4 special cookies', metric: 'specialCookiesTotal', target: 4, rewardCookies: 42_000 },
  { id: 'daily_rank_2', name: 'Reach rank tier 2', metric: 'rankIndex', target: 2, rewardCookies: 18_000 },
  { id: 'daily_rank_3', name: 'Reach rank tier 3', metric: 'rankIndex', target: 3, rewardCookies: 32_000 },
];

const WEEKLY_CHALLENGES = [
  { id: 'weekly_bakes_250', name: 'Bake 250 cookies', metric: 'totalBakes', target: 250, rewardCookies: 250_000 },
  { id: 'weekly_bakes_400', name: 'Bake 400 cookies', metric: 'totalBakes', target: 400, rewardCookies: 350_000 },
  { id: 'weekly_bakes_600', name: 'Bake 600 cookies', metric: 'totalBakes', target: 600, rewardCookies: 500_000 },
  { id: 'weekly_items_20', name: 'Discover 20 unique items', metric: 'uniqueItemsDiscovered', target: 20, rewardCookies: 300_000 },
  { id: 'weekly_items_30', name: 'Discover 30 unique items', metric: 'uniqueItemsDiscovered', target: 30, rewardCookies: 450_000 },
  { id: 'weekly_items_40', name: 'Discover 40 unique items', metric: 'uniqueItemsDiscovered', target: 40, rewardCookies: 650_000 },
  { id: 'weekly_market_tx_20', name: 'Complete 20 marketplace transactions', metric: 'marketplaceTransactions', target: 20, rewardCookies: 600_000 },
  { id: 'weekly_market_tx_35', name: 'Complete 35 marketplace transactions', metric: 'marketplaceTransactions', target: 35, rewardCookies: 900_000 },
  { id: 'weekly_golden_25', name: 'Claim 25 Golden Cookies', metric: 'goldenCookiesClaimed', target: 25, rewardCookies: 650_000 },
  { id: 'weekly_milk_350', name: 'Reach 350 milk level', metric: 'milkLevel', target: 350, rewardCookies: 750_000 },
  { id: 'weekly_buildings_250', name: 'Own 250 buildings', metric: 'totalBuildings', target: 250, rewardCookies: 1_000_000 },
  { id: 'weekly_achievements_25', name: 'Unlock 25 achievements', metric: 'achievements', target: 25, rewardCookies: 850_000 },
  { id: 'weekly_inventory_750', name: 'Hold 750 inventory items', metric: 'inventoryTotal', target: 750, rewardCookies: 700_000 },
  { id: 'weekly_special_15', name: 'Collect 15 special cookies', metric: 'specialCookiesTotal', target: 15, rewardCookies: 900_000 },
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
  if (metric === 'achievements') return (user.milestones ?? []).length;
  if (metric === 'uniqueItemsDiscovered') return (user.uniqueItemsDiscovered ?? []).length;
  if (metric === 'marketplaceTransactions') return Number(user.marketplaceBuys ?? 0) + Number(user.marketplaceSells ?? 0);
  if (metric === 'totalBuildings') return Object.values(user.buildings ?? {}).reduce((sum, count) => sum + Number(count ?? 0), 0);
  if (metric === 'inventoryTotal') return Object.values(user.inventory ?? {}).reduce((sum, count) => sum + Number(count ?? 0), 0);
  if (metric === 'specialCookiesTotal') {
    return ['perfectcookie', 'goldcookie', 'spoopiercookie']
      .reduce((sum, itemId) => sum + Number(user.inventory?.[itemId] ?? 0), 0);
  }
  if (metric === 'rankIndex') {
    const rank = String(user.rankId ?? ORDERED_RANKS[0]);
    return Math.max(0, ORDERED_RANKS.indexOf(rank));
  }
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
