'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

const AI_USAGE_FILE = 'ai_usage_limits.json';
const AI_USAGE_WINDOW_MS = 6 * 60 * 60 * 1000;

function canManageAiUsage(member) {
  return member?.id === '757698506411475005';
}

function readUsage() {
  return db.read(AI_USAGE_FILE, { usage: {}, userOverrides: {}, roleOverrides: {} });
}

function writeUsage(mutator) {
  db.update(AI_USAGE_FILE, { usage: {}, userOverrides: {}, roleOverrides: {}, safetyToggleUsers: {} }, (data) => {
    if (!data.usage || typeof data.usage !== 'object') data.usage = {};
    if (!data.userOverrides || typeof data.userOverrides !== 'object') data.userOverrides = {};
    if (!data.roleOverrides || typeof data.roleOverrides !== 'object') data.roleOverrides = {};
    if (!data.safetyToggleUsers || typeof data.safetyToggleUsers !== 'object') data.safetyToggleUsers = {};
    mutator(data);
  });
}

function getBucketStart(now = Date.now()) {
  return Math.floor(now / AI_USAGE_WINDOW_MS) * AI_USAGE_WINDOW_MS;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aimanage')
    .setDescription('Manage AI usage allowances and safety toggle access.')
    .addSubcommand((sub) => sub
      .setName('set-user')
      .setDescription('Set permanent AI usage limit override for a user.')
      .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption((opt) => opt.setName('limit').setDescription('Limit per 6h, use -1 for unlimited').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('set-role')
      .setDescription('Set permanent AI usage limit override for a role.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Target role').setRequired(true))
      .addIntegerOption((opt) => opt.setName('limit').setDescription('Limit per 6h, use -1 for unlimited').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('clear-user')
      .setDescription('Clear permanent AI usage override for a user.')
      .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('clear-role')
      .setDescription('Clear permanent AI usage override for a role.')
      .addRoleOption((opt) => opt.setName('role').setDescription('Target role').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('grant-user')
      .setDescription('One-time usage adjustment this 6h window for a user.')
      .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption((opt) => opt.setName('amount').setDescription('Positive or negative change').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('grant-role')
      .setDescription('One-time usage adjustment this 6h window for all users with a role (best effort).')
      .addRoleOption((opt) => opt.setName('role').setDescription('Target role').setRequired(true))
      .addIntegerOption((opt) => opt.setName('amount').setDescription('Positive or negative change').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('allow-safety-user')
      .setDescription('Allow a user to disable AI safety in /ai.')
      .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('disallow-safety-user')
      .setDescription('Remove a user\'s permission to disable AI safety in /ai.')
      .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))),

  async execute(interaction) {
    if (!canManageAiUsage(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'set-user') {
      const user = interaction.options.getUser('user', true);
      const limit = interaction.options.getInteger('limit', true);
      writeUsage((data) => {
        data.userOverrides[user.id] = limit < 0 ? { unlimited: true } : { limit: Math.max(0, limit), unlimited: false };
      });
      return interaction.reply({ embeds: [embeds.success(`Set user override for ${user} to **${limit < 0 ? 'unlimited' : `${limit}/6h`}**.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set-role') {
      const role = interaction.options.getRole('role', true);
      const limit = interaction.options.getInteger('limit', true);
      writeUsage((data) => {
        data.roleOverrides[role.id] = limit < 0 ? { unlimited: true } : { limit: Math.max(0, limit), unlimited: false };
      });
      return interaction.reply({ embeds: [embeds.success(`Set role override for ${role} to **${limit < 0 ? 'unlimited' : `${limit}/6h`}**.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'clear-user') {
      const user = interaction.options.getUser('user', true);
      writeUsage((data) => {
        delete data.userOverrides[user.id];
      });
      return interaction.reply({ embeds: [embeds.success(`Cleared AI usage override for ${user}.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'clear-role') {
      const role = interaction.options.getRole('role', true);
      writeUsage((data) => {
        delete data.roleOverrides[role.id];
      });
      return interaction.reply({ embeds: [embeds.success(`Cleared AI usage override for ${role}.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'grant-user') {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const bucketStart = getBucketStart(Date.now());
      writeUsage((data) => {
        const rec = data.usage[user.id] ?? { bucketStart, used: 0 };
        if (Number(rec.bucketStart) !== bucketStart) {
          rec.bucketStart = bucketStart;
          rec.used = 0;
        }
        rec.used = Math.max(0, Number(rec.used ?? 0) - amount);
        data.usage[user.id] = rec;
      });
      const direction = amount >= 0 ? `+${amount}` : String(amount);
      return interaction.reply({ embeds: [embeds.success(`Applied one-time adjustment ${direction} to ${user} this window.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'grant-role') {
      const role = interaction.options.getRole('role', true);
      const amount = interaction.options.getInteger('amount', true);
      const members = await interaction.guild.members.fetch();
      const targets = [...members.values()].filter((m) => m.roles.cache.has(role.id));
      const bucketStart = getBucketStart(Date.now());
      writeUsage((data) => {
        for (const m of targets) {
          const rec = data.usage[m.id] ?? { bucketStart, used: 0 };
          if (Number(rec.bucketStart) !== bucketStart) {
            rec.bucketStart = bucketStart;
            rec.used = 0;
          }
          rec.used = Math.max(0, Number(rec.used ?? 0) - amount);
          data.usage[m.id] = rec;
        }
      });
      const direction = amount >= 0 ? `+${amount}` : String(amount);
      return interaction.reply({ embeds: [embeds.success(`Applied one-time adjustment ${direction} for **${targets.length}** member(s) in ${role}.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'allow-safety-user') {
      const user = interaction.options.getUser('user', true);
      writeUsage((data) => {
        data.safetyToggleUsers[user.id] = true;
      });
      return interaction.reply({ embeds: [embeds.success(`Allowed ${user} to disable AI safety in /ai.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'disallow-safety-user') {
      const user = interaction.options.getUser('user', true);
      writeUsage((data) => {
        delete data.safetyToggleUsers[user.id];
      });
      return interaction.reply({ embeds: [embeds.success(`Removed ${user}'s permission to disable AI safety in /ai.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ embeds: [embeds.error('Unsupported subcommand.', interaction.guild)], flags: MessageFlags.Ephemeral });
  },
};
