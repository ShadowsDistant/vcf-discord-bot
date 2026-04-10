'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * Palette of consistent brand colours used across all embeds.
 */
const PALETTE = {
  primary: 0x5865f2,   // Discord blurple
  success: 0x57f287,   // Green
  warning: 0xfee75c,   // Yellow
  error: 0xed4245,     // Red
  info: 0x5865f2,      // Blurple
  neutral: 0x2b2d31,   // Dark grey
  shift: 0xeb459e,     // Pink – used for shift embeds
  dev: 0x9b59b6,       // Purple – used for dev embeds
  setup: 0x1abc9c,     // Teal – used for setup embeds
};

/**
 * Builds a base embed with a consistent footer and timestamp.
 * @param {import('discord.js').Guild|null} guild
 * @returns {EmbedBuilder}
 */
function base(guild = null) {
  const embed = new EmbedBuilder().setTimestamp();
  if (guild) {
    embed.setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }
  return embed;
}

/**
 * Success embed (green) with a bold title and description.
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function success(description, guild = null) {
  return base(guild)
    .setColor(PALETTE.success)
    .setTitle('✅  Success')
    .setDescription(description);
}

/**
 * Error embed (red) with a bold title, description, and helpful context.
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function error(description, guild = null) {
  return base(guild)
    .setColor(PALETTE.error)
    .setTitle('⛔  Error')
    .setDescription(description);
}

/**
 * Warning embed (yellow) with a bold title and description.
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function warning(description, guild = null) {
  return base(guild)
    .setColor(PALETTE.warning)
    .setTitle('⚠️  Warning')
    .setDescription(description);
}

/**
 * Info / primary embed (blurple).
 * @param {string} title
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function info(title, description, guild = null) {
  return base(guild)
    .setColor(PALETTE.primary)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Shift embed (pink).
 * @param {string} title
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function shift(title, description, guild = null) {
  return base(guild)
    .setColor(PALETTE.shift)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Setup embed (teal) — used for /setup command responses.
 * @param {string} title
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function setup(title, description, guild = null) {
  return base(guild)
    .setColor(PALETTE.setup)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Dev embed (purple) — used for bot-developer command responses.
 * @param {string} title
 * @param {string} description
 * @param {import('discord.js').Guild|null} guild
 */
function dev(title, description, guild = null) {
  return base(guild)
    .setColor(PALETTE.dev)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Moderation action embed – shows a mod action in a rich, consistent layout.
 * @param {object} opts
 * @param {string}  opts.action        Human-readable action label, e.g. "Banned"
 * @param {string}  opts.emoji         Emoji prefix for the title
 * @param {import('discord.js').User}   opts.target    The user being actioned
 * @param {import('discord.js').User}   opts.moderator The moderator performing the action
 * @param {string}  [opts.reason]      Reason for the action
 * @param {string}  [opts.duration]    e.g. "10 minutes" (for timeouts)
 * @param {import('discord.js').Guild}  [opts.guild]
 * @returns {EmbedBuilder}
 */
function modAction({ action, emoji, target, moderator, reason, duration, guild } = {}) {
  const embed = base(guild)
    .setColor(PALETTE.error)
    .setTitle(`${emoji}  ${action}`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤  User', value: `${target} (\`${target.tag}\`)`, inline: true },
      { name: '🛡️  Moderator', value: `${moderator} (\`${moderator.tag}\`)`, inline: true },
    );

  if (duration) embed.addFields({ name: '⏱️  Duration', value: duration, inline: true });

  embed.addFields({
    name: '📋  Reason',
    value: reason ?? 'No reason provided.',
  });

  return embed;
}

module.exports = { PALETTE, success, error, warning, info, shift, setup, dev, modAction, base };
