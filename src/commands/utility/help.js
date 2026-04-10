'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { PALETTE, error: embedError } = require('../../utils/embeds');
const path = require('path');
const fs = require('fs');
const {
  hasModerationAccessRole,
  hasManagementAccessRole,
  isDevUser,
} = require('../../utils/roles');

const MANAGEMENT_COMMANDS = new Set(['shiftmanage', 'shiftwave', 'automod', 'reasons']);
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
    const canSeeModeration = hasModerationAccessRole(interaction.member);
    const canSeeManagement = hasManagementAccessRole(interaction.member);
    const canSeeDev = isDevUser(interaction.user.id);

    if (commandName) {
      const cmd = interaction.client.commands.get(commandName);
      if (!cmd) {
        return interaction.reply({
          embeds: [embedError(`No command named \`${commandName}\` was found.`, interaction.guild)],
          ephemeral: true,
        });
      }

      if (MANAGEMENT_COMMANDS.has(cmd.data.name) && !canSeeManagement) {
        return interaction.reply({
          embeds: [embedError('No command with that name was found.', interaction.guild)],
          ephemeral: true,
        });
      }
      const modCommandPath = path.join(__dirname, '..', 'moderation', `${cmd.data.name}.js`);
      if (fs.existsSync(modCommandPath) && !canSeeModeration) {
        return interaction.reply({
          embeds: [embedError('No command with that name was found.', interaction.guild)],
          ephemeral: true,
        });
      }
      const devCommandPath = path.join(__dirname, '..', 'dev', `${cmd.data.name}.js`);
      if (fs.existsSync(devCommandPath) && !canSeeDev) {
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

    for (const folder of fs.readdirSync(commandsPath)) {
      if (folder === 'moderation' && !canSeeModeration) continue;
      if (folder === 'dev' && !canSeeDev) continue;

      const folderPath = path.join(commandsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const cmds = interaction.client.commands.filter((_v, k) => {
        if (MANAGEMENT_COMMANDS.has(k) && !canSeeManagement) return false;
        const cmdPath = path.join(folderPath, `${k}.js`);
        return fs.existsSync(cmdPath);
      });

      if (cmds.size > 0) {
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
        text: `${interaction.client.commands.size} commands total · ${interaction.guild.name}`,
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
