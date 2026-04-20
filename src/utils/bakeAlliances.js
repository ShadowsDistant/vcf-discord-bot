'use strict';

const db = require('./database');
const economy = require('./bakeEconomy');

const ALLIANCES_FILE = 'bake_alliances.json';
const MAX_ALLIANCE_MEMBERS = 10;
const MAX_WEEKLY_STATE_ENTRIES = 12;
const MAX_TARGET_REDUCTION = 0.45;
const ALLIANCE_CREATE_COST = 100_000;
const MAX_ALLIANCE_DESCRIPTION_LENGTH = 240;
const BOOSTER_PERSONAL_CPS_BOOST = 0.10;
const BOOSTER_ALLIANCE_PER_MEMBER_CPS_BOOST = 0.01;
const ALLIANCE_UPGRADE_SELLBACK_LOSS_RATE = 0.30;
const ALLIANCE_UPGRADE_SELLBACK_MULTIPLIER = 1 - ALLIANCE_UPGRADE_SELLBACK_LOSS_RATE;
const ALLIANCE_AD_COST_CREDITS = 3;
const ALLIANCE_AD_DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ALLIANCE_AD_REDUCED_COOLDOWN_MS = 16 * 60 * 60 * 1000;

const AUTOMOD_BLOCKED_WORDS = [
  'nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'cunt', 'whore',
];

