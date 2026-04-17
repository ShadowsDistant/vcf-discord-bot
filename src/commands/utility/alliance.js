'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const alliances = require('../../utils/bakeAlliances');
const economy = require('../../utils/bakeEconomy');
const embeds = require('../../utils/embeds');
const { fetchLogChannel } = require('../../utils/logChannels');

const PANEL_VIEWS = ['overview', 'challenge', 'store', 'manage', 'leaderboard'];

function toProgressBar(progress, target, size = 20) {
  const safeTarget = Math.max(1, Number(target ?? 1));
  const safeProgress = Math.max(0, Number(progress ?? 0));
  const ratio = Math.min(1, safeProgress / safeTarget);
  const filled = Math.round(ratio * size);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, size - filled))} ${Math.round(ratio * 100)}%`;
}

function contributorLines(contributors = []) {
  if (!contributors.length) return 'No contribution data yet.';
  return contributors
    .slice(0, 5)
    .map((entry, idx) => `${idx + 1}. <@${entry.userId}> — **${economy.toCookieNumber(entry.contribution)}**`)
    .join('\n');
}

function memberLines(memberIds = []) {
  if (!memberIds.length) return 'No members.';
  return memberIds.map((memberId) => `• <@${memberId}>`).join('\n').slice(0, 1024);
}

function toEmojiText(emojiValue) {
  if (!emojiValue) return '❔';
  if (typeof emojiValue === 'string') return emojiValue;
  if (emojiValue?.id && emojiValue?.name) return `<${emojiValue.animated ? 'a' : ''}:${emojiValue.name}:${emojiValue.id}>`;
  if (emojiValue?.name) return emojiValue.name;
  return '❔';
}

function buildNavigationSelect(currentView) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('alliance_nav_select')
      .setPlaceholder('📋 Navigate alliance panel...')
      .addOptions(
        { label: '🏠 Overview', value: 'overview', description: 'Alliance info, members, and current summary.', default: currentView === 'overview' },
        { label: '🎯 Challenge', value: 'challenge', description: 'Weekly challenge progress and contributors.', default: currentView === 'challenge' },
        { label: '🛍️ Store', value: 'store', description: 'Alliance-wide upgrades and available credits.', default: currentView === 'store' },
        { label: '🛠️ Manage', value: 'manage', description: 'Owner actions like rename, transfer, and member removal.', default: currentView === 'manage' },
        { label: '🏆 Leaderboard', value: 'leaderboard', description: 'Top alliances by total CPS.', default: currentView === 'leaderboard' },
      ),
  );
}

function buildAllianceActionButtons(guild, view, data, userId) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`alliance_btn:refresh:${view}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(economy.getButtonEmoji(guild, ['Polymath', 'inspect'], '🔄')),
  );

  if (!data.alliance) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`alliance_btn:create:${view}`)
        .setLabel('Create Alliance')
        .setStyle(ButtonStyle.Success)
        .setEmoji(economy.getButtonEmoji(guild, ['cookie', 'plain_cookie'], '🛠️')),
      new ButtonBuilder()
        .setCustomId(`alliance_btn:join:${view}`)
        .setLabel('Join by ID/Name')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(economy.getButtonEmoji(guild, ['International_exchange', 'marketplace'], '🤝')),
    );
    return row;
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`alliance_btn:leave:${view}`)
      .setLabel('Leave Alliance')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(economy.getButtonEmoji(guild, ['left_arrow', 'arrow_left'], '🚪')),
  );

  if (data.alliance.ownerId === userId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`alliance_btn:rename:${view}`)
        .setLabel('Rename Alliance')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(economy.getButtonEmoji(guild, ['Labor_of_love', 'bakery'], '✏️')),
      new ButtonBuilder()
        .setCustomId(`alliance_btn:edit_description:${view}`)
        .setLabel('Edit Description')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(economy.getButtonEmoji(guild, ['Polymath', 'guide'], '📝')),
      new ButtonBuilder()
        .setCustomId(`alliance_btn:toggle_approval:${view}`)
        .setLabel(data.alliance.joinApprovalEnabled ? 'Approval: ON' : 'Approval: OFF')
        .setStyle(data.alliance.joinApprovalEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(economy.getButtonEmoji(guild, ['Cookie_Clicker', 'achievement'], '🧾')),
    );
  }

  return row;
}

function buildLeaderboardLines(guildId) {
  const ranking = alliances.getAllianceLeaderboard(guildId);
  if (!ranking.length) return 'No alliances yet. Be the first to create one!';
  const medals = ['🥇', '🥈', '🥉'];
  const rankBoostLabels = [' *(+10% CPS)*', ' *(+5% CPS)*', ' *(+3% CPS)*'];
  return ranking
    .slice(0, 10)
    .map((entry, idx) => {
      const medal = medals[idx] ?? `**${idx + 1}.**`;
      const boost = rankBoostLabels[idx] ?? '';
      return `${medal} **${entry.name}**${boost} — ${economy.toCookieNumber(entry.cpsTotal)} CPS • ${entry.memberCount} members`;
    })
    .join('\n');
}

