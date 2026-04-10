'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { PALETTE, error: embedError } = require('../../utils/embeds');
const path = require('path');
const fs = require('fs');

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

    if (commandName) {
      const cmd = interaction.client.commands.get(commandName);
      if (!cmd) {
        return interaction.reply({
          embeds: [embedError(`No command named \`${commandName}\` was found.`, interaction.guild)],
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(PALETTE.primary)
        .setTitle(`📖  /${cmd.data.name}`)
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
      const folderPath = path.join(commandsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const cmds = interaction.client.commands.filter((_v, k) => {
        const cmdPath = path.join(folderPath, `${k}.js`);
        return fs.existsSync(cmdPath);
      });

      if (cmds.size > 0) {
        categories[folder] = cmds.map((c) => `\`/${c.data.name}\` — ${c.data.description}`).join('\n');
      }
    }

    const categoryEmojis = {
      moderation: '🛡️  Moderation',
      utility: '🔧  Utility',
      shifts: '🕐  Shifts',
      setup: '⚙️  Setup',
      dev: '👨‍💻  Developer',
    };

    const embed = new EmbedBuilder()
      .setColor(PALETTE.primary)
      .setTitle('📋  Command List')
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
