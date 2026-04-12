'use strict';

const db = require('./database');
const economy = require('./bakeEconomy');

const ALLIANCES_FILE = 'bake_alliances.json';
const MAX_ALLIANCE_MEMBERS = 10;
const MAX_WEEKLY_STATE_ENTRIES = 12;
const MAX_TARGET_REDUCTION = 0.45;

const CHALLENGE_THEMES = [
  { id: 'flour-rush', name: 'Flour Rush' },
  { id: 'golden-hour', name: 'Golden Hour' },
  { id: 'night-bake', name: 'Night Bake' },
  { id: 'frost-factory', name: 'Frost Factory' },
  { id: 'dough-drive', name: 'Dough Drive' },
  { id: 'oven-overload', name: 'Oven Overload' },
];

const CHALLENGE_TIERS = [
  { id: 'i', suffix: 'I', target: 500_000, rewardCookies: 125_000, rewardAllianceCoins: 2 },
  { id: 'ii', suffix: 'II', target: 900_000, rewardCookies: 175_000, rewardAllianceCoins: 3 },
  { id: 'iii', suffix: 'III', target: 1_500_000, rewardCookies: 240_000, rewardAllianceCoins: 4 },
  { id: 'iv', suffix: 'IV', target: 2_300_000, rewardCookies: 320_000, rewardAllianceCoins: 5 },
  { id: 'v', suffix: 'V', target: 3_300_000, rewardCookies: 420_000, rewardAllianceCoins: 6 },
];

const WEEKLY_ALLIANCE_CHALLENGES = CHALLENGE_THEMES.flatMap((theme) =>
  CHALLENGE_TIERS.map((tier) => ({
    id: `${theme.id}_${tier.id}`,
    name: `${theme.name} ${tier.suffix}`,
    description: `As an alliance, bake ${economy.toCookieNumber(tier.target)} cookies this week.`,
    target: tier.target,
    rewardCookies: tier.rewardCookies,
    rewardAllianceCoins: tier.rewardAllianceCoins,
  })));

const ALLIANCE_STORE_UPGRADES = [
  {
    id: 'council_oven_aura',
    name: 'Council Oven Aura',
    description: '+15% challenge reward cookies for all members.',
    cost: 10,
    emojiCandidates: ['gold_cookie', 'goldcookie', 'GoldCookie'],
    fallbackEmoji: '✨',
    effects: { rewardMultiplier: 0.15 },
  },
  {
    id: 'guild_frosted_banners',
    name: 'Guild Frosted Banners',
    description: '+75,000 flat challenge reward cookies for all members.',
    cost: 12,
    emojiCandidates: ['CookieProduction10', 'stats'],
    fallbackEmoji: '🎖️',
    effects: { flatRewardBonus: 75_000 },
  },
  {
    id: 'alliance_stipend',
    name: 'Alliance Stipend',
    description: '+2 alliance coins on challenge completion.',
    cost: 8,
    emojiCandidates: ['Paid_in_full', 'sell'],
    fallbackEmoji: '💰',
    effects: { bonusAllianceCoins: 2 },
  },
  {
    id: 'precision_mixers',
    name: 'Precision Mixers',
    description: '-8% weekly challenge target for all members.',
    cost: 14,
    emojiCandidates: ['Builder', 'building'],
    fallbackEmoji: '⚙️',
    effects: { targetMultiplierReduction: 0.08 },
  },
  {
    id: 'victory_drums',
    name: 'Victory Drums',
    description: '+10% challenge reward cookies and +1 alliance coin.',
    cost: 16,
    emojiCandidates: ['Cookie_Clicker', 'achievement'],
    fallbackEmoji: '🥁',
    effects: { rewardMultiplier: 0.1, bonusAllianceCoins: 1 },
  },
];

