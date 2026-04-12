'use strict';

const db = require('./database');
const economy = require('./bakeEconomy');

const ALLIANCES_FILE = 'bake_alliances.json';
const MAX_ALLIANCE_MEMBERS = 10;
const WEEKLY_TARGET_COOKIES = 1_000_000;

function weekKey(ts = Date.now()) {
  return `wk-${Math.floor(ts / (7 * 86_400_000))}`;
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

function createAlliance(guildId, ownerId, name) {
  const cleanName = normalizeName(name);
  if (!cleanName) return { ok: false, reason: 'Alliance name cannot be empty.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    if (guild.userAlliance[ownerId]) return { ok: false, reason: 'You are already in an alliance.' };

    const existing = Object.values(guild.alliances).find((entry) => entry.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) return { ok: false, reason: 'That alliance name is already taken.' };

    const allianceId = String(guild.nextAllianceId++);
    guild.alliances[allianceId] = {
      id: allianceId,
      name: cleanName,
      ownerId,
      members: [ownerId],
      createdAt: Date.now(),
      challengeBaseline: {},
    };
    guild.userAlliance[ownerId] = allianceId;

    return { ok: true, alliance: guild.alliances[allianceId] };
  });
}

function joinAlliance(guildId, userId, allianceIdOrName) {
  const value = String(allianceIdOrName ?? '').trim();
  if (!value) return { ok: false, reason: 'Alliance identifier is required.' };

  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    if (guild.userAlliance[userId]) return { ok: false, reason: 'You are already in an alliance.' };

    const alliance = guild.alliances[value]
      || Object.values(guild.alliances).find((entry) => entry.name.toLowerCase() === value.toLowerCase());

    if (!alliance) return { ok: false, reason: 'Alliance not found.' };
    if ((alliance.members ?? []).length >= MAX_ALLIANCE_MEMBERS) {
      return { ok: false, reason: `Alliance is full (max ${MAX_ALLIANCE_MEMBERS} members).` };
    }

    alliance.members.push(userId);
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

    alliance.members = (alliance.members ?? []).filter((memberId) => memberId !== userId);
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

function getMemberAlliance(guildId, userId) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  if (!guild) return null;
  const allianceId = guild.userAlliance?.[userId];
  if (!allianceId) return null;
  return guild.alliances?.[allianceId] ?? null;
}

function getAllianceLeaderboard(guildId) {
  const data = db.read(ALLIANCES_FILE, {});
  const guild = data[guildId];
  if (!guild) return [];

  const entries = Object.values(guild.alliances ?? {}).map((alliance) => {
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

function getAllianceChallengeProgress(guildId, alliance) {
  const key = weekKey(Date.now());
  const baseline = alliance.challengeBaseline?.[key] ?? 0;
  const currentTotal = (alliance.members ?? []).reduce((sum, userId) => {
    const snapshot = economy.getUserSnapshot(guildId, userId);
    return sum + Number(snapshot.user.cookiesBakedAllTime ?? 0);
  }, 0);

  if (!alliance.challengeBaseline || typeof alliance.challengeBaseline !== 'object') {
    alliance.challengeBaseline = {};
  }
  if (!Object.prototype.hasOwnProperty.call(alliance.challengeBaseline, key)) {
    alliance.challengeBaseline[key] = currentTotal;
  }

  return {
    key,
    progress: Math.max(0, currentTotal - alliance.challengeBaseline[key]),
    target: WEEKLY_TARGET_COOKIES,
  };
}

function getAllianceWithChallenge(guildId, userId) {
  return db.update(ALLIANCES_FILE, {}, (data) => {
    const guild = getGuildState(data, guildId);
    const allianceId = guild.userAlliance?.[userId];
    if (!allianceId) return { alliance: null, challenge: null };
    const alliance = guild.alliances?.[allianceId] ?? null;
    if (!alliance) return { alliance: null, challenge: null };
    const challenge = getAllianceChallengeProgress(guildId, alliance);
    return { alliance, challenge };
  });
}

module.exports = {
  MAX_ALLIANCE_MEMBERS,
  createAlliance,
  joinAlliance,
  leaveAlliance,
  getMemberAlliance,
  getAllianceLeaderboard,
  getAllianceWithChallenge,
};
