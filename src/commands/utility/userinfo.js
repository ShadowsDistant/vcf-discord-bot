'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { PALETTE } = require('../../utils/embeds');

/** Map Discord UserFlags to readable labels with emojis. */
const FLAG_LABELS = {
  Staff: '‍  Discord Staff',
  Partner: '  Discord Partner',
  Hypesquad: '  HypeSquad Events',
  BugHunterLevel1: '  Bug Hunter (Level 1)',
  HypeSquadOnlineHouse1: '  HypeSquad Bravery',
  HypeSquadOnlineHouse2: '  HypeSquad Brilliance',
  HypeSquadOnlineHouse3: '  HypeSquad Balance',
  PremiumEarlySupporter: '⭐  Early Supporter',
  BugHunterLevel2: '  Bug Hunter (Level 2)',
  VerifiedBot: '  Verified Bot',
  VerifiedDeveloper: '‍  Verified Bot Developer',
  CertifiedModerator: '  Discord Certified Moderator',
  ActiveDeveloper: '  Active Developer',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display information about a user.')
    .addUserOption((o) =>
      o.setName('user').setDescription('The user to look up (defaults to you).'),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    const flags = target.flags
      ? target.flags.toArray().map((f) => FLAG_LABELS[f] ?? f).join('\n')
      : null;

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || PALETTE.primary)
      .setTitle(`  ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔  User ID', value: `\`${target.id}\``, inline: true },
        { name: '  Bot?', value: target.bot ? 'Yes' : 'No', inline: true },
        {
          name: '  Account Created',
          value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D> (<t:${Math.floor(target.createdTimestamp / 1000)}:R>)`,
        },
      )
      .setTimestamp()
      .setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    if (member) {
      const topRole = member.roles.highest && member.roles.highest.id !== interaction.guild.id
        ? member.roles.highest
        : null;
      embed.addFields(
        {
          name: '  Joined Server',
          value: member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
            : 'Unknown',
        },
        {
          name: '  Position',
          value: topRole ? `${topRole.name}` : 'None',
          inline: true,
        },
        {
          name: `  Roles (${member.roles.cache.size - 1})`,
          value:
            member.roles.cache.size > 1
              ? member.roles.cache
                  .filter((r) => r.id !== interaction.guild.id)
                  .sort((a, b) => b.position - a.position)
                  .map((r) => `${r}`)
                  .slice(0, 20)
                  .join(' ') || 'None'
              : 'None',
        },
      );

      if (member.nickname) {
        embed.addFields({ name: '  Nickname', value: member.nickname, inline: true });
      }
    }

    if (flags) {
      embed.addFields({ name: '  Badges', value: flags });
    }

    const robloxQuery = encodeURIComponent(member?.nickname ?? target.username);
    const robloxButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('View Roblox Info')
      .setURL(`https://www.roblox.com/search/users?keyword=${robloxQuery}`);
    const row = new ActionRowBuilder().addComponents(robloxButton);

    return interaction.reply({ embeds: [embed], components: [row] });
  },
};