const STORE_UPGRADE_MAP = new Map(ALLIANCE_STORE_UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

function weekNumber(ts = Date.now()) {
  return Math.floor(ts / (7 * 86_400_000));
}

function weekKey(ts = Date.now()) {
  return `wk-${weekNumber(ts)}`;
}

function parseWeekNumberFromKey(key) {
  const raw = String(key ?? '');
  if (!raw.startsWith('wk-')) return 0;
  const num = Number.parseInt(raw.replace('wk-', ''), 10);
  return Number.isFinite(num) ? num : 0;
}

function getGuildState(data, guildId) {
  if (!data[guildId]) {
    data[guildId] = {
      alliances: {},
      userAlliance: {},
      nextAllianceId: 1,
    };
  }
  return data[guildId];
}

function normalizeName(name) {
  return String(name ?? '').trim().slice(0, 40);
}

function findAllianceByName(alliancesById, name) {
  const needle = String(name ?? '').toLowerCase();
  return Object.values(alliancesById ?? {})
    .find((entry) => String(entry?.name ?? '').toLowerCase() === needle) ?? null;
}

function findAllianceByIdOrName(alliancesById, allianceIdOrName) {
  const value = String(allianceIdOrName ?? '').trim();
  if (!value) return null;
  return alliancesById?.[value] ?? findAllianceByName(alliancesById, value);
}

function hashAllianceId(input) {
  const raw = String(input ?? '');
  let hash = 0;
  for (let idx = 0; idx < raw.length; idx += 1) {
    hash = (((hash * 31) >>> 0) + raw.charCodeAt(idx)) >>> 0;
  }
  return hash;
}

function pickWeeklyChallenge(allianceId, ts = Date.now()) {
  if (WEEKLY_ALLIANCE_CHALLENGES.length === 0) {
    return {
      id: 'fallback',
      name: 'Fallback Challenge',
      description: 'Bake cookies as an alliance this week.',
      target: 1_000_000,
      rewardCookies: 100_000,
      rewardAllianceCoins: 1,
    };
  }
  const index = (weekNumber(ts) + hashAllianceId(allianceId)) % WEEKLY_ALLIANCE_CHALLENGES.length;
  return WEEKLY_ALLIANCE_CHALLENGES[index];
}

function getMemberLifetimeTotals(guildId, memberIds) {
  const totals = {};
  for (const userId of memberIds) {
    const snapshot = economy.getUserSnapshot(guildId, userId);
    totals[userId] = Number(snapshot.user.cookiesBakedAllTime ?? 0);
  }
  return totals;
}

function pruneOldWeeklyState(alliance) {
  if (!alliance.challengeWeekly || typeof alliance.challengeWeekly !== 'object') alliance.challengeWeekly = {};
  const keys = Object.keys(alliance.challengeWeekly).sort((a, b) => parseWeekNumberFromKey(a) - parseWeekNumberFromKey(b));
  const overflow = Math.max(0, keys.length - MAX_WEEKLY_STATE_ENTRIES);
  for (const key of keys.slice(0, overflow)) {
    delete alliance.challengeWeekly[key];
  }
}

function ensureAllianceShape(alliance) {
  if (!Array.isArray(alliance.members)) alliance.members = [];
  alliance.members = [...new Set(alliance.members)];
  if (!alliance.challengeWeekly || typeof alliance.challengeWeekly !== 'object') alliance.challengeWeekly = {};
  if (!Array.isArray(alliance.upgrades)) alliance.upgrades = [];
  alliance.upgrades = [...new Set(alliance.upgrades.filter((id) => STORE_UPGRADE_MAP.has(id)))];
  alliance.joinApprovalEnabled = Boolean(alliance.joinApprovalEnabled);
  if (!Array.isArray(alliance.joinRequests)) alliance.joinRequests = [];
  alliance.joinRequests = alliance.joinRequests
    .map((entry) => ({
      userId: String(entry?.userId ?? ''),
      requestedAt: Number(entry?.requestedAt ?? Date.now()),
    }))
    .filter((entry) => entry.userId);
  alliance.storeCredits = Math.max(0, Number(alliance.storeCredits ?? 0));
  pruneOldWeeklyState(alliance);
}

function getAllianceEffectTotals(alliance) {
  const totals = {
    rewardMultiplier: 0,
    flatRewardBonus: 0,
    bonusAllianceCoins: 0,
    targetMultiplierReduction: 0,
  };
  for (const upgradeId of alliance.upgrades ?? []) {
    const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
    if (!upgrade) continue;
    totals.rewardMultiplier += Number(upgrade.effects?.rewardMultiplier ?? 0);
    totals.flatRewardBonus += Number(upgrade.effects?.flatRewardBonus ?? 0);
    totals.bonusAllianceCoins += Number(upgrade.effects?.bonusAllianceCoins ?? 0);
    totals.targetMultiplierReduction += Number(upgrade.effects?.targetMultiplierReduction ?? 0);
  }
  totals.targetMultiplierReduction = Math.min(MAX_TARGET_REDUCTION, Math.max(0, totals.targetMultiplierReduction));
  return totals;
}

function buildChallengeState(guildId, alliance, ts = Date.now()) {
  ensureAllianceShape(alliance);
  const key = weekKey(ts);
  const challenge = pickWeeklyChallenge(alliance.id, ts);
  const effectTotals = getAllianceEffectTotals(alliance);
  const target = Math.max(1, Math.floor(challenge.target * (1 - effectTotals.targetMultiplierReduction)));
  const memberTotals = getMemberLifetimeTotals(guildId, alliance.members ?? []);
  const weeklyState = alliance.challengeWeekly[key] ?? {
    challengeId: challenge.id,
    allianceBaseline: 0,
    memberBaselines: {},
    completedAt: null,
    rewardedAt: null,
  };

  if (!weeklyState.memberBaselines || typeof weeklyState.memberBaselines !== 'object') {
    weeklyState.memberBaselines = {};
  }

  if (!Number.isFinite(weeklyState.allianceBaseline) || weeklyState.allianceBaseline <= 0) {
    weeklyState.allianceBaseline = Object.values(memberTotals).reduce((sum, total) => sum + total, 0);
  }
  for (const [userId, total] of Object.entries(memberTotals)) {
    if (!Number.isFinite(weeklyState.memberBaselines[userId])) {
      weeklyState.memberBaselines[userId] = total;
    }
  }

  const contributors = alliance.members.map((userId) => {
    const baseline = Number(weeklyState.memberBaselines[userId] ?? memberTotals[userId] ?? 0);
    const current = Number(memberTotals[userId] ?? 0);
    const contribution = Math.max(0, current - baseline);
    return { userId, contribution };
  }).sort((a, b) => b.contribution - a.contribution);

  const progress = contributors.reduce((sum, entry) => sum + entry.contribution, 0);
  const completed = progress >= target;
  if (completed && !weeklyState.completedAt) weeklyState.completedAt = ts;

  alliance.challengeWeekly[key] = weeklyState;

  const rewardCookiesPerMember = Math.max(
    1,
    Math.floor((challenge.rewardCookies * (1 + effectTotals.rewardMultiplier)) + effectTotals.flatRewardBonus),
  );
  const rewardAllianceCoins = Math.max(
    1,
    Math.floor(challenge.rewardAllianceCoins + effectTotals.bonusAllianceCoins),
  );

  return {
    challenge,
    effectTotals,
    key,
    target,
    progress,
    completed,
    rewarded: Boolean(weeklyState.rewardedAt),
    completedAt: weeklyState.completedAt,
    rewardedAt: weeklyState.rewardedAt,
    contributors,
    rewardCookiesPerMember,
    rewardAllianceCoins,
  };
}

function maybeGrantChallengeReward(guildId, alliance, challengeState, ts = Date.now()) {
  if (!challengeState.completed || challengeState.rewarded) return null;
  const weeklyState = alliance.challengeWeekly[challengeState.key];
  if (!weeklyState) return null;
  weeklyState.rewardedAt = ts;
  alliance.storeCredits = Math.max(0, Number(alliance.storeCredits ?? 0)) + challengeState.rewardAllianceCoins;
  return {
    members: [...(alliance.members ?? [])],
    rewardCookiesPerMember: challengeState.rewardCookiesPerMember,
    rewardAllianceCoins: challengeState.rewardAllianceCoins,
  };
}

function createAlliance(guildId, ownerId, name) {
  const cleanName = normalizeName(name);
  const sanitized = economy.sanitizeBakeryName(cleanName);
  if (!sanitized.ok) return { ok: false, reason: sanitized.reason };
  const allianceName = sanitized.value.slice(0, 40);
  if (!allianceName) return { ok: false, reason: 'Alliance name cannot be empty.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    if (guild.userAlliance[ownerId]) return { ok: false, reason: 'You are already in an alliance.' };

    const existing = findAllianceByName(guild.alliances, allianceName);
    if (existing) return { ok: false, reason: 'That alliance name is already taken.' };

    const allianceId = String(guild.nextAllianceId++);
    guild.alliances[allianceId] = {
      id: allianceId,
      name: allianceName,
      ownerId,
      members: [ownerId],
      createdAt: Date.now(),
      challengeWeekly: {},
      upgrades: [],
      storeCredits: 0,
      joinApprovalEnabled: false,
      joinRequests: [],
    };
    guild.userAlliance[ownerId] = allianceId;
    return { ok: true, alliance: guild.alliances[allianceId] };
  });
}

