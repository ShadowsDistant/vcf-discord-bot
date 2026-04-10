'use strict';

const { Events, MessageFlags } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');
const { formatDuration } = require('../utils/helpers');
const { fetchRobloxProfileByUsername, createRobloxEmbed } = require('../utils/roblox');
const { ROLE_IDS } = require('../utils/roles');
const { UPDATE_LOGS, createUpdateEmbed } = require('../utils/updateLogs');
const { version: botVersion } = require('../../package.json');

/** Commands whose `reason` option supports preset-reason autocomplete. */
const REASON_AUTOCOMPLETE_COMMANDS = new Set(['ban', 'kick', 'warn']);
const ERROR_DETAIL_LIMIT = 500;

function getErrorDetails(err) {
  if (!err) return 'Unknown error.';
  const errorName = typeof err.name === 'string' && err.name.trim().length > 0 ? err.name.trim() : 'Error';
  const errorMessage = typeof err.message === 'string' && err.message.trim().length > 0
    ? err.message.trim()
    : String(err);
  const combined = `${errorName}: ${errorMessage}`;
  if (combined.length <= ERROR_DETAIL_LIMIT) return combined;
  return `${combined.slice(0, ERROR_DETAIL_LIMIT - 3)}...`;
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('userinfo_roblox:')) {
        const [, targetId, encodedQuery] = interaction.customId.split(':');
        if (!targetId) {
          return interaction.reply({
            embeds: [embeds.error('Invalid Roblox button payload.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
        const targetMember = targetUser
          ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
          : null;
        const nickname = decodeURIComponent(encodedQuery || '')
          || targetMember?.nickname
          || targetUser?.username;

        if (!nickname) {
          return interaction.reply({
            embeds: [embeds.error('Could not determine a Roblox username for this user.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const robloxData = await fetchRobloxProfileByUsername(nickname);
          if (!robloxData) {
            return interaction.editReply({
              embeds: [
                embeds.error(`No Roblox user found for **${nickname}**.`, interaction.guild),
              ],
            });
          }
          const embed = createRobloxEmbed(interaction.guild, robloxData, nickname);
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply({
            embeds: [
              embeds.error(
                `An error occurred while fetching Roblox data: ${err.message}`,
                interaction.guild,
              ),
            ],
          });
        }
      }

      if (interaction.customId === 'portal_startshift') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to start a shift.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const result = db.startShift(interaction.guild.id, interaction.user.id, interaction.user.tag);
        if (!result) {
          return interaction.reply({
            embeds: [embeds.warning("You're already on shift! Use End Shift to clock out first.", interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const startedTs = Math.floor(new Date(result.startedAt).getTime() / 1000);
        return interaction.reply({
          embeds: [
            embeds
              .shift('  Shift Started', `Welcome back, ${interaction.user}! Your shift has begun.`, interaction.guild)
              .addFields({
                name: '  Started At',
                value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`,
                inline: true,
              }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'portal_endshift') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to end a shift.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const record = db.endShift(interaction.guild.id, interaction.user.id);
        if (!record) {
          return interaction.reply({
            embeds: [embeds.warning("You're not currently on shift.", interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const startedTs = Math.floor(new Date(record.startedAt).getTime() / 1000);
        const endedTs = Math.floor(new Date(record.endedAt).getTime() / 1000);
        return interaction.reply({
          embeds: [
            embeds
              .shift('  Shift Ended', `Thanks for your work, ${interaction.user}!`, interaction.guild)
              .addFields(
                { name: '  Duration', value: formatDuration(record.durationMs), inline: true },
                { name: '  Started', value: `<t:${startedTs}:T>`, inline: true },
                { name: '  Ended', value: `<t:${endedTs}:T>`, inline: true },
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'portal_shiftdetails') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to view shift details.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
        const totalMs = history.reduce((sum, shift) => sum + shift.durationMs, 0);
        const active = db.getActiveShift(interaction.guild.id, interaction.user.id);

        const detailEmbed = embeds
          .shift('📋 Detailed Shift Overview', 'Your complete shift breakdown.', interaction.guild)
          .addFields(
            { name: 'Status', value: active ? '**On Shift**' : '**Off Shift**', inline: true },
            { name: 'Completed Shifts', value: `**${history.length}**`, inline: true },
            { name: 'Total Time', value: `**${formatDuration(totalMs)}**`, inline: true },
          );

        if (active) {
          const startedTs = Math.floor(new Date(active.startedAt).getTime() / 1000);
          detailEmbed.addFields({
            name: 'Current Shift',
            value: `Started <t:${startedTs}:F> (<t:${startedTs}:R>)`,
          });
        }

        if (history.length > 0) {
          const recent = history
            .slice(-10)
            .reverse()
            .map((shift) => {
              const startedTs = Math.floor(new Date(shift.startedAt).getTime() / 1000);
              return `ID \`${shift.id}\` · <t:${startedTs}:D> — **${formatDuration(shift.durationMs)}**`;
            });
          detailEmbed.addFields({
            name: 'Recent Shifts (last 10)',
            value: recent.join('\n'),
          });
        }

        return interaction.reply({
          embeds: [detailEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'updates_log_select') {
        const selectedIndex = Number.parseInt(interaction.values[0], 10);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex >= UPDATE_LOGS.length) {
          return interaction.reply({
            embeds: [embeds.error('Invalid update log selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const selected = UPDATE_LOGS[selectedIndex];
        const updatedEmbed = createUpdateEmbed(interaction.guild, botVersion, selected, selectedIndex);
        return interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
      }
    }

    // ── Autocomplete ────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);

      if (
        REASON_AUTOCOMPLETE_COMMANDS.has(interaction.commandName) &&
        focused.name === 'reason' &&
        interaction.guildId
      ) {
        const presets = db.getPresetReasons(interaction.guildId, interaction.commandName);
        const query = focused.value.toLowerCase();
        const matches = presets
          .filter((r) => r.reason.toLowerCase().includes(query))
          .slice(0, 25)
          .map((r) => ({ name: r.reason.slice(0, 100), value: r.reason }));
        await interaction.respond(matches).catch(() => null);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      const missingCommandEmbed = embeds
        .error(
          'This command is no longer available. If it still appears, redeploy slash commands to clean stale registrations.',
          interaction.guild ?? null,
        )
        .addFields({
          name: '  Command',
          value: `\`/${interaction.commandName}\``,
          inline: true,
        });
      await interaction.reply({ embeds: [missingCommandEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error executing ${interaction.commandName}:`, err);

      const errorEmbed = embeds
        .error(
          'An unexpected error occurred while running this command. Please try again later.',
          interaction.guild ?? null,
        )
        .addFields(
          {
            name: '  Command',
            value: `\`/${interaction.commandName}\``,
            inline: true,
          },
          {
            name: '  Error Details',
            value: `\`${getErrorDetails(err)}\``,
          },
        );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  },
};
