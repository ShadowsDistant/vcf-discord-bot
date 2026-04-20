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
  hasManagementAccessRole,
} = require('../../utils/roles');
const { hasModLevel, hasSidRole, MOD_LEVEL } = require('../../utils/permissions');

const HELP_CATEGORY_SELECT_PREFIX = 'help_category_select:';
const SENIOR_MOD_COMMANDS = new Set(['ban', 'unban']);
const MANAGEMENT_COMMANDS = new Set(['announce', 'say']);
const SHIFT_COMMANDS = new Set(['shift']);
const MODERATION_RANK_BY_COMMAND = {
  ban: 'Senior Moderator+',
  unban: 'Senior Moderator+',
  staffinfraction: 'SID only',
  warn: 'Moderator+',
  warnings: 'Moderator+',
  clearwarnings: 'Senior Moderator+',
  kick: 'Moderator+',
  timeout: 'Moderator+',
  untimeout: 'Moderator+',
  mute: 'Moderator+',
  deafen: 'Moderator+',
  move: 'Moderator+',
  lock: 'Moderator+',
  unlock: 'Moderator+',
  slowmode: 'Moderator+',
  purge: 'Moderator+',
  role: 'Moderator+',
  bakeadmin: 'Moderator+',
};
const EMBED_FIELD_VALUE_LIMIT = 1024;

const CATEGORY_META = {
  moderation: { label: 'Moderation', emoji: '-', color: 0xed4245 },
  utility: { label: 'Utility', emoji: '🧰', color: 0x5865f2 },
  shifts: { label: 'Shifts', emoji: '⏱️', color: 0x00b8d9 },
  setup: { label: 'Management', emoji: '-', color: 0xf39c12 },
  dev: { label: 'Developer', emoji: '🧪', color: 0x9b59b6 },
  context: { label: 'Context Menus', emoji: '🖱️', color: 0x57f287 },
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
      return hasSidRole(interaction.member, interaction.guild.id);
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
  if (commandName === 'giveaway') {
    return hasManagementAccessRole(interaction.member);
  }
  return true;
}

function splitFieldValue(value, maxLength = EMBED_FIELD_VALUE_LIMIT) {
  const chunks = [];
  let current = '';
  const pushCurrent = () => { if (current.length > 0) { chunks.push(current); current = ''; } };
  const appendLine = (line) => {
    if (line.length <= maxLength) {
      const candidate = current.length > 0 ? `${current}\n${line}` : line;
      if (candidate.length <= maxLength) current = candidate;
      else { pushCurrent(); current = line; }
      return;
    }
    pushCurrent();
    for (let i = 0; i < line.length; i += maxLength) chunks.push(line.slice(i, i + maxLength));
  };
  for (const line of value.split('\n')) appendLine(line);
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

function collectVisibleCommands(interaction, commandsPath, commandFolderMap) {
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
      categories[folder] = [...cmds.values()].sort((a, b) => a.data.name.localeCompare(b.data.name));
    }
  }
  return { categories, visibleCommandCount };
}

function formatCommandLine(cmd, folder) {
  const rank = folder === 'moderation' ? ` *(${MODERATION_RANK_BY_COMMAND[cmd.data.name] ?? 'Junior Moderator+'})*` : '';
  const desc = cmd.data.description || '*(no description)*';
  return `\`/${cmd.data.name}\` — ${desc}${rank}`;
}