function listAlliances(guildId) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  if (!guild) return [];
  return Object.values(guild.alliances ?? {})
    .map((alliance) => {
      ensureAllianceShape(alliance);
      return alliance;
    })
    .sort((a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0));
}

function joinAlliance(guildId, userId, allianceIdOrName) {
  const value = String(allianceIdOrName ?? '').trim();
  if (!value) return { ok: false, reason: 'Alliance identifier is required.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    if (guild.userAlliance[userId]) return { ok: false, reason: 'You are already in an alliance.' };

    const alliance = guild.alliances[value] || findAllianceByName(guild.alliances, value);

    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    ensureAllianceShape(alliance);
    if ((alliance.members ?? []).length >= MAX_ALLIANCE_MEMBERS) {
      return { ok: false, reason: `Alliance is full (max ${MAX_ALLIANCE_MEMBERS} members).` };
    }

    if (alliance.joinApprovalEnabled) {
      const existingRequest = alliance.joinRequests.find((entry) => entry.userId === userId);
      if (existingRequest) return { ok: false, reason: 'You already have a pending join request for this alliance.' };
      alliance.joinRequests.push({ userId, requestedAt: Date.now() });
      return { ok: true, pendingApproval: true, alliance };
    }

    alliance.members.push(userId);
    alliance.members = [...new Set(alliance.members)];
    guild.userAlliance[userId] = alliance.id;
    return { ok: true, alliance };
  });
}

