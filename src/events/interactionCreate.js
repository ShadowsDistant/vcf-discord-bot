'use strict';

const { Events } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');
const { formatDuration } = require('../utils/helpers');
const { fetchRobloxProfileByUsername, createRobloxEmbed } = require('../utils/roblox');
const { ROLE_IDS } = require('../utils/roles');

/** Commands whose `reason` option supports preset-reason autocomplete. */
const REASON_AUTOCOMPLETE_COMMANDS = new Set(['ban', 'kick', 'warn']);

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('userinfo_roblox:')) {
        const [, targetId, encodedQuery] = interaction.customId.split(':');
        if (!targetId) {
          return interaction.reply({
            embeds: [embeds.error('Invalid Roblox button payload.', interaction.guild)],
            ephemeral: true,
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
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });
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
            ephemeral: true,
          });
        }

        const result = db.startShift(interaction.guild.id, interaction.user.id, interaction.user.tag);
        if (!result) {
          return interaction.reply({
            embeds: [embeds.warning("You're already on shift! Use End Shift to clock out first.", interaction.guild)],
            ephemeral: true,
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
          ephemeral: true,
        });
      }

      if (interaction.customId === 'portal_endshift') {
        const record = db.endShift(interaction.guild.id, interaction.user.id);
        if (!record) {
          return interaction.reply({
            embeds: [embeds.warning("You're not currently on shift.", interaction.guild)],
            ephemeral: true,
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
          ephemeral: true,
        });
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
        .addFields({
          name: '  Command',
          value: `\`/${interaction.commandName}\``,
          inline: true,
        });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => null);
      }
    }
  },
};