function buildCategorySelect(sortedCategoryKeys, selectedCategory, actorId, categorySizes) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${HELP_CATEGORY_SELECT_PREFIX}${actorId}`)
      .setPlaceholder('Select a command category…')
      .addOptions(
        sortedCategoryKeys.map((key) => {
          const meta = CATEGORY_META[key] ?? { label: key, emoji: '📁' };
          const count = categorySizes[key] ?? 0;
          return {
            label: `${meta.label} (${count})`.slice(0, 100),
            value: key,
            emoji: meta.emoji,
            default: key === selectedCategory,
            description: `View ${count} command${count === 1 ? '' : 's'} in this category`.slice(0, 100),
          };
        }),
      ),
  );
}

function buildCategoryEmbed(interaction, categoryKey, commands, visibleCommandCount) {
  const meta = CATEGORY_META[categoryKey] ?? { label: categoryKey, emoji: '📁', color: PALETTE.primary };
  const lines = commands.map((c) => formatCommandLine(c, categoryKey));
  const body = lines.join('\n');
  const chunks = splitFieldValue(body);

  const embed = new EmbedBuilder()
    .setColor(meta.color ?? PALETTE.primary)
    .setAuthor({ name: `${interaction.guild.name} • Help`, iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`${meta.emoji} ${meta.label} Commands`)
    .setDescription([
      `Showing **${commands.length}** command${commands.length === 1 ? '' : 's'} in the **${meta.label}** category.`,
      'Use `/help <command>` for details on a specific command.',
    ].join('\n'))
    .setFooter({
      text: `${visibleCommandCount} command${visibleCommandCount === 1 ? '' : 's'} available to you · ${interaction.guild.name}`,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    });

  chunks.forEach((chunk, i) => {
    embed.addFields({
      name: i === 0 ? `📖 Commands` : `📖 Commands (cont. ${i})`,
      value: chunk,
    });
  });
  return embed;
}

function describeOption(option) {
  const typeNames = {
    1: 'subcommand', 2: 'group', 3: 'string', 4: 'integer', 5: 'boolean',
    6: 'user', 7: 'channel', 8: 'role', 9: 'mentionable', 10: 'number', 11: 'attachment',
  };
  const type = typeNames[option.type] ?? String(option.type);
  const required = option.required ? '*(required)*' : '*(optional)*';
  return `• \`${option.name}\` **${type}** ${required} — ${option.description || '*(no description)*'}`;
}