function buildJoinSelect(allianceList = []) {
  if (!allianceList.length) return null;
  const options = allianceList
    .slice(0, 25)
    .map((alliance) => ({
      label: alliance.name.slice(0, 100),
      value: alliance.id,
      description: `ID ${alliance.id} • ${alliance.members.length}/${alliances.MAX_ALLIANCE_MEMBERS} members`.slice(0, 100),
    }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('alliance_join_select')
      .setPlaceholder('Join an existing alliance')
      .addOptions(options),
  );
}

function buildStoreSelect(guild, store) {
  if (!store?.upgrades?.length) return null;
  const options = store.upgrades.slice(0, 25).map((upgrade) => ({
    label: `${upgrade.name}${upgrade.owned ? ' (Owned)' : ''}`.slice(0, 100),
    value: upgrade.id,
    description: `${upgrade.description} • Cost: ${upgrade.cost} credits`.slice(0, 100),
    emoji: economy.getButtonEmoji(guild, upgrade.emojiCandidates, upgrade.fallbackEmoji),
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('alliance_store_select')
      .setPlaceholder('Buy an alliance upgrade (owner only)')
      .addOptions(options),
  );
}

function buildStoreSellSelect(guild, store, isOwner) {
  if (!isOwner) return null;
  if (!store?.upgrades?.length) return null;
  const options = store.upgrades
    .filter((upgrade) => upgrade.owned)
    .slice(0, 25)
    .map((upgrade) => ({
      label: upgrade.name.slice(0, 100),
      value: upgrade.id,
      description: `Sell for ${Math.floor(Number(upgrade.cost ?? 0) * alliances.ALLIANCE_UPGRADE_SELLBACK_MULTIPLIER)} credits (30% loss)`.slice(0, 100),
      emoji: economy.getButtonEmoji(guild, upgrade.emojiCandidates, upgrade.fallbackEmoji),
    }));
  if (!options.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('alliance_store_sell_select')
      .setPlaceholder('Sell an owned upgrade (owner only)')
      .addOptions(options),
  );
}

function memberDisplayName(guild, memberId) {
  const member = guild?.members?.cache?.get(memberId);
  if (member) return member.displayName.slice(0, 80);
  return `User ${memberId.slice(-4)}`;
}

function buildManageSelects(guild, data, userId) {
  if (!data.alliance || data.alliance.ownerId !== userId) return [];
  const memberIds = data.alliance.members.filter((memberId) => memberId !== userId).slice(0, 25);
  const requestIds = (data.alliance.joinRequests ?? []).map((entry) => entry.userId).slice(0, 25);
  const rows = [];

  if (memberIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('alliance_transfer_select')
          .setPlaceholder('👑 Transfer alliance ownership...')
          .addOptions(memberIds.map((memberId) => ({
            label: memberDisplayName(guild, memberId),
            value: memberId,
            description: 'Transfer leadership to this member.',
          }))),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('alliance_remove_select')
          .setPlaceholder('🚫 Kick a member...')
          .addOptions(memberIds.map((memberId) => ({
            label: memberDisplayName(guild, memberId),
            value: memberId,
            description: 'Remove this member from the alliance.',
          }))),
      ),
    );
  }

  if (requestIds.length > 0) {
    const requestActionOptions = requestIds
      .slice(0, 12)
      .flatMap((memberId) => ([
        {
          label: `✅ Approve: ${memberDisplayName(guild, memberId)}`.slice(0, 100),
          value: `approve:${memberId}`,
          description: 'Approve and add this user to the alliance.',
        },
        {
          label: `❌ Deny: ${memberDisplayName(guild, memberId)}`.slice(0, 100),
          value: `deny:${memberId}`,
          description: 'Deny this join request.',
        },
      ]));
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('alliance_request_action_select')
          .setPlaceholder('📋 Review pending join requests...')
          .addOptions(requestActionOptions),
      ),
    );
  }

  return rows.slice(0, 3);
}

function buildCreateAllianceModal() {
  return new ModalBuilder()
    .setCustomId('alliance_modal:create')
    .setTitle('Create Alliance')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Alliance name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(40),
      ),
    );
}

function buildJoinAllianceModal() {
  return new ModalBuilder()
    .setCustomId('alliance_modal:join')
    .setTitle('Join Alliance')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('alliance')
          .setLabel('Alliance ID or Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80),
      ),
    );
}