function leaveAlliance(guildId, userId) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance[userId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances[allianceId];
    if (!alliance) {
      delete guild.userAlliance[userId];
      return { ok: false, reason: 'Alliance no longer exists.' };
    }

    ensureAllianceShape(alliance);
    alliance.members = (alliance.members ?? []).filter((memberId) => memberId !== userId);
    alliance.joinRequests = (alliance.joinRequests ?? []).filter((entry) => entry.userId !== userId);
    delete guild.userAlliance[userId];

    if (alliance.ownerId === userId && alliance.members.length > 0) {
      alliance.ownerId = alliance.members[0];
    }

    if (alliance.members.length === 0) {
      delete guild.alliances[alliance.id];
    }

    return { ok: true, alliance };
  });
}

function renameAlliance(guildId, actorId, newName) {
  const cleanName = normalizeName(newName);
  const sanitized = economy.sanitizeBakeryName(cleanName);
  if (!sanitized.ok) return { ok: false, reason: sanitized.reason };
  const allianceName = sanitized.value.slice(0, 40);
  if (!allianceName) return { ok: false, reason: 'Alliance name cannot be empty.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can rename the alliance.' };

    const existing = findAllianceByName(guild.alliances, allianceName);
    if (existing && existing.id !== alliance.id) return { ok: false, reason: 'That alliance name is already taken.' };

    alliance.name = allianceName;
    return { ok: true, alliance };
  });
}

