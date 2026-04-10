'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
  'startshift',
  'endshift',
  'shiftstatus',
  'shiftlog',
  'shifthistory',
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

function resolveCommandFolder(commandName) {
  const commandsPath = path.join(__dirname, '..');
  for (const folder of fs.readdirSync(commandsPath)) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    if (fs.existsSync(path.join(folderPath, `${commandName}.js`))) return folder;
  }
  return null;
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

    if (commandName) {
      const cmd = interaction.client.commands.get(commandName);
      if (!cmd) {
        return interaction.reply({
          embeds: [embedError(`No command named \`${commandName}\` was found.`, interaction.guild)],
          ephemeral: true,
        });
      }

      const folder = resolveCommandFolder(cmd.data.name);
      if (!folder || !canUseCommand(interaction, cmd.data.name, folder, canSeeDev)) {
        return interaction.reply({
          embeds: [embedError('No command with that name was found.', interaction.guild)],
          ephemeral: true,
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

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Group commands by category (folder name)
    const categories = {};
    const commandsPath = path.join(__dirname, '..');
    let visibleCommandCount = 0;

    for (const folder of fs.readdirSync(commandsPath)) {
      const folderPath = path.join(commandsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const cmds = interaction.client.commands.filter((_v, k) => {
        const cmdPath = path.join(folderPath, `${k}.js`);
        if (!fs.existsSync(cmdPath)) return false;
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
      embed.addFields({
        name: categoryEmojis[cat] ?? cat,
        value,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