function buildSingleCommandEmbed(interaction, cmd, folder) {
  const meta = CATEGORY_META[folder] ?? { label: folder ?? 'Unknown', emoji: '📁', color: PALETTE.primary };
  const data = cmd.data.toJSON ? cmd.data.toJSON() : cmd.data;
  const options = data.options ?? [];
  const subcommands = options.filter((o) => o.type === 1 || o.type === 2);
  const normalOptions = options.filter((o) => o.type !== 1 && o.type !== 2);
  const usageParts = normalOptions.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`));
  const usage = `\`/${data.name}${usageParts.length ? ' ' + usageParts.join(' ') : ''}\``;

  const rank = folder === 'moderation' ? (MODERATION_RANK_BY_COMMAND[data.name] ?? 'Junior Moderator+') : null;
  const embed = new EmbedBuilder()
    .setColor(meta.color ?? PALETTE.primary)
    .setAuthor({ name: `${interaction.guild.name} • Help`, iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`${meta.emoji} /${data.name}`)
    .setDescription(data.description || '*(no description)*')
    .addFields(
      { name: 'Category', value: `${meta.emoji} ${meta.label}`, inline: true },
      { name: 'Usage', value: usage, inline: true },
    );

  if (rank) embed.addFields({ name: 'Required Rank', value: rank, inline: true });

  if (subcommands.length > 0) {
    const subLines = subcommands.map((s) => `• \`/${data.name} ${s.name}\` — ${s.description || '*(no description)*'}`);
    const subChunks = splitFieldValue(subLines.join('\n'));
    subChunks.forEach((chunk, i) => embed.addFields({ name: i === 0 ? 'Subcommands' : `Subcommands (cont. ${i})`, value: chunk }));
  }

  if (normalOptions.length > 0) {
    const optLines = normalOptions.map(describeOption);
    const optChunks = splitFieldValue(optLines.join('\n'));
    optChunks.forEach((chunk, i) => embed.addFields({ name: i === 0 ? 'Options' : `Options (cont. ${i})`, value: chunk }));
  }

  return embed.setFooter({
    text: `${interaction.guild.name} • ${meta.label}`,
    iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all available commands or get info about a specific one.')
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('The command to get detailed help for.')
        .setAutocomplete(true),
    ),

  isHelpCategorySelect(customId) {
    return typeof customId === 'string' && customId.startsWith(HELP_CATEGORY_SELECT_PREFIX);
  },

  async handleHelpCategorySelect(interaction) {
    const commandsPath = path.join(__dirname, '..');
    const commandFolderMap = buildCommandFolderMap(commandsPath);
    const { categories, visibleCommandCount } = collectVisibleCommands(interaction, commandsPath, commandFolderMap);
    const categoryKeys = Object.keys(categories);
    if (!categoryKeys.length) {
      return interaction.update({
        embeds: [embedError('No commands are available to you right now.', interaction.guild)],
        components: [],
      });
    }
    const sortedCategoryKeys = sortCategories(categoryKeys);
    const actorId = interaction.customId.slice(HELP_CATEGORY_SELECT_PREFIX.length);
    if (actorId && actorId !== interaction.user.id) {
      return interaction.reply({
        embeds: [embedError('This help panel belongs to someone else. Run `/help` to open your own.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    const selectedCategory = interaction.values?.[0];
    const activeCategory = sortedCategoryKeys.includes(selectedCategory) ? selectedCategory : sortedCategoryKeys[0];
    const sizes = Object.fromEntries(Object.entries(categories).map(([k, cmds]) => [k, cmds.length]));
    return interaction.update({
      embeds: [buildCategoryEmbed(interaction, activeCategory, categories[activeCategory], visibleCommandCount)],
      components: [buildCategorySelect(sortedCategoryKeys, activeCategory, interaction.user.id, sizes)],
    });
  },

  async handleHelpAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'command') return interaction.respond([]).catch(() => null);
    const commandsPath = path.join(__dirname, '..');
    const commandFolderMap = buildCommandFolderMap(commandsPath);
    const query = String(focused.value ?? '').toLowerCase();
    const matches = [...interaction.client.commands.values()]
      .filter((c) => {
        const folder = commandFolderMap.get(c.data.name);
        if (!folder) return false;
        if (!canUseCommand(interaction, c.data.name, folder)) return false;
        return c.data.name.toLowerCase().includes(query);
      })
      .slice(0, 25)
      .map((c) => ({ name: `/${c.data.name} — ${(c.data.description ?? '').slice(0, 50)}`.slice(0, 100), value: c.data.name }));
    await interaction.respond(matches).catch(() => null);
  },

  async execute(interaction) {
    const commandName = interaction.options.getString('command');
    const commandsPath = path.join(__dirname, '..');
    const commandFolderMap = buildCommandFolderMap(commandsPath);

    if (commandName) {
      const cmd = interaction.client.commands.get(commandName);
      const folder = cmd ? commandFolderMap.get(cmd.data.name) ?? null : null;
      if (!cmd || !folder || !canUseCommand(interaction, cmd.data.name, folder)) {
        return interaction.reply({
          embeds: [embedError(`No command named \`${commandName}\` was found or you don't have access to it.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [buildSingleCommandEmbed(interaction, cmd, folder)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const { categories, visibleCommandCount } = collectVisibleCommands(interaction, commandsPath, commandFolderMap);
    const categoryKeys = Object.keys(categories);
    if (!categoryKeys.length) {
      return interaction.reply({
        embeds: [embedError('No commands are available to you right now.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    const sortedCategoryKeys = sortCategories(categoryKeys);
    const defaultCategory = sortedCategoryKeys[0];
    const sizes = Object.fromEntries(Object.entries(categories).map(([k, cmds]) => [k, cmds.length]));
    return interaction.reply({
      embeds: [buildCategoryEmbed(interaction, defaultCategory, categories[defaultCategory], visibleCommandCount)],
      components: [buildCategorySelect(sortedCategoryKeys, defaultCategory, interaction.user.id, sizes)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