function checkAutomod(text) {
  const lower = String(text ?? '').toLowerCase();
  for (const word of AUTOMOD_BLOCKED_WORDS) {
    if (lower.includes(word)) {
      return { ok: false, reason: 'Alliance name contains a blocked word.' };
    }
  }
  return { ok: true, reason: '' };
}

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
    fallbackEmoji: '-',
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
    description: '+2 alliance credits on challenge completion.',
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
    fallbackEmoji: '-',
    effects: { targetMultiplierReduction: 0.08 },
  },
  {
    id: 'victory_drums',
    name: 'Victory Drums',
    description: '+10% challenge reward cookies and +1 alliance credit.',
    cost: 16,
    emojiCandidates: ['Cookie_Clicker', 'achievement'],
    fallbackEmoji: '🥁',
    effects: { rewardMultiplier: 0.1, bonusAllianceCoins: 1 },
  },
  {
    id: 'shared_flour_vault',
    name: 'Shared Flour Vault',
    description: 'Each member earns +5% more cookies per bake while in this alliance.',
    cost: 18,
    emojiCandidates: ['Cookie_dough', 'cookie_dough'],
    fallbackEmoji: '🏛️',
    effects: { bakeBonusMultiplier: 0.05 },
  },
  {
    id: 'master_glazier',
    name: 'Master Glazier',
    description: '-12% weekly challenge target. Precision counts.',
    cost: 20,
    emojiCandidates: ['Builder', 'Augmenter'],
    fallbackEmoji: '🎯',
    effects: { targetMultiplierReduction: 0.12 },
  },
  {
    id: 'golden_rolling_pin',
    name: 'Golden Rolling Pin',
    description: '+25% challenge reward cookies plus +3 alliance credits on completion.',
    cost: 25,
    emojiCandidates: ['Fortune_cookie', 'GoldenCookie'],
    fallbackEmoji: '🥇',
    effects: { rewardMultiplier: 0.25, bonusAllianceCoins: 3 },
  },
  {
    id: 'sugar_syndicate',
    name: 'Sugar Syndicate',
    description: '+8% CPS boost for all members while in an alliance.',
    cost: 30,
    emojiCandidates: ['CookieProduction10', 'Augmenter'],
    fallbackEmoji: '-',
    effects: { allianceCpsBoost: 0.08 },
  },
  {
    id: 'iron_spatula',
    name: 'Iron Spatula',
    description: '-15% weekly challenge target. Toughened bakers need less motivation.',
    cost: 22,
    emojiCandidates: ['hammer_wrench', 'Builder'],
    fallbackEmoji: '-',
    effects: { targetMultiplierReduction: 0.15 },
  },
  {
    id: 'royal_oven_crest',
    name: 'Royal Oven Crest',
    description: '+200,000 flat challenge reward cookies plus +5% bonus.',
    cost: 35,
    emojiCandidates: ['Cookie_Clicker', 'trophy'],
    fallbackEmoji: '👑',
    effects: { flatRewardBonus: 200_000, rewardMultiplier: 0.05 },
  },
  {
    id: 'town_crier_network',
    name: 'Town Crier Network',
    description: 'Reduce alliance ad cooldown from 24h to 16h.',
    cost: 9,
    emojiCandidates: ['International_exchange', 'marketplace', 'announce'],
    fallbackEmoji: '-',
    effects: { adCooldownMs: ALLIANCE_AD_REDUCED_COOLDOWN_MS },
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

function normalizeDescription(description) {
  return String(description ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_ALLIANCE_DESCRIPTION_LENGTH);
}

function findAllianceByName(alliancesById, name) {
  const needle = String(name ?? '').toLowerCase();
  return Object.values(alliancesById ?? {})
    .find((entry) => String(entry?.name ?? '').toLowerCase() === needle) ?? null;
}

function findAllianceByIdOrName(alliances, allianceIdOrName) {
  const value = String(allianceIdOrName ?? '').trim();
  if (!value) return null;
  return alliances?.[value] ?? findAllianceByName(alliances, value);
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

function pickWeeklyChallengeWithOffset(allianceId, challengeRollOffset = 0, ts = Date.now()) {
  if (WEEKLY_ALLIANCE_CHALLENGES.length === 0) return pickWeeklyChallenge(allianceId, ts);
  const offset = Number(challengeRollOffset ?? 0);
  const normalizedIndex = ((weekNumber(ts) + hashAllianceId(allianceId) + offset) % WEEKLY_ALLIANCE_CHALLENGES.length + WEEKLY_ALLIANCE_CHALLENGES.length) % WEEKLY_ALLIANCE_CHALLENGES.length;
  return WEEKLY_ALLIANCE_CHALLENGES[normalizedIndex];
}

function getMemberLifetimeTotals(guildId, memberIds) {
  const economyUsers = economy.getGuildUserStates(guildId);
  const totals = {};
  for (const userId of memberIds) {
    totals[userId] = Number(economyUsers[userId]?.cookiesBakedAllTime ?? 0);
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
  alliance.challengeRollOffset = Number.isFinite(Number(alliance.challengeRollOffset))
    ? Number(alliance.challengeRollOffset)
    : 0;
  alliance.lastAdAt = Number.isFinite(alliance.lastAdAt) ? Math.max(0, Number(alliance.lastAdAt)) : null;
  alliance.description = normalizeDescription(alliance.description);
  pruneOldWeeklyState(alliance);
}

function getAllianceEffectTotals(alliance) {
  const totals = {
    rewardMultiplier: 0,
    flatRewardBonus: 0,
    bonusAllianceCoins: 0,
    targetMultiplierReduction: 0,
    allianceCpsBoost: 0,
    adCooldownMs: ALLIANCE_AD_DEFAULT_COOLDOWN_MS,
  };
  for (const upgradeId of alliance.upgrades ?? []) {
    const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
    if (!upgrade) continue;
    totals.rewardMultiplier += Number(upgrade.effects?.rewardMultiplier ?? 0);
    totals.flatRewardBonus += Number(upgrade.effects?.flatRewardBonus ?? 0);
    totals.bonusAllianceCoins += Number(upgrade.effects?.bonusAllianceCoins ?? 0);
    totals.targetMultiplierReduction += Number(upgrade.effects?.targetMultiplierReduction ?? 0);
    totals.allianceCpsBoost += Number(upgrade.effects?.allianceCpsBoost ?? 0);
    const adCooldownMs = Number(upgrade.effects?.adCooldownMs);
    if (Number.isFinite(adCooldownMs) && adCooldownMs > 0) {
      totals.adCooldownMs = Math.min(totals.adCooldownMs, adCooldownMs);
    }
  }
  totals.targetMultiplierReduction = Math.min(MAX_TARGET_REDUCTION, Math.max(0, totals.targetMultiplierReduction));
  totals.allianceCpsBoost = Math.max(0, totals.allianceCpsBoost);
  return totals;
}

function buildChallengeState(guildId, alliance, ts = Date.now()) {
  ensureAllianceShape(alliance);
  const key = weekKey(ts);
  const challenge = pickWeeklyChallengeWithOffset(alliance.id, alliance.challengeRollOffset, ts);
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

  const automod = checkAutomod(allianceName);
  if (!automod.ok) return { ok: false, reason: automod.reason };

  const userState = economy.getUserSnapshot(guildId, ownerId);
  if (userState.user.cookies < ALLIANCE_CREATE_COST) {
    return { ok: false, reason: `Creating an alliance costs ${economy.toCookieNumber(ALLIANCE_CREATE_COST)} cookies. You do not have enough.` };
  }

  const result = db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    if (guild.userAlliance[ownerId]) return { ok: false, reason: 'You are already in an alliance.' };

    const existing = findAllianceByName(guild.alliances, allianceName);
    if (existing) return { ok: false, reason: 'That alliance name is already taken.' };

    const allianceId = String(guild.nextAllianceId++);
    guild.alliances[allianceId] = {
      id: allianceId,
      name: allianceName,
      description: '',
      ownerId,
      members: [ownerId],
      createdAt: Date.now(),
      challengeWeekly: {},
      challengeRollOffset: 0,
      upgrades: [],
      storeCredits: 0,
      joinApprovalEnabled: false,
      joinRequests: [],
      lastAdAt: null,
    };
    guild.userAlliance[ownerId] = allianceId;
    return { ok: true, alliance: guild.alliances[allianceId] };
  });

  if (result.ok) {
    economy.adminGiveCookies(guildId, ownerId, -ALLIANCE_CREATE_COST);
    economy.addPendingMessage(guildId, ownerId, {
      type: 'alliance_notification',
      content: `You created alliance **${result.alliance.name}**.`,
    });
  }

  return result;
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

  const result = db.update(ALLIANCES_FILE, {}, (data) => {
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

  if (result.ok && !result.pendingApproval) {
    economy.addPendingMessage(guildId, userId, {
      type: 'alliance_notification',
      content: `You joined alliance **${result.alliance.name}**.`,
    });
    refreshGuildAllianceBoosts(guildId);
  }

  if (result.ok && result.pendingApproval) {
    economy.addPendingMessage(guildId, userId, {
      type: 'alliance_notification',
      notificationType: 'alliance_join_request_sent',
      notificationKey: `alliance_join_request:${result.alliance.id}:${userId}`,
      content: `Your join request to **${result.alliance.name}** was sent to the alliance owner.`,
    });
    economy.addPendingMessage(guildId, result.alliance.ownerId, {
      type: 'alliance_notification',
      notificationType: 'alliance_join_request_new',
      notificationKey: `alliance_join_request_owner:${result.alliance.id}:${userId}`,
      content: `<@${userId}> requested to join **${result.alliance.name}**.`,
    });
  }

  return result;
}

function leaveAlliance(guildId, userId) {
  const result = db.update(ALLIANCES_FILE, {}, (data) => {
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

    let newOwnerId = null;
    if (alliance.ownerId === userId && alliance.members.length > 0) {
      alliance.ownerId = alliance.members[0];
      newOwnerId = alliance.members[0];
    }

    if (alliance.members.length === 0) {
      delete guild.alliances[alliance.id];
    }

    return { ok: true, alliance, newOwnerId };
  });

  if (result.ok) {
    economy.addPendingMessage(guildId, userId, {
      type: 'alliance_notification',
      content: `You left alliance **${result.alliance.name}**.`,
    });
    if (result.newOwnerId) {
      economy.addPendingMessage(guildId, result.newOwnerId, {
        type: 'alliance_notification',
        content: `You are now the owner of **${result.alliance.name}** because the previous owner left.`,
      });
    }
    refreshGuildAllianceBoosts(guildId);
  }

  return result;
}

function renameAlliance(guildId, actorId, newName) {
  const cleanName = normalizeName(newName);
  const sanitized = economy.sanitizeBakeryName(cleanName);
  if (!sanitized.ok) return { ok: false, reason: sanitized.reason };
  const allianceName = sanitized.value.slice(0, 40);
  if (!allianceName) return { ok: false, reason: 'Alliance name cannot be empty.' };

  const automod = checkAutomod(allianceName);
  if (!automod.ok) return { ok: false, reason: automod.reason };

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

function setAllianceDescription(guildId, actorId, description) {
  const cleanDescription = normalizeDescription(description);
  if (cleanDescription) {
    const automod = checkAutomod(cleanDescription);
    if (!automod.ok) {
      return { ok: false, reason: 'Alliance description contains a blocked word.' };
    }
  }

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can edit the alliance description.' };
    alliance.description = cleanDescription;
    return { ok: true, alliance };
  });
}

function transferAllianceOwnership(guildId, actorId, targetUserId) {
  const result = db.update(ALLIANCES_FILE, {}, (data) => {
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

  if (result.ok) {
    economy.addPendingMessage(guildId, targetUserId, {
      type: 'alliance_notification',
      content: `You are now the owner of **${result.alliance.name}**. <@${actorId}> transferred ownership to you.`,
    });
    economy.addPendingMessage(guildId, actorId, {
      type: 'alliance_notification',
      content: `You transferred ownership of **${result.alliance.name}** to <@${targetUserId}>.`,
    });
  }

  return result;
}

function removeAllianceMember(guildId, actorId, targetUserId, reason = '') {
  const result = db.update(ALLIANCES_FILE, {}, (data) => {
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
    return { ok: true, alliance, targetUserId };
  });

  if (result.ok) {
    const reasonText = reason ? ` **Reason:** ${reason}` : '';
    economy.addPendingMessage(guildId, result.targetUserId, {
      type: 'alliance_notification',
      content: `You were kicked from alliance **${result.alliance.name}**.${reasonText}`,
    });
    refreshGuildAllianceBoosts(guildId);
  }

  return result;
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
  const result = db.update(ALLIANCES_FILE, {}, (data) => {
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

  if (result.ok && result.approved) {
    economy.addPendingMessage(guildId, targetUserId, {
      type: 'alliance_notification',
      notificationType: 'alliance_join_request_approved',
      content: `Your join request to **${result.alliance.name}** was approved! Welcome to the alliance.`,
    });
    economy.addPendingMessage(guildId, actorId, {
      type: 'alliance_notification',
      notificationType: 'alliance_join_request_owner_approved',
      content: `You approved <@${targetUserId}> to join **${result.alliance.name}**.`,
    });
    refreshGuildAllianceBoosts(guildId);
  }
  if (result.ok && !result.approved) {
    economy.addPendingMessage(guildId, targetUserId, {
      type: 'alliance_notification',
      notificationType: 'alliance_join_request_denied',
      content: `Your join request to **${result.alliance.name}** was denied.`,
    });
    economy.addPendingMessage(guildId, actorId, {
      type: 'alliance_notification',
      notificationType: 'alliance_join_request_owner_denied',
      content: `You denied <@${targetUserId}>'s request to join **${result.alliance.name}**.`,
    });
  }

  return result;
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

const ALLIANCE_RANK_BOOSTS = [0.10, 0.05, 0.03];

function getAllianceRankBoosts(guildId, userId) {
  const leaderboard = getAllianceLeaderboard(guildId);
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  const allianceId = guild?.userAlliance?.[userId];
  if (!allianceId) return { rank: null, cpsBoostMultiplier: 0 };
  const rank = leaderboard.findIndex((entry) => entry.id === allianceId);
  if (rank < 0 || rank >= ALLIANCE_RANK_BOOSTS.length) return { rank: rank + 1 || null, cpsBoostMultiplier: 0 };
  return { rank: rank + 1, cpsBoostMultiplier: ALLIANCE_RANK_BOOSTS[rank] };
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
        lastAdAt: alliance.lastAdAt,
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

  // Cache CPS boosts for all members (rank + store + alliance booster count scaling).
  if (result.alliance) {
    const rankBoost = getAllianceRankBoosts(guildId, userId);
    const upgradeBoost = (result.alliance.upgrades ?? []).reduce((sum, upgradeId) => {
      const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
      return sum + Math.max(0, Number(upgrade?.effects?.allianceCpsBoost ?? 0));
    }, 0);
    const economyUsers = economy.getGuildUserStates(guildId);
    const boosterCount = (result.alliance.members ?? []).reduce((count, memberId) => {
      return count + (economyUsers?.[memberId]?.isServerBooster ? 1 : 0);
    }, 0);
    const allianceBoosterBoost = boosterCount * BOOSTER_ALLIANCE_PER_MEMBER_CPS_BOOST;
    const baseAllianceBoost = rankBoost.cpsBoostMultiplier + upgradeBoost + allianceBoosterBoost;
    const boosts = (result.alliance.members ?? []).map((memberId) => {
      const memberBoosterBoost = economyUsers?.[memberId]?.isServerBooster ? BOOSTER_PERSONAL_CPS_BOOST : 0;
      return {
        userId: memberId,
        boost: baseAllianceBoost,
        details: {
          allianceName: result.alliance.name,
          rankBoost: rankBoost.cpsBoostMultiplier,
          rankPosition: rankBoost.rank ?? 0,
          upgradeBoost,
          allianceBoosterCount: boosterCount,
          allianceBoosterBoost,
          personalBoosterBoost: memberBoosterBoost,
          totalAllianceBoost: baseAllianceBoost,
        },
      };
    });
    economy.setAllianceCpsBoostBatch(guildId, boosts);
    result.allianceRankBoost = rankBoost;
    result.allianceBoosterBoost = {
      boosterCount,
      perBoosterBoost: BOOSTER_ALLIANCE_PER_MEMBER_CPS_BOOST,
      allianceWideBoost: allianceBoosterBoost,
      personalBoosterBoost: economyUsers?.[userId]?.isServerBooster ? BOOSTER_PERSONAL_CPS_BOOST : 0,
    };
  } else {
    economy.setUserAllianceCpsBoost(guildId, userId, 0);
  }

  return result;
}

function refreshGuildAllianceBoosts(guildId) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  const alliancesById = guild?.alliances ?? {};
  const membersInAlliance = new Set();

  for (const alliance of Object.values(alliancesById)) {
    ensureAllianceShape(alliance);
    for (const memberId of alliance.members ?? []) membersInAlliance.add(memberId);
    const seedUserId = alliance.members.includes(alliance.ownerId) ? alliance.ownerId : alliance.members[0];
    if (!seedUserId) continue;
    getAllianceWithChallenge(guildId, seedUserId);
  }

  const trackedUserIds = economy.getAllTrackedUserIds(guildId);
  const usersWithoutAlliance = trackedUserIds
    .map((id) => String(id))
    .filter((userId) => !membersInAlliance.has(userId));
  if (usersWithoutAlliance.length > 0) {
    economy.setAllianceCpsBoostBatch(
      guildId,
      usersWithoutAlliance.map((userId) => ({
        userId,
        boost: 0,
        details: {
          allianceName: null,
          rankBoost: 0,
          rankPosition: 0,
          upgradeBoost: 0,
          allianceBoosterCount: 0,
          allianceBoosterBoost: 0,
          personalBoosterBoost: 0,
          totalAllianceBoost: 0,
        },
      })),
    );
  }
}

function processAllianceChallengeRewards() {
  const notices = [];
  db.update(ALLIANCES_FILE, {}, (data) => {
    for (const [guildId, guild] of Object.entries(data ?? {})) {
      const alliancesById = guild?.alliances ?? {};
      for (const alliance of Object.values(alliancesById)) {
        ensureAllianceShape(alliance);
        const challengeState = buildChallengeState(guildId, alliance, Date.now());
        const rewardGrant = maybeGrantChallengeReward(guildId, alliance, challengeState, Date.now());
        if (!rewardGrant) continue;
        challengeState.rewarded = true;
        challengeState.rewardedAt = Date.now();
        for (const memberId of rewardGrant.members) {
          economy.adminGiveCookies(guildId, memberId, rewardGrant.rewardCookiesPerMember);
        }
        notices.push({
          guildId,
          allianceName: alliance.name,
          challengeName: challengeState.challenge?.name ?? 'Weekly Challenge',
          memberIds: [...rewardGrant.members],
          rewardCookiesPerMember: rewardGrant.rewardCookiesPerMember,
          rewardAllianceCoins: rewardGrant.rewardAllianceCoins,
        });
      }
    }
  });
  return notices;
}

function buyAllianceUpgrade(guildId, actorId, upgradeId) {
  const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown alliance store upgrade.' };

  const result = db.update(ALLIANCES_FILE, {}, (data) => {
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
  if (result.ok) refreshGuildAllianceBoosts(guildId);
  return result;
}

function sellAllianceUpgrade(guildId, actorId, upgradeId) {
  const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown alliance store upgrade.' };
  const refund = Math.max(0, Math.floor(Number(upgrade.cost ?? 0) * ALLIANCE_UPGRADE_SELLBACK_MULTIPLIER));

  const result = db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId] ?? null;
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    ensureAllianceShape(alliance);
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can sell alliance upgrades.' };
    if (!alliance.upgrades.includes(upgrade.id)) return { ok: false, reason: 'That upgrade is not currently owned.' };
    alliance.upgrades = alliance.upgrades.filter((id) => id !== upgrade.id);
    alliance.storeCredits = Math.max(0, Number(alliance.storeCredits ?? 0)) + refund;
    return { ok: true, alliance, upgrade, refund };
  });
  if (result.ok) refreshGuildAllianceBoosts(guildId);
  return result;
}

function adminGrantAllianceUpgrade(guildId, allianceIdOrName, upgradeId) {
  const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown alliance store upgrade.' };

  const result = db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const alliance = findAllianceByIdOrName(guild.alliances, allianceIdOrName);
    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    ensureAllianceShape(alliance);
    if (alliance.upgrades.includes(upgradeId)) return { ok: false, reason: 'That alliance already has this upgrade.' };
    alliance.upgrades.push(upgradeId);
    alliance.upgrades = [...new Set(alliance.upgrades)];
    return { ok: true, alliance, upgrade };
  });
  if (result.ok) refreshGuildAllianceBoosts(guildId);
  return result;
}

function adminRevokeAllianceUpgrade(guildId, allianceIdOrName, upgradeId) {
  const upgrade = STORE_UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown alliance store upgrade.' };

  const result = db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const alliance = findAllianceByIdOrName(guild.alliances, allianceIdOrName);
    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    ensureAllianceShape(alliance);
    if (!alliance.upgrades.includes(upgradeId)) return { ok: false, reason: 'That alliance does not have this upgrade.' };
    alliance.upgrades = alliance.upgrades.filter((id) => id !== upgradeId);
    return { ok: true, alliance, upgrade };
  });
  if (result.ok) refreshGuildAllianceBoosts(guildId);
  return result;
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
    delete guild.alliances[alliance.id];
    return { ok: true, allianceId: alliance.id, allianceName: alliance.name, memberCount: alliance.members?.length ?? 0 };
  });
}

