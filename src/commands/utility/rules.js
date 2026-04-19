'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show detailed community and roleplay rules.'),

  async execute(interaction) {
    const fullRulesUrl = 'https://docs.valleycorrectional.xyz/community-rules/our-rules';
    const links = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Full Rules')
        .setStyle(ButtonStyle.Link)
        .setURL(fullRulesUrl),
    );

    const overviewEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Community Rules & Guidelines')
      .setDescription([
        '“I haven’t read the rules” is **not** an excuse for breaking them.',
        'These standards apply across Discord and in-game shifts.',
        '',
        `Full policy: ${fullRulesUrl}`,
      ].join('\n'))
      .addFields(
        {
          name: '1) Respect & Inclusion',
          value: [
            '• Zero tolerance for hate speech or discrimination.',
            '• No harassment, bullying, intimidation, or personal attacks.',
            '• Keep disagreements civil and in good faith.',
          ].join('\n'),
        },
        {
          name: '2) Safety & Privacy',
          value: [
            '• Do not share or request personal information (PII).',
            '• No threats, blackmail, doxxing, or implied real-world harm.',
            '• NSFW, graphic shock content, and insensitive tragedy content are prohibited.',
          ].join('\n'),
        },
        {
          name: '3) Community Integrity',
          value: [
            '• No classified/confidential leaks or claims of insider access.',
            '• Follow Discord ToS and all moderator instructions.',
            '• Keep discussions mature; avoid political debates and partisan arguments.',
          ].join('\n'),
        },
      )
      .setFooter({
        text: `${interaction.guild.name} • Follow all rules to participate`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      })
      .setTimestamp();

    const platformEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Discord & In-Game Expectations')
      .addFields(
        {
          name: 'Discord Rules',
          value: [
            '• English only in public channels for moderation clarity.',
            '• No malicious/suspicious links, hidden destination URLs, or scams.',
            '• No advertising, self-promotion, or unsolicited recruiting/poaching.',
            '• Use channels and tickets correctly; no spam, floods, or mass mentions.',
            '• Voice rules mirror text rules; no mic/soundboard abuse.',
          ].join('\n'),
        },
        {
          name: 'Roleplay Rules (Roblox Shifts)',
          value: [
            '• No fail roleplay (keep actions realistic to the setting).',
            '• No forbidden themes (sexual/graphic/extreme real-world attack RP).',
            '• No powergaming or metagaming.',
            '• No scene intrusion, baiting, or trolling to provoke reactions.',
            '• In-game VC must remain in-character and relevant.',
            '• No unauthorized/impersonated access to whitelisted teams.',
          ].join('\n'),
        },
        {
          name: 'Moderator Compliance',
          value: 'Ignoring direct out-of-character moderator instructions is a serious offense.',
        },
      )
      .setFooter({
        text: `${interaction.guild.name} • See full rules for complete examples and enforcement`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      })
      .setTimestamp();

    return interaction.reply({
      embeds: [overviewEmbed, platformEmbed],
      components: [links],
    });
  },
};