function buildRenameAllianceModal() {
  return new ModalBuilder()
    .setCustomId('alliance_modal:rename')
    .setTitle('Rename Alliance')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New alliance name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(40),
      ),
    );
}

function buildEditAllianceDescriptionModal(currentDescription = '') {
  const modal = new ModalBuilder()
    .setCustomId('alliance_modal:edit_description')
    .setTitle('Edit Alliance Description')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Alliance description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(alliances.MAX_ALLIANCE_DESCRIPTION_LENGTH)
          .setPlaceholder('Add a short description for your alliance.'),
      ),
    );
  if (currentDescription) {
    modal.components[0].components[0].setValue(String(currentDescription).slice(0, alliances.MAX_ALLIANCE_DESCRIPTION_LENGTH));
  }
  return modal;
}

function buildAlliancePanel(guild, userId, requestedView = 'overview', notice = null) {
  const view = PANEL_VIEWS.includes(requestedView) ? requestedView : 'overview';
  const data = alliances.getAllianceWithChallenge(guild.id, userId);
  const rewardGrantedNow = data.challenge?.rewardGrantedNow
    ? `Challenge completed! All members received **${economy.toCookieNumber(data.challenge.rewardGrantedNow.rewardCookiesPerMember)}** and your alliance gained **${data.challenge.rewardGrantedNow.rewardAllianceCoins}** credits.`
    : null;
  const allianceList = alliances.listAlliances(guild.id);
  const topLeaderboard = buildLeaderboardLines(guild.id);
  const components = [
    buildNavigationSelect(view),
    buildAllianceActionButtons(guild, view, data, userId),
  ];

  if (!data.alliance) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤝 Alliance Panel')
      .setDescription([
        'You are not currently in an alliance.',
        'Create a new alliance or join one below.',
      ].join('\n'))
      .addFields({ name: 'Top Alliances', value: topLeaderboard.slice(0, 1024) })
      .setTimestamp()
      .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
    if (notice || rewardGrantedNow) {
      embed.addFields({ name: 'Notice', value: `${notice ?? rewardGrantedNow}`.slice(0, 1024) });
    }
    const joinSelect = buildJoinSelect(allianceList);
    if (joinSelect) components.push(joinSelect);
    return { embeds: [embed], components, _challengeRewardNotice: data.challenge?.rewardGrantedNow ?? null };
  }

  const challenge = data.challenge;
  const store = data.store;
  const challengeProgressText = `**${economy.toCookieNumber(challenge.progress)} / ${economy.toCookieNumber(challenge.target)}**`;
  const challengeBar = toProgressBar(challenge.progress, challenge.target);
  const challengeStatus = challenge.completed
    ? (challenge.rewarded ? '✅ Completed and rewarded' : '✅ Completed (reward pending)')
    : '⏳ In progress';
  const allianceDescription = String(data.alliance.description ?? '').trim() || '_No description set._';
  const boosterStats = data.allianceBoosterBoost ?? {
    boosterCount: 0,
    allianceWideBoost: 0,
    perBoosterBoost: 0.01,
    personalBoosterBoost: 0,
  };
  const boosterInfo = [
    `Boosters in alliance: **${boosterStats.boosterCount}**`,
    `Alliance-wide booster bonus: **+${Math.round(boosterStats.allianceWideBoost * 100)}% CPS** (${Math.round(boosterStats.perBoosterBoost * 100)}% per booster)`,
    `Your booster role bonus: **+${Math.round(boosterStats.personalBoosterBoost * 100)}% CPS**`,
  ].join('\n');

  const baseEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`Alliance: ${data.alliance.name}`)
    .setDescription(`ID: \`${data.alliance.id}\` • Owner: <@${data.alliance.ownerId}>`)
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });

  if (view === 'challenge') {
    baseEmbed
      .setColor(0xf1c40f)
      .setTitle(`🎯 Weekly Challenge — ${data.alliance.name}`)
      .setDescription(challenge.challenge.description)
      .addFields(
        { name: 'Challenge', value: challenge.challenge.name, inline: false },
        { name: 'Status', value: challengeStatus, inline: true },
        { name: 'Progress', value: `${challengeProgressText}\n${challengeBar}`, inline: false },
        { name: 'Top Contributors', value: contributorLines(challenge.contributors), inline: false },
        {
          name: 'Completion Reward',
          value: `Each member: **${economy.toCookieNumber(challenge.rewardCookiesPerMember)}**\nAlliance credits: **${challenge.rewardAllianceCoins}**`,
          inline: false,
        },
        { name: '💎 Booster CPS Effects', value: boosterInfo.slice(0, 1024), inline: false },
      );
  } else if (view === 'store') {
    const ownedText = store.upgrades
      .filter((upgrade) => upgrade.owned)
      .map((upgrade) => `${toEmojiText(economy.getButtonEmoji(guild, upgrade.emojiCandidates, upgrade.fallbackEmoji))} **${upgrade.name}**`)
      .join('\n') || 'No upgrades purchased.';
    baseEmbed
      .setColor(0x9b59b6)
      .setTitle(`🛍️ Alliance Store — ${data.alliance.name}`)
      .setDescription('Buy upgrades that improve weekly challenge rewards for every alliance member.')
      .addFields(
        { name: 'Alliance Credits', value: `**${store.credits}**`, inline: true },
        { name: 'Owned Upgrades', value: ownedText.slice(0, 1024), inline: false },
        {
          name: 'Active Effects',
          value: [
            `Reward multiplier: **+${Math.round(store.effectTotals.rewardMultiplier * 100)}%**`,
            `Flat reward bonus: **${economy.toCookieNumber(store.effectTotals.flatRewardBonus)}**`,
            `Bonus alliance credits: **+${store.effectTotals.bonusAllianceCoins}**`,
            `Target reduction: **${Math.round(store.effectTotals.targetMultiplierReduction * 100)}%**`,
            `Alliance CPS boost: **+${Math.round((store.effectTotals.allianceCpsBoost ?? 0) * 100)}%**`,
            `Alliance ad cooldown: **${Math.round((store.effectTotals.adCooldownMs ?? alliances.ALLIANCE_AD_DEFAULT_COOLDOWN_MS) / (60 * 60 * 1000))}h**`,
          ].join('\n'),
          inline: false,
        },
        { name: '💎 Booster CPS Effects', value: boosterInfo.slice(0, 1024), inline: false },
      );
    const storeSelect = buildStoreSelect(guild, store);
    if (storeSelect) components.push(storeSelect);
    const storeSellSelect = buildStoreSellSelect(guild, store, data.alliance.ownerId === userId);
    if (storeSellSelect) components.push(storeSellSelect);
    if (data.alliance.ownerId === userId) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('alliance_btn:post_ad:store')
            .setLabel('Post Alliance Ad')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(economy.getButtonEmoji(guild, ['announce', 'International_exchange', 'marketplace'], '📣')),
        ),
      );
    }
  } else if (view === 'manage') {
    baseEmbed
      .setColor(0xed4245)
      .setTitle(`🛠️ Alliance Management — ${data.alliance.name}`)
      .setDescription(data.alliance.ownerId === userId
        ? 'Owner controls are available below.'
        : 'Only the alliance owner can manage alliance settings.')
      .addFields(
        { name: 'Alliance Description', value: allianceDescription.slice(0, 1024), inline: false },
        { name: 'Members', value: memberLines(data.alliance.members), inline: false },
        { name: 'Join Approval', value: data.alliance.joinApprovalEnabled ? 'Enabled (owner approval required)' : 'Disabled (instant join)', inline: false },
        { name: 'Pending Requests', value: `${(data.alliance.joinRequests ?? []).length}`, inline: true },
      );
    components.push(...buildManageSelects(guild, data, userId));
  } else if (view === 'leaderboard') {
    baseEmbed
      .setColor(0x5865f2)
      .setTitle('🏆 Alliance Leaderboard')
      .setDescription(topLeaderboard);
  } else {
    baseEmbed.addFields(
      { name: 'Description', value: allianceDescription.slice(0, 1024), inline: false },
      { name: 'Members', value: memberLines(data.alliance.members), inline: false },
      { name: 'Weekly Challenge', value: `**${challenge.challenge.name}**\n${challengeStatus}`, inline: false },
      { name: 'Progress', value: `${challengeProgressText}\n${challengeBar}`, inline: false },
      { name: 'Top Contributors', value: contributorLines(challenge.contributors), inline: false },
      { name: 'Join Approval', value: data.alliance.joinApprovalEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: '💎 Booster CPS Effects', value: boosterInfo.slice(0, 1024), inline: false },
    );
  }

  const notices = [notice, rewardGrantedNow].filter(Boolean);
  if (notices.length) {
    baseEmbed.addFields({ name: 'Notice', value: notices.join('\n').slice(0, 1024), inline: false });
  }

  return { embeds: [baseEmbed], components, _challengeRewardNotice: data.challenge?.rewardGrantedNow ?? null };
}