function adminAdjustAlliancePoints(guildId, allianceIdOrName, delta) {
  const parsedDelta = Number.parseInt(delta, 10);
  if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
    return { ok: false, reason: 'Delta must be a non-zero integer.' };
  }
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const alliance = findAllianceByIdOrName(guild.alliances, allianceIdOrName);
    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    ensureAllianceShape(alliance);
    alliance.storeCredits = Math.max(0, Number(alliance.storeCredits ?? 0) + parsedDelta);
    return {
      ok: true,
      allianceId: alliance.id,
      allianceName: alliance.name,
      points: alliance.storeCredits,
      delta: parsedDelta,
    };
  });
}

function adminForceRotateAllianceChallenges(guildId, ts = Date.now()) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const alliancesById = guild.alliances ?? {};
    const currentWeekKey = weekKey(ts);
    const rotated = [];
    for (const alliance of Object.values(alliancesById)) {
      ensureAllianceShape(alliance);
      alliance.challengeRollOffset = Number(alliance.challengeRollOffset ?? 0) + 1;
      if (alliance.challengeWeekly?.[currentWeekKey]) {
        delete alliance.challengeWeekly[currentWeekKey];
      }
      const state = buildChallengeState(guildId, alliance, ts);
      rotated.push({
        allianceId: alliance.id,
        allianceName: alliance.name,
        challengeName: state.challenge.name,
      });
    }
    return { ok: true, rotated };
  });
}

