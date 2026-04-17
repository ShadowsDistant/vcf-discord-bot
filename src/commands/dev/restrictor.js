'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embeds = require('../../utils/embeds');
const { canUseDevCommand } = require('../../utils/roles');
const commandRestrictions = require('../../utils/commandRestrictions');

const RESTRICTOR_ADMIN_USER_ID = '757698506411475005';

function validateKnownCommand(interaction, commandName) {
  const normalized = String(commandName ?? '').trim().toLowerCase();
  if (!normalized) return { ok: false, reason: 'Command name is required.' };
  const knownName = interaction.client.commands.find((_command, loadedName) => String(loadedName ?? '').trim().toLowerCase() === normalized)?.data?.name;
  if (!knownName) {
    return { ok: false, reason: `No loaded command found named \`/${normalized}\`.` };
  }
  return { ok: true, commandName: knownName };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restrictor')
    .setDescription('[Dev] Manage global command restrictions for users.')
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View a user\'s global command restrictions.')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('Target user')
            .setRequired(true),
        ))
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add or update a global command restriction.')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('Target user')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('Command name (without /)')
            .setRequired(true)
            .setMaxLength(64),
        )
        .addStringOption((opt) =>
          opt
            .setName('reason')
            .setDescription('Reason shown to restricted user')
            .setRequired(true)
            .setMaxLength(300),
        ))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a global command restriction.')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('Target user')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('Command name (without /)')
            .setRequired(true)
            .setMaxLength(64),
        )),

  async execute(interaction) {
    if (!canUseDevCommand(interaction.member, interaction.guild, 'restrictor') || interaction.user.id !== RESTRICTOR_ADMIN_USER_ID) {
      return interaction.reply({
        embeds: [embeds.error('This command requires the allowed developer user ID.', interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user', true);

    if (subcommand === 'view') {
      const rows = commandRestrictions.listUserRestrictions(targetUser.id);
      const description = rows.length > 0
        ? rows.map((entry, idx) => `${idx + 1}. \`/${entry.commandName}\` — ${entry.reason}`).join('\n').slice(0, 4000)
        : 'No global command restrictions found for this user.';
      return interaction.reply({
        embeds: [embeds.dev('Global Command Restrictions', `User: <@${targetUser.id}> (\`${targetUser.id}\`)\n\n${description}`, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const rawCommandName = interaction.options.getString('command', true);
    const validation = validateKnownCommand(interaction, rawCommandName);
    if (!validation.ok) {
      return interaction.reply({
        embeds: [embeds.error(validation.reason, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }
    const commandName = validation.commandName;

    if (subcommand === 'add') {
      const reason = interaction.options.getString('reason', true);
      const result = commandRestrictions.setRestriction(targetUser.id, commandName, reason);
      if (!result.ok) {
        return interaction.reply({
          embeds: [embeds.error(result.reason, interaction.guild ?? null)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [embeds.success(`Global restriction set for <@${targetUser.id}> on \`/${commandName}\`.\nReason: ${result.reason}`, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'remove') {
      const result = commandRestrictions.removeRestriction(targetUser.id, commandName);
      if (!result.ok) {
        return interaction.reply({
          embeds: [embeds.error(result.reason, interaction.guild ?? null)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [embeds.success(`Removed global restriction for <@${targetUser.id}> on \`/${commandName}\`.`, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [embeds.error('Unknown subcommand.', interaction.guild ?? null)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