function buildAllianceInboxContent(embed) {
  const lines = [];
  if (embed?.data?.title) lines.push(`**${embed.data.title}**`);
  if (embed?.data?.description) lines.push(embed.data.description);
  for (const field of (embed?.data?.fields ?? [])) {
    if (!field?.name && !field?.value) continue;
    lines.push(`**${field.name ?? 'Details'}**`);
    lines.push(String(field.value ?? ''));
  }
  return lines.join('\n').slice(0, 900) || 'Alliance update.';
}

function sendAllianceBroadcastInbox(guildId, memberIds, embed) {
  const content = buildAllianceInboxContent(embed);
  const title = String(embed?.data?.title ?? '').slice(0, 100);
  for (const memberId of memberIds ?? []) {
    economy.addPendingMessage(guildId, memberId, {
      type: 'alliance_notification',
      from: 'Alliance System',
      title: title || undefined,
      content,
      notificationType: 'alliance_broadcast',
    });
  }
}

async function maybeSendChallengeRewardDms(interaction, panelPayload) {
  const reward = panelPayload?._challengeRewardNotice;
  if (!reward?.memberIds?.length) return;
  const guildName = interaction.guild?.name ?? 'Unknown Guild';
  const guildIcon = interaction.guild?.iconURL?.({ dynamic: true }) ?? undefined;
  const guildId = interaction.guild?.id ?? interaction.guildId;
  if (!guildId) return;
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎉 Alliance Challenge Completed')
    .setDescription([
      `Alliance: **${reward.allianceName}**`,
      `Challenge: **${reward.challengeName}**`,
      `Reward: **${economy.toCookieNumber(reward.rewardCookiesPerMember)}** cookies`,
      `Alliance credits gained: **${reward.rewardAllianceCoins}**`,
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: guildName, iconURL: guildIcon });
  sendAllianceBroadcastInbox(guildId, reward.memberIds, embed);
}

