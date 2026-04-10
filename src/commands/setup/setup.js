'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('logs')
        .setDescription('Set the channel where moderation actions are logged.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('The text channel to use for mod logs.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome')
        .setDescription('Configure the welcome message sent when a member joins.')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('The text channel to send welcome messages in.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('message')
            .setDescription(
              'Custom welcome text. Use {user} for mention, {server} for server name.',
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('removewelcome')
        .setDescription('Disable welcome messages for this server.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('removelogs')
        .setDescription('Disable mod-log messages for this server.'),
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View the current bot configuration for this server.'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;

    if (sub === 'logs') {
      const channel = interaction.options.getChannel('channel');

      db.setConfig(guild.id, 'logChannelId', channel.id);

      return interaction.reply({
        embeds: [
          embeds
            .setup('📋  Mod Log Channel Set', `Moderation actions will now be logged in ${channel}.`, guild)
            .addFields({ name: '📌  Channel', value: `${channel} (\`${channel.id}\`)`, inline: true }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'welcome') {
      const channel = interaction.options.getChannel('channel');
      const message =
        interaction.options.getString('message') ??
        'Welcome to **{server}**, {user}! We hope you enjoy your stay. 🎉';

      db.setConfig(guild.id, 'welcomeChannelId', channel.id);
      db.setConfig(guild.id, 'welcomeMessage', message);

      return interaction.reply({
        embeds: [
          embeds
            .setup('👋  Welcome Messages Configured', `New members will be greeted in ${channel}.`, guild)
            .addFields(
              { name: '📌  Channel', value: `${channel}`, inline: true },
              { name: '💬  Message Preview', value: message.replace('{user}', `<@${interaction.user.id}>`).replace('{server}', guild.name) },
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'removewelcome') {
      db.deleteConfig(guild.id, 'welcomeChannelId');
      db.deleteConfig(guild.id, 'welcomeMessage');
      return interaction.reply({
        embeds: [embeds.success('Welcome messages have been disabled for this server.', guild)],
        ephemeral: true,
      });
    }

    if (sub === 'removelogs') {
      db.deleteConfig(guild.id, 'logChannelId');
      return interaction.reply({
        embeds: [embeds.success('Mod logging has been disabled for this server.', guild)],
        ephemeral: true,
      });
    }

    if (sub === 'view') {
      const config = db.getConfig(guild.id);

      const logChannel = config.logChannelId
        ? `<#${config.logChannelId}>`
        : '`Not set`';
      const welcomeChannel = config.welcomeChannelId
        ? `<#${config.welcomeChannelId}>`
        : '`Not set`';
      const welcomeMsg = config.welcomeMessage ?? '`Not set`';

      return interaction.reply({
        embeds: [
          embeds
            .setup('⚙️  Server Configuration', `Current bot settings for **${guild.name}**.`, guild)
            .setThumbnail(guild.iconURL({ dynamic: true }) ?? null)
            .addFields(
              { name: '📋  Mod Log Channel', value: logChannel, inline: true },
              { name: '👋  Welcome Channel', value: welcomeChannel, inline: true },
              { name: '💬  Welcome Message', value: welcomeMsg },
            ),
        ],
        ephemeral: true,
      });
    }
  },
};
