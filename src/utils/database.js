'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/** Ensure a JSON data file exists, seeding it with `defaultValue` if not. */
function ensureFile(filename, defaultValue = {}) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
  return filepath;
}

/** Read a JSON data file. */
function read(filename, defaultValue = {}) {
  const filepath = ensureFile(filename, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

/** Write a value to a JSON data file. */
function write(filename, value) {
  const filepath = ensureFile(filename);
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2), 'utf8');
}

// ─── Warnings ────────────────────────────────────────────────────────────────

const WARNINGS_FILE = 'warnings.json';

/**
 * Add a warning for a user in a guild.
 * @returns {object[]} The user's updated warnings array.
 */
function addWarning(guildId, userId, { moderatorId, reason }) {
  const data = read(WARNINGS_FILE, {});
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = [];
  data[guildId][userId].push({
    id: Date.now(),
    moderatorId,
    reason,
    timestamp: new Date().toISOString(),
  });
  write(WARNINGS_FILE, data);
  return data[guildId][userId];
}

/** Get all warnings for a user in a guild. */
function getWarnings(guildId, userId) {
  const data = read(WARNINGS_FILE, {});
  return data?.[guildId]?.[userId] ?? [];
}

/** Clear all warnings for a user in a guild. */
function clearWarnings(guildId, userId) {
  const data = read(WARNINGS_FILE, {});
  if (data?.[guildId]) {
    data[guildId][userId] = [];
    write(WARNINGS_FILE, data);
  }
}

// ─── Shifts ──────────────────────────────────────────────────────────────────

const SHIFTS_FILE = 'shifts.json';

/** Start a shift for a user. Returns null if already on shift. */
function startShift(guildId, userId, username) {
  const data = read(SHIFTS_FILE, {});
  if (!data[guildId]) data[guildId] = { active: {}, history: [] };

  if (data[guildId].active[userId]) return null; // already on shift

  data[guildId].active[userId] = {
    userId,
    username,
    startedAt: new Date().toISOString(),
  };
  write(SHIFTS_FILE, data);
  return data[guildId].active[userId];
}

/** End a shift for a user. Returns the completed shift record or null. */
function endShift(guildId, userId) {
  const data = read(SHIFTS_FILE, {});
  if (!data[guildId]?.active?.[userId]) return null; // not on shift

  const active = data[guildId].active[userId];
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt) - new Date(active.startedAt);

  const record = {
    userId: active.userId,
    username: active.username,
    startedAt: active.startedAt,
    endedAt,
    durationMs,
  };

  delete data[guildId].active[userId];
  data[guildId].history.push(record);
  write(SHIFTS_FILE, data);
  return record;
}

/** Get the active shift for a user, or null. */
function getActiveShift(guildId, userId) {
  const data = read(SHIFTS_FILE, {});
  return data?.[guildId]?.active?.[userId] ?? null;
}

/** Get all completed shifts for a user in a guild. */
function getUserShiftHistory(guildId, userId) {
  const data = read(SHIFTS_FILE, {});
  return (data?.[guildId]?.history ?? []).filter((s) => s.userId === userId);
}

/** Get all active shifts in a guild. */
function getAllActiveShifts(guildId) {
  const data = read(SHIFTS_FILE, {});
  return Object.values(data?.[guildId]?.active ?? {});
}

/**
 * Build a shift leaderboard for a guild.
 * Returns an array of { userId, username, totalMs, shiftCount } sorted by totalMs desc.
 */
function getShiftLeaderboard(guildId) {
  const data = read(SHIFTS_FILE, {});
  const history = data?.[guildId]?.history ?? [];

  const totals = {};
  for (const s of history) {
    if (!totals[s.userId]) totals[s.userId] = { userId: s.userId, username: s.username, totalMs: 0, shiftCount: 0 };
    totals[s.userId].totalMs += s.durationMs;
    totals[s.userId].shiftCount += 1;
  }

  return Object.values(totals).sort((a, b) => b.totalMs - a.totalMs);
}

module.exports = {
  read,
  write,
  addWarning,
  getWarnings,
  clearWarnings,
  startShift,
  endShift,
  getActiveShift,
  getUserShiftHistory,
  getAllActiveShifts,
  getShiftLeaderboard,
};