async function notifyUpgradePurchase(interaction, alliance, upgrade) {
  if (!alliance || !upgrade) return;
  const guildName = interaction.guild?.name ?? 'Unknown Guild';
  const guildIcon = interaction.guild?.iconURL?.({ dynamic: true }) ?? undefined;
  const guildId = interaction.guild?.id ?? interaction.guildId;
  if (!guildId) return;
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🛍️ Alliance Upgrade Purchased')
    .setDescription([
      `Alliance: **${alliance.name}**`,
      `Purchased by: <@${interaction.user.id}>`,
      `Upgrade: **${upgrade.name}**`,
      `Effect: ${upgrade.description}`,
      `Cost: **${upgrade.cost}** alliance credits`,
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: guildName, iconURL: guildIcon });
  sendAllianceBroadcastInbox(guildId, alliance.members, embed);
}

function stripPanelMeta(panelPayload) {
  const { _challengeRewardNotice, ...response } = panelPayload;
  return response;
}

function formatHoursFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0h';
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return `${hours}h`;
}

function buildAllianceBoostSummary(data) {
  const rankBoostPct = Math.round(((data.allianceRankBoost?.cpsBoostMultiplier ?? 0) * 100));
  const storeBoostPct = Math.round(((data.store?.effectTotals?.allianceCpsBoost ?? 0) * 100));
  const boosterBoostPct = Math.round(((data.allianceBoosterBoost?.allianceWideBoost ?? 0) * 100));
  const lines = [
    `Rank boost: **+${rankBoostPct}% CPS**`,
    `Store CPS boost: **+${storeBoostPct}% CPS**`,
    `Alliance booster-member boost: **+${boosterBoostPct}% CPS**`,
  ];
  return lines.join('\n');
}

