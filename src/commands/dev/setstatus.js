'use strict';

const { SlashCommandBuilder, ActivityType } = require('discord.js');
const embeds = require('../../utils/embeds');

const DEV_USER_ID = process.env.DEV_USER_ID ?? '757698506411475005';

const STATUS_CHOICES = [
  { name: 'Online', value: 'online' },
  { name: 'Idle', value: 'idle' },
  { name: 'Do Not Disturb', value: 'dnd' },
  { name: 'Invisible', value: 'invisible' },
];

const ACTIVITY_CHOICES = [
  { name: 'Playing', value: 'Playing' },
  { name: 'Watching', value: 'Watching' },
  { name: 'Listening to', value: 'Listening' },
  { name: 'Competing in', value: 'Competing' },
  { name: 'None', value: 'None' },
];

const ACTIVITY_TYPE_MAP = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setstatus')
    .setDescription('[Dev] Change the bot\'s presence and activity.')
    .addStringOption((o) =>
      o
        .setName('status')
        .setDescription('The online status to set.')
        .setRequired(true)
        .addChoices(...STATUS_CHOICES),
    )
    .addStringOption((o) =>
      o
        .setName('activity_type')
        .setDescription('The type of activity.')
        .setRequired(true)
        .addChoices(...ACTIVITY_CHOICES),
    )
    .addStringOption((o) =>
      o
        .setName('activity_text')
        .setDescription('The activity text (e.g. "with fire"). Required unless activity type is None.'),
    ),

  async execute(interaction) {
    if (interaction.user.id !== DEV_USER_ID) {
      return interaction.reply({
        embeds: [embeds.error('This command is restricted to the bot developer.', interaction.guild ?? null)],
        ephemeral: true,
      });
    }

    const status = interaction.options.getString('status');
    const activityType = interaction.options.getString('activity_type');
    const activityText = interaction.options.getString('activity_text');

    if (activityType !== 'None' && !activityText) {
      return interaction.reply({
        embeds: [embeds.error('Please provide activity text when an activity type is selected.', interaction.guild ?? null)],
        ephemeral: true,
      });
    }

    const presence = { status };

    if (activityType !== 'None' && activityText) {
      presence.activities = [
        {
          name: activityText,
          type: ACTIVITY_TYPE_MAP[activityType],
        },
      ];
    } else {
      presence.activities = [];
    }

    interaction.client.user.setPresence(presence);

    const activityDisplay =
      activityType !== 'None' && activityText
        ? `\`${activityType}\` **${activityText}**`
        : '`None`';

    return interaction.reply({
      embeds: [
        embeds
          .dev('🎮  Presence Updated', 'The bot\'s presence has been changed successfully.', interaction.guild ?? null)
          .addFields(
            { name: '🔵  Status', value: `\`${status}\``, inline: true },
            { name: '🎯  Activity', value: activityDisplay, inline: true },
          ),
      ],
      ephemeral: true,
    });
  },
};
