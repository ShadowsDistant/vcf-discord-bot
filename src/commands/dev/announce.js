'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');

const DEV_USER_ID = process.env.DEV_USER_ID ?? '757698506411475005';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('[Dev] Send a rich announcement embed to a specified channel.')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('The channel to send the announcement in.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('title').setDescription('Title of the announcement.').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('message').setDescription('Body text of the announcement.').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('color')
        .setDescription('Embed color.')
        .addChoices(
          { name: 'Blue (default)', value: 'blue' },
          { name: 'Green', value: 'green' },
          { name: 'Red', value: 'red' },
          { name: 'Yellow', value: 'yellow' },
          { name: 'Purple', value: 'purple' },
        ),
    ),

  async execute(interaction) {
    if (interaction.user.id !== DEV_USER_ID) {
      return interaction.reply({
        embeds: [embeds.error('This command is restricted to the bot developer.', interaction.guild ?? null)],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const colorChoice = interaction.options.getString('color') ?? 'blue';

    const colorMap = {
      blue: 0x5865f2,
      green: 0x57f287,
      red: 0xed4245,
      yellow: 0xfee75c,
      purple: 0x9b59b6,
    };

    const embed = embeds
      .base(interaction.guild ?? null)
      .setColor(colorMap[colorChoice])
      .setTitle(`📢  ${title}`)
      .setDescription(message)
      .setAuthor({
        name: interaction.guild?.name ?? 'Announcement',
        iconURL: interaction.guild?.iconURL({ dynamic: true }) ?? undefined,
      });

    try {
      await channel.send({ embeds: [embed] });

      return interaction.reply({
        embeds: [
          embeds.success(
            `Announcement sent to ${channel} successfully.`,
            interaction.guild ?? null,
          ),
        ],
        ephemeral: true,
      });
    } catch (err) {
      return interaction.reply({
        embeds: [
          embeds.error(
            `Failed to send announcement: \`${err.message}\``,
            interaction.guild ?? null,
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
