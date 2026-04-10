'use strict';

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PALETTE, error: embedError } = require('../../utils/embeds');
const path = require('path');
const fs = require('fs');
const {
  hasShiftAccessRole,
  memberHasAnyRole,
  ALL_STAFF_ROLE_IDS,
  isDevUser,
} = require('../../utils/roles');
const { hasModLevel, hasSidRole, MOD_LEVEL } = require('../../utils/permissions');

const SENIOR_MOD_COMMANDS = new Set(['ban', 'unban']);
const MANAGEMENT_COMMANDS = new Set(['shiftmanage', 'shiftwave']);
const SHIFT_COMMANDS = new Set([
  'shift-start',
  'endshift',
  'shiftstatus',
  'shiftlog',
  'shift-history',
  'shiftleaderboard',
  'shiftroles',
]);
const MODERATION_RANK_BY_COMMAND = {
  ban: 'Senior Moderator+',
  unban: 'Senior Moderator+',
  staffinfraction: 'Senior Moderator+ / SID',
  warn: 'Junior Moderator+',
  warnings: 'Junior Moderator+',
  clearwarnings: 'Junior Moderator+',
  kick: 'Junior Moderator+',
  timeout: 'Junior Moderator+',
  untimeout: 'Junior Moderator+',
  mute: 'Junior Moderator+',
  deafen: 'Junior Moderator+',
  move: 'Junior Moderator+',
  lock: 'Junior Moderator+',
  unlock: 'Junior Moderator+',
  slowmode: 'Junior Moderator+',
  purge: 'Junior Moderator+',
  role: 'Junior Moderator+',
};
const EMBED_FIELD_VALUE_LIMIT = 1024;

function buildCommandFolderMap(commandsPath) {
  const map = new Map();
  for (const folder of fs.readdirSync(commandsPath)) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
      if (!file.endsWith('.js')) continue;
      const commandPath = path.join(folderPath, file);
      try {
        const command = require(commandPath);
        if (command?.data?.name) map.set(command.data.name, folder);
      } catch {
        // Ignore invalid command files in help lookup.
      }
    }
  }
  return map;
}

function canUseCommand(interaction, commandName, folder, canSeeDev) {
  if (folder === 'dev') return canSeeDev;
  if (SHIFT_COMMANDS.has(commandName)) return hasShiftAccessRole(interaction.member);
  if (MANAGEMENT_COMMANDS.has(commandName)) {
    return hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management);
  }
  if (folder === 'moderation') {
    if (commandName === 'staffinfraction') {
      return (
        hasSidRole(interaction.member, interaction.guild.id)
        || hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management)
      );
    }
    const required = SENIOR_MOD_COMMANDS.has(commandName) ? MOD_LEVEL.seniorMod : MOD_LEVEL.moderator;
    return hasModLevel(interaction.member, interaction.guild.id, required);
  }
  if (commandName === 'automod') {
    return hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.seniorMod);
  }
  if (commandName === 'rblxsearch') {
    return hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator);
  }
  if (commandName === 'portal') {
    return memberHasAnyRole(interaction.member, ALL_STAFF_ROLE_IDS);
  }
  return true;
}

function splitFieldValue(value, maxLength = EMBED_FIELD_VALUE_LIMIT) {
  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = '';
    }
  };

  const appendLine = (line) => {
    if (line.length <= maxLength) {
      const candidate = current.length > 0 ? `${current}\n${line}` : line;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        pushCurrent();
        current = line;
      }
      return;
    }

    pushCurrent();
    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
  };

  for (const line of value.split('\n')) {
    appendLine(line);
  }
  pushCurrent();

  return chunks;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all available commands or get info about a specific one.')
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('The command to get detailed help for.')
        .setAutocomplete(false),
    ),

  async execute(interaction) {
    const commandName = interaction.options.getString('command');
    const canSeeDev = isDevUser(interaction.user.id);
    const commandsPath = path.join(__dirname, '..');
    const commandFolderMap = buildCommandFolderMap(commandsPath);

    if (commandName) {
      const cmd = interaction.client.commands.get(commandName);
      if (!cmd) {
        return interaction.reply({
          embeds: [embedError(`No command named \`${commandName}\` was found.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const folder = commandFolderMap.get(cmd.data.name) ?? null;
      if (!folder || !canUseCommand(interaction, cmd.data.name, folder, canSeeDev)) {
        return interaction.reply({
          embeds: [embedError('No command with that name was found.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(PALETTE.primary)
        .setTitle(`  /${cmd.data.name}`)
        .setDescription(cmd.data.description)
        .setTimestamp()
        .setFooter({
          text: interaction.guild.name,
          iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
        });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Group commands by category (folder name)
    const categories = {};
    let visibleCommandCount = 0;

    for (const folder of fs.readdirSync(commandsPath)) {
      const folderPath = path.join(commandsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const cmds = interaction.client.commands.filter((_v, k) => {
        if (commandFolderMap.get(k) !== folder) return false;
        return canUseCommand(interaction, k, folder, canSeeDev);
      });

      if (cmds.size > 0) {
        visibleCommandCount += cmds.size;
        categories[folder] = cmds
          .map((c) => {
            const rank = folder === 'moderation' ? ` *(Rank: ${MODERATION_RANK_BY_COMMAND[c.data.name] ?? 'Junior Moderator+'})*` : '';
            return `\`/${c.data.name}\` — ${c.data.description}${rank}`;
          })
          .join('\n');
      }
    }

    const categoryEmojis = {
      moderation: '  Moderation',
      utility: '  Utility',
      shifts: '  Shifts',
      setup: '  Management',
      dev: '‍  Developer',
    };

    const embed = new EmbedBuilder()
      .setColor(PALETTE.primary)
      .setTitle('  Command List')
      .setDescription('Here is a list of all available commands.')
      .setTimestamp()
      .setFooter({
        text: `${visibleCommandCount} command${visibleCommandCount === 1 ? '' : 's'} total · ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    for (const [cat, value] of Object.entries(categories)) {
      const categoryName = categoryEmojis[cat] ?? cat;
      const splitValues = splitFieldValue(value);
      for (let i = 0; i < splitValues.length; i += 1) {
        embed.addFields({
          name: i === 0 ? categoryName : `${categoryName} (cont. ${i})`,
          value: splitValues[i],
        });
      }
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
