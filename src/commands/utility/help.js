'use strict';

const {
  ActionRowBuilder,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');
const { PALETTE, error: embedError } = require('../../utils/embeds');
const path = require('path');
const fs = require('fs');
const {
  hasShiftAccessRole,
  memberHasAnyRole,
  ALL_STAFF_ROLE_IDS,
  canUseDevCommand,
} = require('../../utils/roles');
const { hasModLevel, hasSidRole, MOD_LEVEL } = require('../../utils/permissions');

const HELP_CATEGORY_SELECT_ID = 'help_category_select';
const SENIOR_MOD_COMMANDS = new Set(['ban', 'unban']);
const MANAGEMENT_COMMANDS = new Set(['announce', 'say']);
const SHIFT_COMMANDS = new Set(['shift']);
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

const CATEGORY_LABELS = {
  moderation: 'Moderation',
  utility: 'Utility',
  shifts: 'Shifts',
  setup: 'Management',
  dev: 'Developer',
  context: 'Context',
};

const CATEGORY_ORDER = ['moderation', 'utility', 'shifts', 'setup', 'context', 'dev'];

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

function canUseCommand(interaction, commandName, folder) {
  if (folder === 'dev') return canUseDevCommand(interaction.member, interaction.guild, commandName);
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

function sortCategories(categoryKeys) {
  return [...categoryKeys].sort((a, b) => {
    const aIdx = CATEGORY_ORDER.indexOf(a);
    const bIdx = CATEGORY_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}

function collectVisibleCategories(interaction, commandsPath, commandFolderMap) {
  const categories = {};
  let visibleCommandCount = 0;

  for (const folder of fs.readdirSync(commandsPath)) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const cmds = interaction.client.commands.filter((_v, k) => {
      if (commandFolderMap.get(k) !== folder) return false;
      return canUseCommand(interaction, k, folder);
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

  return { categories, visibleCommandCount };
}

function buildCategorySelect(sortedCategoryKeys, selectedCategory) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_CATEGORY_SELECT_ID)
      .setPlaceholder('Select a command category')
      .addOptions(
        sortedCategoryKeys.map((key) => ({
          label: CATEGORY_LABELS[key] ?? key,
          value: key,
          default: key === selectedCategory,
        })),
      ),
  );
}

function buildCategoryEmbed(interaction, categoryKey, categoryText, visibleCommandCount) {
  const categoryLabel = CATEGORY_LABELS[categoryKey] ?? categoryKey;
  const splitValues = splitFieldValue(categoryText);

  const embed = new EmbedBuilder()
    .setColor(PALETTE.primary)
    .setTitle('Command List')
    .setDescription(`Showing **${categoryLabel}** commands.`)
    .setFooter({
      text: `${visibleCommandCount} command${visibleCommandCount === 1 ? '' : 's'} total · ${interaction.guild.name}`,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    });

  for (let i = 0; i < splitValues.length; i += 1) {
    embed.addFields({
      name: i === 0 ? categoryLabel : `${categoryLabel} (cont. ${i})`,
      value: splitValues[i],
    });
  }

  return embed;
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

  isHelpCategorySelect(customId) {
    return customId === HELP_CATEGORY_SELECT_ID;
  },

  async handleHelpCategorySelect(interaction) {
    const commandsPath = path.join(__dirname, '..');
    const commandFolderMap = buildCommandFolderMap(commandsPath);
    const { categories, visibleCommandCount } = collectVisibleCategories(
      interaction,
      commandsPath,
      commandFolderMap,
    );

    const categoryKeys = Object.keys(categories);
    if (!categoryKeys.length) {
      return interaction.update({
        embeds: [embedError('No commands are available to you right now.', interaction.guild)],
        components: [],
      });
    }

    const sortedCategoryKeys = sortCategories(categoryKeys);
    const selectedCategory = interaction.values?.[0];
    const activeCategory = sortedCategoryKeys.includes(selectedCategory)
      ? selectedCategory
      : sortedCategoryKeys[0];

    return interaction.update({
      embeds: [buildCategoryEmbed(interaction, activeCategory, categories[activeCategory], visibleCommandCount)],
      components: [buildCategorySelect(sortedCategoryKeys, activeCategory)],
    });
  },

  async execute(interaction) {
    const commandName = interaction.options.getString('command');
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
      if (!folder || !canUseCommand(interaction, cmd.data.name, folder)) {
        return interaction.reply({
          embeds: [embedError('No command with that name was found.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(PALETTE.primary)
        .setTitle(`/${cmd.data.name}`)
        .setDescription(cmd.data.description)
        .setFooter({
          text: interaction.guild.name,
          iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
        });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const { categories, visibleCommandCount } = collectVisibleCategories(
      interaction,
      commandsPath,
      commandFolderMap,
    );

    const categoryKeys = Object.keys(categories);
    if (!categoryKeys.length) {
      return interaction.reply({
        embeds: [embedError('No commands are available to you right now.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sortedCategoryKeys = sortCategories(categoryKeys);
    const defaultCategory = sortedCategoryKeys[0];

    return interaction.reply({
      embeds: [buildCategoryEmbed(interaction, defaultCategory, categories[defaultCategory], visibleCommandCount)],
      components: [buildCategorySelect(sortedCategoryKeys, defaultCategory)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
