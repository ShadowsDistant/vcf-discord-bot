'use strict';

/**
 * Formats a duration in milliseconds into a human-readable string.
 * e.g. 3661000 → "1 hour, 1 minute, 1 second"
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return 'less than a second';

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);

  return parts.join(', ');
}

/**
 * Parses a duration string like "10m", "1h", "7d" into milliseconds.
 * Supported units: s, m, h, d
 * @param {string} str
 * @returns {number|null} milliseconds, or null if invalid
 */
function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] ?? null);
}

/**
 * Truncates a string to a maximum length, appending "…" if cut.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max = 1024) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

module.exports = { formatDuration, parseDuration, truncate };
