'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHIFT_ID_MIN = 1;

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

function writeAtomic(filepath, content) {
  const dir = path.dirname(filepath);
  const tempPath = path.join(
    dir,
    `.${path.basename(filepath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filepath);
}

/** Write a value to a JSON data file. */
function write(filename, value) {
  const filepath = ensureFile(filename);
  writeAtomic(filepath, JSON.stringify(value, null, 2));
}

/**
 * Atomically update a JSON data file in one read-modify-write pass.
 * @param {string} filename
 * @param {*} defaultValue
 * @param {(data:any)=>any} updater
 * @returns {*}
 */
function update(filename, defaultValue = {}, updater) {
  const filepath = ensureFile(filename, defaultValue);
  let originalContent = '';
  let data;
  try {
    originalContent = fs.readFileSync(filepath, 'utf8');
    data = JSON.parse(originalContent);
  } catch {
    data = defaultValue;
    originalContent = JSON.stringify(defaultValue, null, 2);
  }
  const result = updater(data);
  const nextContent = JSON.stringify(data, null, 2);
  if (nextContent !== originalContent) {
    writeAtomic(filepath, nextContent);
  }
  return result;
}

// ─── Warnings ────────────────────────────────────────────────────────────────

const WARNINGS_FILE = 'warnings.json';

/**
 * Add a warning for a user in a guild.
 * @returns {object[]} The user's updated warnings array.
 */
function addWarning(guildId, userId, { moderatorId, reason }) {
  return update(WARNINGS_FILE, {}, (data) => {
    if (!data[guildId]) data[guildId] = {};
    if (!data[guildId][userId]) data[guildId][userId] = [];
    data[guildId][userId].push({
      id: Date.now(),
      moderatorId,
      reason,
      timestamp: new Date().toISOString(),
    });
    return data[guildId][userId];
  });
}

/** Get all warnings for a user in a guild. */
function getWarnings(guildId, userId) {
  const data = read(WARNINGS_FILE, {});
  return data?.[guildId]?.[userId] ?? [];
}

/** Clear all warnings for a user in a guild. */
function clearWarnings(guildId, userId) {
  update(WARNINGS_FILE, {}, (data) => {
    if (data?.[guildId]) data[guildId][userId] = [];
  });
}

// ─── Shifts ──────────────────────────────────────────────────────────────────

const SHIFTS_FILE = 'shifts.json';
const MIN_SHIFT_DURATION_MS = 1000;
/**
 * Generate a unique numeric shift record id within a guild history.
 * @param {object} data
 * @param {string} guildId
 * @returns {number}
 */
function generateUniqueShiftId(data, guildId) {
  const guild = data?.[guildId];
  const used = new Set((guild?.history ?? []).map((s) => s.id).filter((id) => Number.isInteger(id) && id >= SHIFT_ID_MIN));
  let id = Number.isInteger(guild?.nextShiftId) && guild.nextShiftId >= SHIFT_ID_MIN
    ? guild.nextShiftId
    : SHIFT_ID_MIN;
  while (used.has(id)) id += 1;
  if (guild) guild.nextShiftId = id + 1;
  return id;
}

/** Ensure completed shift records have numeric ids. */
function ensureShiftHistoryIds(data, guildId) {
  if (!data?.[guildId]?.history) return;
  let changed = false;
  if (!Number.isInteger(data[guildId].nextShiftId) || data[guildId].nextShiftId < SHIFT_ID_MIN) {
    data[guildId].nextShiftId = SHIFT_ID_MIN;
    changed = true;
  }
  for (const s of data[guildId].history) {
    if (!Number.isInteger(s.id) || s.id < SHIFT_ID_MIN) {
      s.id = generateUniqueShiftId(data, guildId);
      changed = true;
    } else if (s.id >= data[guildId].nextShiftId) {
      data[guildId].nextShiftId = s.id + 1;
      changed = true;
    }
  }
  if (changed) write(SHIFTS_FILE, data);
}

/** Start a shift for a user. Returns null if already on shift. */
function startShift(guildId, userId, username) {
  const data = read(SHIFTS_FILE, {});
  if (!data[guildId]) data[guildId] = { active: {}, history: [], nextShiftId: SHIFT_ID_MIN };
  ensureShiftHistoryIds(data, guildId);

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
  ensureShiftHistoryIds(data, guildId);

  const active = data[guildId].active[userId];
  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    MIN_SHIFT_DURATION_MS,
    new Date(endedAt) - new Date(active.startedAt),
  );

  const record = {
    id: generateUniqueShiftId(data, guildId),
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
  ensureShiftHistoryIds(data, guildId);
  return (data?.[guildId]?.history ?? []).filter((s) => s.userId === userId);
}

/** Get all completed shifts for a guild. */
function getGuildShiftHistory(guildId) {
  const data = read(SHIFTS_FILE, {});
  ensureShiftHistoryIds(data, guildId);
  return data?.[guildId]?.history ?? [];
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
  ensureShiftHistoryIds(data, guildId);
  const history = data?.[guildId]?.history ?? [];

  const totals = {};
  for (const s of history) {
    if (!totals[s.userId]) totals[s.userId] = { userId: s.userId, username: s.username, totalMs: 0, shiftCount: 0 };
    totals[s.userId].totalMs += s.durationMs;
    totals[s.userId].shiftCount += 1;
  }

  return Object.values(totals).sort((a, b) => b.totalMs - a.totalMs);
}

// ─── Preset Reasons ──────────────────────────────────────────────────────────

const REASONS_FILE = 'reasons.json';

/** Get all preset reasons for a guild and action type ('ban'|'kick'|'warn'). */
function getPresetReasons(guildId, type) {
  const data = read(REASONS_FILE, {});
  return data?.[guildId]?.[type] ?? [];
}

/**
 * Add a preset reason. Returns the created entry { id, reason }.
 * @param {string} guildId
 * @param {'ban'|'kick'|'warn'} type
 * @param {string} reason
 */
function addPresetReason(guildId, type, reason) {
  return update(REASONS_FILE, {}, (data) => {
    if (!data[guildId]) data[guildId] = {};
    if (!data[guildId][type]) data[guildId][type] = [];
    const entry = { id: Date.now(), reason };
    data[guildId][type].push(entry);
    return entry;
  });
}

/**
 * Remove a preset reason by its numeric id. Returns true if removed.
 * @param {string} guildId
 * @param {'ban'|'kick'|'warn'} type
 * @param {number} id
 */
function removePresetReason(guildId, type, id) {
  return update(REASONS_FILE, {}, (data) => {
    if (!data?.[guildId]?.[type]) return false;
    const before = data[guildId][type].length;
    data[guildId][type] = data[guildId][type].filter((r) => r.id !== id);
    return data[guildId][type].length < before;
  });
}

// ─── Wave Tracking ───────────────────────────────────────────────────────────

const WAVES_FILE = 'waves.json';

/**
 * Get the current wave for a guild, or null if none started.
 * @param {string} guildId
 * @returns {{ waveNumber: number, startedAt: string, startedBy: string }|null}
 */
function getCurrentWave(guildId) {
  const data = read(WAVES_FILE, {});
  return data[guildId] ?? null;
}

/**
 * Start a new wave for a guild.
 * @param {string} guildId
 * @param {string} startedBy  userId of the admin who started the wave
 */
function startWave(guildId, startedBy) {
  return update(WAVES_FILE, {}, (data) => {
    const waveNumber = (data[guildId]?.waveNumber ?? 0) + 1;
    data[guildId] = { waveNumber, startedAt: new Date().toISOString(), startedBy };
    return data[guildId];
  });
}

/**
 * Get all completed shift history records for a guild since the current wave started.
 * If no wave is active, returns the full history.
 * @param {string} guildId
 * @returns {object[]}
 */
function getShiftsInCurrentWave(guildId) {
  const shifts = read(SHIFTS_FILE, {});
  ensureShiftHistoryIds(shifts, guildId);
  const history = shifts?.[guildId]?.history ?? [];
  const wave = getCurrentWave(guildId);
  if (!wave) return history;
  const since = new Date(wave.startedAt).getTime();
  return history.filter((s) => new Date(s.startedAt).getTime() >= since);
}

/**
 * Get total shift time (ms) for a user in the current wave.
 * @param {string} guildId
 * @param {string} userId
 * @returns {number}
 */
function getUserShiftTimeInWave(guildId, userId) {
  return getShiftsInCurrentWave(guildId)
    .filter((s) => s.userId === userId)
    .reduce((sum, s) => sum + s.durationMs, 0);
}

/**
 * Update a completed shift record.
 * @param {string} guildId
 * @param {number} recordId
 * @param {{durationMs?: number}} updates
 * @returns {object|null}
 */
function updateShiftRecord(guildId, recordId, updates) {
  return update(SHIFTS_FILE, {}, (data) => {
    ensureShiftHistoryIds(data, guildId);
    const history = data?.[guildId]?.history;
    if (!history) return null;

    const idx = history.findIndex((s) => s.id === recordId);
    if (idx === -1) return null;

    const existing = history[idx];
    if (typeof updates.durationMs === 'number') {
      const durationMs = Math.max(MIN_SHIFT_DURATION_MS, Math.floor(updates.durationMs));
      const endedAt = new Date(new Date(existing.startedAt).getTime() + durationMs).toISOString();
      existing.durationMs = durationMs;
      existing.endedAt = endedAt;
    }

    history[idx] = existing;
    return existing;
  });
}

/**
 * Delete a completed shift record.
 * @param {string} guildId
 * @param {number} recordId
 * @returns {boolean}
 */
function deleteShiftRecord(guildId, recordId) {
  return update(SHIFTS_FILE, {}, (data) => {
    ensureShiftHistoryIds(data, guildId);
    const history = data?.[guildId]?.history;
    if (!history) return false;

    const before = history.length;
    data[guildId].history = history.filter((s) => s.id !== recordId);
    return data[guildId].history.length < before;
  });
}

// ─── Server Config ───────────────────────────────────────────────────────────

const CONFIG_FILE = 'config.json';

/**
 * Get the config object for a guild.
 * @param {string} guildId
 * @returns {object}
 */
function getConfig(guildId) {
  const data = read(CONFIG_FILE, {});
  return data[guildId] ?? {};
}

/**
 * Set a single config key for a guild.
 * @param {string} guildId
 * @param {string} key
 * @param {*} value
 */
function setConfig(guildId, key, value) {
  update(CONFIG_FILE, {}, (data) => {
    if (!data[guildId]) data[guildId] = {};
    data[guildId][key] = value;
  });
}

/**
 * Delete a single config key for a guild.
 * @param {string} guildId
 * @param {string} key
 */
function deleteConfig(guildId, key) {
  update(CONFIG_FILE, {}, (data) => {
    if (data[guildId]) delete data[guildId][key];
  });
}

// ─── Automod Config ───────────────────────────────────────────────────────────

const AUTOMOD_FILE = 'automod.json';

/**
 * Get the full automod config for a guild.
 * @param {string} guildId
 * @returns {object}
 */
function getAutomodConfig(guildId) {
  const data = read(AUTOMOD_FILE, {});
  return (
    data[guildId] ?? {
      enabled: false,
      categories: { profanity: false },
      punishment: 'delete',
      timeoutDuration: 300000, // 5 minutes default
      logChannelId: null,
      exemptRoles: [],
    }
  );
}

/**
 * Save the full automod config for a guild.
 * @param {string} guildId
 * @param {object} config
 */
function setAutomodConfig(guildId, config) {
  update(AUTOMOD_FILE, {}, (data) => {
    data[guildId] = config;
  });
}

/**
 * Toggle a specific automod category on or off.
 * @param {string} guildId
 * @param {string} category
 * @param {boolean} enabled
 */
function setAutomodCategory(guildId, category, enabled) {
  const config = getAutomodConfig(guildId);
  if (!config.categories) config.categories = {};
  config.categories[category] = enabled;
  setAutomodConfig(guildId, config);
}

// ─── Staff Infractions ────────────────────────────────────────────────────────

const INFRACTIONS_FILE = 'staff_infractions.json';

/**
 * Add a staff infraction.
 * @param {string} guildId
 * @param {string} staffUserId  The staff member receiving the infraction
 * @param {object} opts
 * @param {string} opts.issuedById   Moderator/supervisor issuing the infraction
 * @param {string} opts.reason
 * @param {string} opts.severity     'minor' | 'moderate' | 'severe'
 * @param {string} [opts.action]     Any additional disciplinary action taken
 * @returns {object} The created infraction record
 */
function addStaffInfraction(guildId, staffUserId, { issuedById, reason, severity, action }) {
  return update(INFRACTIONS_FILE, {}, (data) => {
    if (!data[guildId]) data[guildId] = {};
    if (!data[guildId][staffUserId]) data[guildId][staffUserId] = [];
    const record = {
      id: Date.now(),
      issuedById,
      reason,
      severity: severity ?? 'minor',
      action: action ?? null,
      timestamp: new Date().toISOString(),
      active: true,
    };
    data[guildId][staffUserId].push(record);
    return record;
  });
}

/**
 * Get all infractions for a staff member in a guild.
 * @param {string} guildId
 * @param {string} staffUserId
 * @returns {object[]}
 */
function getStaffInfractions(guildId, staffUserId) {
  const data = read(INFRACTIONS_FILE, {});
  return data?.[guildId]?.[staffUserId] ?? [];
}

/**
 * Remove/void a specific infraction by id.
 * @param {string} guildId
 * @param {string} staffUserId
 * @param {number} infractionId
 * @returns {boolean} true if removed
 */
function removeStaffInfraction(guildId, staffUserId, infractionId) {
  return update(INFRACTIONS_FILE, {}, (data) => {
    if (!data?.[guildId]?.[staffUserId]) return false;
    const before = data[guildId][staffUserId].length;
    data[guildId][staffUserId] = data[guildId][staffUserId].filter((i) => i.id !== infractionId);
    return data[guildId][staffUserId].length < before;
  });
}

/**
 * Get all staff infraction records across all staff in a guild.
 * @param {string} guildId
 * @returns {object[]} Array of { staffUserId, infractions[] }
 */
function getAllStaffInfractions(guildId) {
  const data = read(INFRACTIONS_FILE, {});
  const guild = data?.[guildId] ?? {};
  return Object.entries(guild).map(([staffUserId, infractions]) => ({ staffUserId, infractions }));
}

module.exports = {
  read,
  write,
  update,
  addWarning,
  getWarnings,
  clearWarnings,
  startShift,
  endShift,
  getActiveShift,
  getUserShiftHistory,
  getGuildShiftHistory,
  getAllActiveShifts,
  getShiftLeaderboard,
  getPresetReasons,
  addPresetReason,
  removePresetReason,
  getCurrentWave,
  startWave,
  getShiftsInCurrentWave,
  getUserShiftTimeInWave,
  updateShiftRecord,
  deleteShiftRecord,
  getConfig,
  setConfig,
  deleteConfig,
  getAutomodConfig,
  setAutomodConfig,
  setAutomodCategory,
  addStaffInfraction,
  getStaffInfractions,
  removeStaffInfraction,
  getAllStaffInfractions,
};