function transferAllianceOwnership(guildId, actorId, targetUserId) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can transfer ownership.' };
    ensureAllianceShape(alliance);
    if (!alliance.members.includes(targetUserId)) {
      return { ok: false, reason: 'That member is not in your alliance.' };
    }
    alliance.ownerId = targetUserId;
    return { ok: true, alliance };
  });
}

function removeAllianceMember(guildId, actorId, targetUserId) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    ensureAllianceShape(alliance);
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can remove members.' };
    if (targetUserId === actorId) return { ok: false, reason: 'Use Leave Alliance to remove yourself.' };
    if (!alliance.members.includes(targetUserId)) return { ok: false, reason: 'That user is not in your alliance.' };

    alliance.members = alliance.members.filter((memberId) => memberId !== targetUserId);
    alliance.joinRequests = (alliance.joinRequests ?? []).filter((entry) => entry.userId !== targetUserId);
    delete guild.userAlliance[targetUserId];
    return { ok: true, alliance };
  });
}

function setAllianceJoinApproval(guildId, actorId, enabled) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    ensureAllianceShape(alliance);
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can change join approval settings.' };
    alliance.joinApprovalEnabled = Boolean(enabled);
    return { ok: true, alliance };
  });
}

function resolveAllianceJoinRequest(guildId, actorId, targetUserId, approve) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    ensureAllianceShape(alliance);
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can review join requests.' };
    const requestIdx = alliance.joinRequests.findIndex((entry) => entry.userId === targetUserId);
    if (requestIdx < 0) return { ok: false, reason: 'That join request is no longer pending.' };

    alliance.joinRequests.splice(requestIdx, 1);
    if (approve) {
      if (guild.userAlliance[targetUserId]) return { ok: false, reason: 'That user is already in an alliance.' };
      if ((alliance.members ?? []).length >= MAX_ALLIANCE_MEMBERS) {
        return { ok: false, reason: `Alliance is full (max ${MAX_ALLIANCE_MEMBERS} members).` };
      }
      alliance.members.push(targetUserId);
      alliance.members = [...new Set(alliance.members)];
      guild.userAlliance[targetUserId] = alliance.id;
      return { ok: true, approved: true, alliance };
    }
    return { ok: true, approved: false, alliance };
  });
}

function getMemberAlliance(guildId, userId) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  if (!guild) return null;
  const allianceId = guild.userAlliance?.[userId];
  if (!allianceId) return null;
  const alliance = guild.alliances?.[allianceId] ?? null;
  if (!alliance) return null;
  ensureAllianceShape(alliance);
  return alliance;
}

function getAllianceLeaderboard(guildId) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  if (!guild) return [];

  const entries = Object.values(guild.alliances ?? {}).map((alliance) => {
    ensureAllianceShape(alliance);
    const members = alliance.members ?? [];
    const cpsTotal = members.reduce((sum, userId) => {
      const snapshot = economy.getUserSnapshot(guildId, userId);
      return sum + economy.computeCps(snapshot.user, Date.now());
    }, 0);
    return {
      id: alliance.id,
      name: alliance.name,
      memberCount: members.length,
      cpsTotal,
    };
  });

  return entries.sort((a, b) => b.cpsTotal - a.cpsTotal);
}

