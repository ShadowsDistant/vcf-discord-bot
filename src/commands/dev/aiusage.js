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
    .addStringOption((opt) => opt
      .setName('action')
      .setDescription('AI management action to perform.')
      .setRequired(true)
      .addChoices(
        { name: 'Set user limit override', value: 'set-user' },
        { name: 'Set role limit override', value: 'set-role' },
        { name: 'Clear user limit override', value: 'clear-user' },
        { name: 'Clear role limit override', value: 'clear-role' },
        { name: 'Grant one-time user adjustment', value: 'grant-user' },
        { name: 'Grant one-time role adjustment', value: 'grant-role' },
        { name: 'Allow user to disable safety', value: 'allow-safety-user' },
        { name: 'Disallow user safety toggle', value: 'disallow-safety-user' },
      ))
    .addUserOption((opt) => opt.setName('user').setDescription('Target user (for user actions).'))
    .addRoleOption((opt) => opt.setName('role').setDescription('Target role (for role actions).'))
    .addIntegerOption((opt) => opt.setName('value').setDescription('Limit or adjustment amount (required for set/grant actions).')),

  async execute(interaction) {
    if (!canManageAiUsage(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    const action = interaction.options.getString('action', true);
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const value = interaction.options.getInteger('value');

    if (action === 'set-user') {
      if (!user || value == null) {
        return interaction.reply({ embeds: [embeds.error('Set user override requires `user` and `value`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      const limit = value;
      writeUsage((data) => {
        data.userOverrides[user.id] = limit < 0 ? { unlimited: true } : { limit: Math.max(0, limit), unlimited: false };
      });
      return interaction.reply({ embeds: [embeds.success(`Set user override for ${user} to **${limit < 0 ? 'unlimited' : `${limit}/6h`}**.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (action === 'set-role') {
      if (!role || value == null) {
        return interaction.reply({ embeds: [embeds.error('Set role override requires `role` and `value`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      const limit = value;
      writeUsage((data) => {
        data.roleOverrides[role.id] = limit < 0 ? { unlimited: true } : { limit: Math.max(0, limit), unlimited: false };
      });
      return interaction.reply({ embeds: [embeds.success(`Set role override for ${role} to **${limit < 0 ? 'unlimited' : `${limit}/6h`}**.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (action === 'clear-user') {
      if (!user) {
        return interaction.reply({ embeds: [embeds.error('Clear user override requires `user`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      writeUsage((data) => {
        delete data.userOverrides[user.id];
      });
      return interaction.reply({ embeds: [embeds.success(`Cleared AI usage override for ${user}.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (action === 'clear-role') {
      if (!role) {
        return interaction.reply({ embeds: [embeds.error('Clear role override requires `role`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      writeUsage((data) => {
        delete data.roleOverrides[role.id];
      });
      return interaction.reply({ embeds: [embeds.success(`Cleared AI usage override for ${role}.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (action === 'grant-user') {
      if (!user || value == null) {
        return interaction.reply({ embeds: [embeds.error('Grant user adjustment requires `user` and `value`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      const amount = value;
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

    if (action === 'grant-role') {
      if (!role || value == null) {
        return interaction.reply({ embeds: [embeds.error('Grant role adjustment requires `role` and `value`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      const amount = value;
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

    if (action === 'allow-safety-user') {
      if (!user) {
        return interaction.reply({ embeds: [embeds.error('Allow safety toggle requires `user`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      writeUsage((data) => {
        data.safetyToggleUsers[user.id] = true;
      });
      return interaction.reply({ embeds: [embeds.success(`Allowed ${user} to disable AI safety in /ai.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    if (action === 'disallow-safety-user') {
      if (!user) {
        return interaction.reply({ embeds: [embeds.error('Disallow safety toggle requires `user`.', interaction.guild)], flags: MessageFlags.Ephemeral });
      }
      writeUsage((data) => {
        delete data.safetyToggleUsers[user.id];
      });
      return interaction.reply({ embeds: [embeds.success(`Removed ${user}'s permission to disable AI safety in /ai.`, interaction.guild)], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ embeds: [embeds.error('Unsupported subcommand.', interaction.guild)], flags: MessageFlags.Ephemeral });
  },
};