function getAllianceAdCooldownMs(alliance) {
  ensureAllianceShape(alliance);
  return getAllianceEffectTotals(alliance).adCooldownMs;
}

function getAllianceAdStatus(guildId, actorId, nowTs = Date.now()) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = getGuildState(data, guildId);
  const allianceId = guild.userAlliance?.[actorId];
  if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
  const alliance = guild.alliances?.[allianceId];
  if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
  ensureAllianceShape(alliance);
  if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can post alliance ads.' };
  const cooldownMs = getAllianceAdCooldownMs(alliance);
  const lastAdAt = Number(alliance.lastAdAt ?? 0);
  const nextAvailableAt = lastAdAt > 0 ? lastAdAt + cooldownMs : 0;
  const remainingMs = Math.max(0, nextAvailableAt - nowTs);
  return {
    ok: true,
    alliance,
    cooldownMs,
    nextAvailableAt,
    remainingMs,
    canPost: remainingMs <= 0,
    costCredits: ALLIANCE_AD_COST_CREDITS,
  };
}

function spendAllianceAdCredits(guildId, actorId, nowTs = Date.now()) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[actorId];
    if (!allianceId) return { ok: false, reason: 'You are not in an alliance.' };
    const alliance = guild.alliances?.[allianceId];
    if (!alliance) return { ok: false, reason: 'Alliance no longer exists.' };
    ensureAllianceShape(alliance);
    if (alliance.ownerId !== actorId) return { ok: false, reason: 'Only the alliance owner can post alliance ads.' };
    const cooldownMs = getAllianceAdCooldownMs(alliance);
    const lastAdAt = Number(alliance.lastAdAt ?? 0);
    const nextAvailableAt = lastAdAt > 0 ? lastAdAt + cooldownMs : 0;
    const remainingMs = Math.max(0, nextAvailableAt - nowTs);
    if (remainingMs > 0) return { ok: false, reason: 'Alliance ad cooldown is still active.', remainingMs, nextAvailableAt };
    if (alliance.storeCredits < ALLIANCE_AD_COST_CREDITS) {
      return { ok: false, reason: `Not enough alliance credits. Need ${ALLIANCE_AD_COST_CREDITS}.` };
    }
    alliance.storeCredits -= ALLIANCE_AD_COST_CREDITS;
    alliance.lastAdAt = nowTs;
    return {
      ok: true,
      alliance,
      spentCredits: ALLIANCE_AD_COST_CREDITS,
      cooldownMs,
      nextAvailableAt: nowTs + cooldownMs,
    };
  });
}