function getAllianceWithChallenge(guildId, userId) {
  let rewardGrant = null;
  const result = db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[userId];
    if (!allianceId) return { alliance: null, challenge: null, store: null };
    const alliance = guild.alliances?.[allianceId] ?? null;
    if (!alliance) return { alliance: null, challenge: null, store: null };

    ensureAllianceShape(alliance);
    const challengeState = buildChallengeState(guildId, alliance, Date.now());
    rewardGrant = maybeGrantChallengeReward(guildId, alliance, challengeState, Date.now());
    if (rewardGrant) {
      challengeState.rewarded = true;
      challengeState.rewardedAt = Date.now();
    }

    const store = {
      credits: alliance.storeCredits,
      upgrades: ALLIANCE_STORE_UPGRADES.map((upgrade) => ({
        ...upgrade,
        owned: alliance.upgrades.includes(upgrade.id),
      })),
      effectTotals: getAllianceEffectTotals(alliance),
    };

    return {
      alliance: {
        ...alliance,
        members: [...alliance.members],
        upgrades: [...alliance.upgrades],
        joinRequests: [...(alliance.joinRequests ?? [])],
        joinApprovalEnabled: Boolean(alliance.joinApprovalEnabled),
      },
      challenge: challengeState,
      store,
    };
  });

  if (rewardGrant) {
    for (const memberId of rewardGrant.members) {
      economy.adminGiveCookies(guildId, memberId, rewardGrant.rewardCookiesPerMember);
    }
    result.challenge.rewardGrantedNow = {
      membersRewarded: rewardGrant.members.length,
      memberIds: [...rewardGrant.members],
      rewardCookiesPerMember: rewardGrant.rewardCookiesPerMember,
      rewardAllianceCoins: rewardGrant.rewardAllianceCoins,
      allianceName: result.alliance?.name ?? 'Alliance',
      challengeName: result.challenge?.challenge?.name ?? 'Weekly Challenge',
    };
  }

  return result;
}

function buyAllianceUpgrade(guildId, actorId, upgradeId) {
  const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown alliance store upgrade.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId] ?? null;
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    ensureAllianceShape(alliance);
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can buy alliance upgrades.' };
    if (alliance.upgrades.includes(upgrade.id)) return { ok: false, reason: 'That upgrade is already owned.' };
    if (alliance.storeCredits < upgrade.cost) {
      return { ok: false, reason: `Not enough alliance credits. Need ${upgrade.cost}.` };
    }
    alliance.storeCredits -= upgrade.cost;
    alliance.upgrades.push(upgrade.id);
    alliance.upgrades = [...new Set(alliance.upgrades)];
    return { ok: true, alliance, upgrade };
  });
}

function adminGrantAllianceUpgrade(guildId, allianceIdOrName, upgradeId) {
  const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown alliance store upgrade.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const alliance = findAllianceByIdOrName(guild.alliances, allianceIdOrName);
    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    ensureAllianceShape(alliance);
    if (alliance.upgrades.includes(upgradeId)) return { ok: false, reason: 'That alliance already has this upgrade.' };
    alliance.upgrades.push(upgradeId);
    alliance.upgrades = [...new Set(alliance.upgrades)];
    return { ok: true, alliance, upgrade };
  });
}

function adminDeleteAlliance(guildId, allianceIdOrName) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const alliance = findAllianceByIdOrName(guild.alliances, allianceIdOrName);
    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    ensureAllianceShape(alliance);
    for (const memberId of alliance.members ?? []) {
      delete guild.userAlliance[memberId];
    }
    for (const request of alliance.joinRequests ?? []) {
      if (request?.userId) delete guild.userAlliance[request.userId];
    }
    delete guild.alliances[alliance.id];
    return { ok: true, allianceId: alliance.id, allianceName: alliance.name, memberCount: alliance.members?.length ?? 0 };
  });
}

module.exports = {
  MAX_ALLIANCE_MEMBERS,
  WEEKLY_ALLIANCE_CHALLENGES,
  ALLIANCE_STORE_UPGRADES,
  createAlliance,
  listAlliances,
  joinAlliance,
  leaveAlliance,
  renameAlliance,
  transferAllianceOwnership,
  removeAllianceMember,
  getMemberAlliance,
  getAllianceLeaderboard,
  getAllianceWithChallenge,
  buyAllianceUpgrade,
  setAllianceJoinApproval,
  resolveAllianceJoinRequest,
  adminGrantAllianceUpgrade,
  adminDeleteAlliance,
};