function buildAllianceAdEmbed(guild, data) {
  const alliance = data.alliance;
  const description = String(alliance.description ?? '').trim() || '_No description set._';
  const memberCount = (alliance.members ?? []).length;
  const openSlots = Math.max(0, alliances.MAX_ALLIANCE_MEMBERS - memberCount);
  const challengeName = data.challenge?.challenge?.name ?? 'Weekly Challenge';
  const challengeProgress = data.challenge
    ? `${economy.toCookieNumber(data.challenge.progress)} / ${economy.toCookieNumber(data.challenge.target)}`
    : 'N/A';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🤝 Alliance Recruitment — ${alliance.name}`)
    .setDescription(description.slice(0, 4096))
    .addFields(
      { name: 'Owner', value: `<@${alliance.ownerId}>`, inline: true },
      { name: 'Members', value: `${memberCount}/${alliances.MAX_ALLIANCE_MEMBERS}`, inline: true },
      { name: 'Open Slots', value: `${openSlots}`, inline: true },
      { name: 'Current Boosts', value: buildAllianceBoostSummary(data).slice(0, 1024), inline: false },
      { name: 'Weekly Challenge', value: `**${challengeName}**\nProgress: **${challengeProgress}**`, inline: false },
      { name: 'Join Policy', value: alliance.joinApprovalEnabled ? 'Approval required (request will be sent)' : 'Instant join enabled', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
}

async function resolveInteractionGuild(interaction) {
  if (interaction.guild) return interaction.guild;
  if (!interaction.guildId) return null;
  return interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
}

function replyGuildUnavailable(interaction) {
  return interaction.reply({
    embeds: [embeds.error('Guild context is unavailable. Please run `/alliance` again.', null)],
    flags: MessageFlags.Ephemeral,
  });
}

function withEphemeralFlags(payload = {}) {
  if (payload.flags !== undefined) return payload;
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isExpectedInteractionAcknowledgeError(error) {
  if (!error || typeof error !== 'object') return false;
  const code = Number(error.code);
  if (code === 40060 || code === 10062) return true;
  const message = String(error.message ?? '').toLowerCase();
  return message.includes('already been acknowledged') || message.includes('unknown interaction');
}

function logUnexpectedAcknowledgeError(action, error) {
  if (isExpectedInteractionAcknowledgeError(error)) return;
  console.warn(`[alliance] Failed to ${action}:`, error);
}

async function tryDeferUpdate(interaction) {
  try {
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferUpdate();
  } catch (error) {
    logUnexpectedAcknowledgeError('defer update', error);
  }
}

async function tryDeferReply(interaction) {
  try {
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    logUnexpectedAcknowledgeError('defer reply', error);
  }
}

async function respondEphemeral(interaction, payload) {
  const response = withEphemeralFlags(payload);
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(response);
  }
  return interaction.reply(response);
}

async function respondWithPanelUpdate(interaction, panelPayload) {
  await maybeSendChallengeRewardDms(interaction, panelPayload);
  const response = stripPanelMeta(panelPayload);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(response);
  }
  return interaction.update(response);
}

async function respondWithPanelReply(interaction, panelPayload) {
  await maybeSendChallengeRewardDms(interaction, panelPayload);
  const response = stripPanelMeta(panelPayload);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(response);
  }
  return interaction.reply(withEphemeralFlags(response));
}

async function handleAllianceButton(interaction) {
  const [, action, viewRaw] = interaction.customId.split(':');
  const view = PANEL_VIEWS.includes(viewRaw) ? viewRaw : 'overview';

  // These actions open a modal — must acknowledge with showModal, cannot defer first.
  if (action === 'create') return interaction.showModal(buildCreateAllianceModal());
  if (action === 'join') return interaction.showModal(buildJoinAllianceModal());
  if (action === 'rename') return interaction.showModal(buildRenameAllianceModal());
  if (action === 'edit_description') {
    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please run `/alliance` again.', null)] });
    }
    const current = alliances.getMemberAlliance(guild.id, interaction.user.id);
    if (!current) {
      return respondEphemeral(interaction, { embeds: [embeds.error('You are not in an alliance.', guild)] });
    }
    if (current.ownerId !== interaction.user.id) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Only the alliance owner can edit the description.', guild)] });
    }
    return interaction.showModal(buildEditAllianceDescriptionModal(current.description ?? ''));
  }

  // All other actions update the panel — defer immediately to acknowledge within 3 seconds
  // before running any DB or async work.
  await tryDeferUpdate(interaction);
  const guild = await resolveInteractionGuild(interaction);
  if (!guild) {
    return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please run `/alliance` again.', null)] });
  }

  if (action === 'refresh') {
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, view));
  }
  if (action === 'toggle_approval') {
    const current = alliances.getMemberAlliance(guild.id, interaction.user.id);
    if (!current) {
      return respondEphemeral(interaction, { embeds: [embeds.error('You are not in an alliance.', guild)] });
    }
    const result = alliances.setAllianceJoinApproval(guild.id, interaction.user.id, !current.joinApprovalEnabled);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    const statusText = result.alliance.joinApprovalEnabled ? 'enabled' : 'disabled';
    return respondWithPanelUpdate(
      interaction,
      buildAlliancePanel(guild, interaction.user.id, 'manage', `Join approval is now **${statusText}**.`),
    );
  }
  if (action === 'leave') {
    const result = alliances.leaveAlliance(guild.id, interaction.user.id);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, 'overview', 'You left your alliance.'));
  }
  if (action === 'post_ad') {
    const adSpendResult = alliances.spendAllianceAdCredits(guild.id, interaction.user.id, Date.now());
    if (!adSpendResult.ok) {
      if (Number.isFinite(adSpendResult.remainingMs) && adSpendResult.remainingMs > 0) {
        return respondEphemeral(interaction, {
          embeds: [embeds.error(`Alliance ad cooldown active. Try again in **${formatHoursFromMs(adSpendResult.remainingMs)}**.`, guild)],
        });
      }
      return respondEphemeral(interaction, { embeds: [embeds.error(adSpendResult.reason, guild)] });
    }

    const refreshed = alliances.getAllianceWithChallenge(guild.id, interaction.user.id);
    if (!refreshed?.alliance) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Alliance data is unavailable right now.', guild)] });
    }

    const adEmbed = buildAllianceAdEmbed(guild, refreshed);
    const joinButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`alliance_ad_join:${refreshed.alliance.id}`)
        .setLabel(refreshed.alliance.joinApprovalEnabled ? 'Request to Join' : 'Join Alliance')
        .setStyle(ButtonStyle.Success)
        .setEmoji(economy.getButtonEmoji(guild, ['International_exchange', 'marketplace'], '🤝')),
    );
    const eventChannel = await fetchLogChannel(guild, 'cookieEvents');
    if (!eventChannel) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Event channel is unavailable. No credits were refunded.', guild)] });
    }
    const sentAdMessage = await eventChannel.send({ embeds: [adEmbed], components: [joinButton] }).catch(() => null);
    if (!sentAdMessage) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Failed to post alliance ad in the event channel. No credits were refunded.', guild)] });
    }
    return respondWithPanelUpdate(
      interaction,
      buildAlliancePanel(
        guild,
        interaction.user.id,
        'store',
        `Alliance ad posted in <#${eventChannel.id}>. Spent **${adSpendResult.spentCredits}** alliance credits. Next ad available <t:${Math.floor(adSpendResult.nextAvailableAt / 1000)}:R>.`,
      ),
    );
  }
  return null;
}