module.exports = {
  MAX_ALLIANCE_MEMBERS,
  ALLIANCE_CREATE_COST,
  ALLIANCE_AD_COST_CREDITS,
  ALLIANCE_AD_DEFAULT_COOLDOWN_MS,
  ALLIANCE_AD_REDUCED_COOLDOWN_MS,
  MAX_ALLIANCE_DESCRIPTION_LENGTH,
  ALLIANCE_UPGRADE_SELLBACK_LOSS_RATE,
  ALLIANCE_UPGRADE_SELLBACK_MULTIPLIER,
  WEEKLY_ALLIANCE_CHALLENGES,
  ALLIANCE_STORE_UPGRADES,
  ALLIANCE_RANK_BOOSTS,
  checkAutomod,
  createAlliance,
  listAlliances,
  joinAlliance,
  leaveAlliance,
  renameAlliance,
  setAllianceDescription,
  transferAllianceOwnership,
  removeAllianceMember,
  getMemberAlliance,
  getAllianceLeaderboard,
  getAllianceRankBoosts,
  getAllianceWithChallenge,
  processAllianceChallengeRewards,
  buyAllianceUpgrade,
  sellAllianceUpgrade,
  setAllianceJoinApproval,
  resolveAllianceJoinRequest,
  getAllianceAdStatus,
  spendAllianceAdCredits,
  adminGrantAllianceUpgrade,
  adminRevokeAllianceUpgrade,
  adminDeleteAlliance,
  adminAdjustAlliancePoints,
  adminForceRotateAllianceChallenges,
};