async function handleAllianceAdJoinButton(interaction) {
  // Defer immediately — joinAlliance triggers refreshGuildAllianceBoosts which is expensive.
  await tryDeferReply(interaction);
  const guild = await resolveInteractionGuild(interaction);
  if (!guild) {
    return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please try again.', null)] });
  }
  const [, allianceId] = String(interaction.customId ?? '').split(':');
  if (!allianceId) {
    return respondEphemeral(interaction, { embeds: [embeds.error('Invalid alliance ad button.', guild)] });
  }
  const result = alliances.joinAlliance(guild.id, interaction.user.id, allianceId);
  if (!result.ok) {
    return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
  }
  const notice = result.pendingApproval
    ? `Join request sent to **${result.alliance.name}**. Check \`/messages\` for updates.`
    : `You joined **${result.alliance.name}**.`;
  return respondEphemeral(interaction, { embeds: [embeds.success(notice, guild)] });
}

async function handleAllianceSelect(interaction) {
  // This action opens a modal — must acknowledge with showModal, cannot defer first.
  if (interaction.customId === 'alliance_remove_select') {
    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please run `/alliance` again.', null)] });
    }
    const memberId = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`alliance_modal:kick_reason:${memberId}`)
      .setTitle('Kick Member')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200)
            .setPlaceholder('e.g. Inactive, rule violation, etc.'),
        ),
      );
    return interaction.showModal(modal);
  }

  // All other selects update the panel — defer immediately before any DB or async work.
  await tryDeferUpdate(interaction);
  const guild = await resolveInteractionGuild(interaction);
  if (!guild) {
    return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please run `/alliance` again.', null)] });
  }

  if (interaction.customId === 'alliance_nav_select') {
    const view = interaction.values[0] ?? 'overview';
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, view));
  }
  if (interaction.customId === 'alliance_join_select') {
    const allianceId = interaction.values[0];
    const result = alliances.joinAlliance(guild.id, interaction.user.id, allianceId);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    const notice = result.pendingApproval
      ? `Join request submitted to **${result.alliance.name}**.`
      : `You joined **${result.alliance.name}**.`;
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, 'overview', notice));
  }
  if (interaction.customId === 'alliance_store_select') {
    const upgradeId = interaction.values[0];
    const result = alliances.buyAllianceUpgrade(guild.id, interaction.user.id, upgradeId);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    await notifyUpgradePurchase(interaction, result.alliance, result.upgrade);
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, 'store', `Purchased **${result.upgrade.name}**.`));
  }
  if (interaction.customId === 'alliance_store_sell_select') {
    const upgradeId = interaction.values[0];
    const result = alliances.sellAllianceUpgrade(guild.id, interaction.user.id, upgradeId);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    return respondWithPanelUpdate(
      interaction,
      buildAlliancePanel(guild, interaction.user.id, 'store', `Sold **${result.upgrade.name}** for **${result.refund}** alliance credits (30% loss).`),
    );
  }
  if (interaction.customId === 'alliance_transfer_select') {
    const memberId = interaction.values[0];
    const result = alliances.transferAllianceOwnership(guild.id, interaction.user.id, memberId);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, 'manage', `Ownership transferred to <@${memberId}>.`));
  }
  if (interaction.customId === 'alliance_request_action_select') {
    const [action, memberId] = String(interaction.values[0] ?? '').split(':');
    const approve = action === 'approve';
    if (!memberId || (action !== 'approve' && action !== 'deny')) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Invalid join-request action.', guild)] });
    }
    const result = alliances.resolveAllianceJoinRequest(guild.id, interaction.user.id, memberId, approve);
    if (!result.ok) {
      return respondEphemeral(interaction, { embeds: [embeds.error(result.reason, guild)] });
    }
    const notice = approve
      ? `Approved join request for <@${memberId}>.`
      : `Denied join request for <@${memberId}>.`;
    return respondWithPanelUpdate(interaction, buildAlliancePanel(guild, interaction.user.id, 'manage', notice));
  }
  return null;
}

async function handleAllianceModal(interaction) {
  // Defer reply immediately — panel building involves multiple synchronous DB reads.
  await tryDeferReply(interaction);
  const guild = await resolveInteractionGuild(interaction);
  if (!guild) {
    return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please run `/alliance` again.', null)] });
  }
  const parts = interaction.customId.split(':');
  const modalType = parts[1];

  if (modalType === 'create') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const result = alliances.createAlliance(guild.id, interaction.user.id, name);
    if (!result.ok) {
      return respondEphemeral(interaction, {
        embeds: [embeds.error(result.reason, guild)],
      });
    }
    return respondWithPanelReply(
      interaction,
      buildAlliancePanel(guild, interaction.user.id, 'overview', `Alliance created: **${result.alliance.name}** (ID: \`${result.alliance.id}\`).`),
    );
  }

  if (modalType === 'join') {
    const value = interaction.fields.getTextInputValue('alliance').trim();
    const result = alliances.joinAlliance(guild.id, interaction.user.id, value);
    if (!result.ok) {
      return respondEphemeral(interaction, {
        embeds: [embeds.error(result.reason, guild)],
      });
    }
    const notice = result.pendingApproval
      ? `Join request submitted to **${result.alliance.name}**.`
      : `You joined **${result.alliance.name}**.`;
    return respondWithPanelReply(interaction, buildAlliancePanel(guild, interaction.user.id, 'overview', notice));
  }

  if (modalType === 'rename') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const result = alliances.renameAlliance(guild.id, interaction.user.id, name);
    if (!result.ok) {
      return respondEphemeral(interaction, {
        embeds: [embeds.error(result.reason, guild)],
      });
    }
    return respondWithPanelReply(interaction, buildAlliancePanel(guild, interaction.user.id, 'manage', `Alliance renamed to **${result.alliance.name}**.`));
  }

  if (modalType === 'edit_description') {
    const description = interaction.fields.getTextInputValue('description')?.trim() ?? '';
    const result = alliances.setAllianceDescription(guild.id, interaction.user.id, description);
    if (!result.ok) {
      return respondEphemeral(interaction, {
        embeds: [embeds.error(result.reason, guild)],
      });
    }
    const notice = description
      ? 'Alliance description updated.'
      : 'Alliance description cleared.';
    return respondWithPanelReply(interaction, buildAlliancePanel(guild, interaction.user.id, 'manage', notice));
  }

  if (modalType === 'kick_reason') {
    const targetMemberId = parts[2];
    if (!targetMemberId) return null;
    const reason = interaction.fields.getTextInputValue('reason')?.trim() ?? '';
    const result = alliances.removeAllianceMember(guild.id, interaction.user.id, targetMemberId, reason);
    if (!result.ok) {
      return respondEphemeral(interaction, {
        embeds: [embeds.error(result.reason, guild)],
      });
    }
    const notice = reason
      ? `Kicked <@${targetMemberId}> from the alliance. Reason: *${reason}*`
      : `Kicked <@${targetMemberId}> from the alliance.`;
    return respondWithPanelReply(interaction, buildAlliancePanel(guild, interaction.user.id, 'manage', notice));
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alliance')
    .setDescription('Open the unified alliance panel for challenges, management, and store upgrades.')
    .setDMPermission(false),

  async execute(interaction) {
    await tryDeferReply(interaction);
    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return respondEphemeral(interaction, { embeds: [embeds.error('Guild context is unavailable. Please try again.', null)] });
    }
    return respondWithPanelReply(interaction, buildAlliancePanel(guild, interaction.user.id, 'overview'));
  },

  isAllianceButtonCustomId(customId) {
    return String(customId ?? '').startsWith('alliance_btn:');
  },

  isAllianceSelectCustomId(customId) {
    const value = String(customId ?? '');
    return value === 'alliance_nav_select'
      || value === 'alliance_join_select'
      || value === 'alliance_store_select'
      || value === 'alliance_store_sell_select'
      || value === 'alliance_transfer_select'
      || value === 'alliance_remove_select'
      || value === 'alliance_request_action_select';
  },

  isAllianceAdJoinButtonCustomId(customId) {
    return String(customId ?? '').startsWith('alliance_ad_join:');
  },

  isAllianceModalCustomId(customId) {
    return String(customId ?? '').startsWith('alliance_modal:');
  },

  handleAllianceButton,
  handleAllianceAdJoinButton,
  handleAllianceSelect,
  handleAllianceModal,
};
