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

function buildNavigationSelect(currentView) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('alliance_nav_select')
      .setPlaceholder('Navigate alliance panel')
      .addOptions(
        { label: 'Overview', value: 'overview', description: 'Alliance info, members, and current summary.', default: currentView === 'overview' },
        { label: 'Challenge', value: 'challenge', description: 'Weekly challenge progress and contributors.', default: currentView === 'challenge' },
        { label: 'Store', value: 'store', description: 'Alliance-wide upgrades and available credits.', default: currentView === 'store' },
        { label: 'Manage', value: 'manage', description: 'Owner actions like rename, transfer, and member removal.', default: currentView === 'manage' },
        { label: 'Leaderboard', value: 'leaderboard', description: 'Top alliances by total CPS.', default: currentView === 'leaderboard' },
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
  if (!ranking.length) return 'No alliances yet.';
  return ranking
    .slice(0, 10)
    .map((entry, idx) => `${idx + 1}. **${entry.name}** — CPS **${economy.toCookieNumber(entry.cpsTotal)}** (${entry.memberCount} members)`)
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

function buildManageSelects(data, userId) {
  if (!data.alliance || data.alliance.ownerId !== userId) return [];
  const memberIds = data.alliance.members.filter((memberId) => memberId !== userId).slice(0, 25);
  const requestIds = (data.alliance.joinRequests ?? []).map((entry) => entry.userId).slice(0, 25);
  const rows = [];

  if (memberIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('alliance_transfer_select')
          .setPlaceholder('Transfer alliance ownership')
          .addOptions(memberIds.map((memberId) => ({
            label: `Member ${memberId}`.slice(0, 100),
            value: memberId,
            description: 'Transfer leadership to this member.',
          }))),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('alliance_remove_select')
          .setPlaceholder('Remove alliance member')
          .addOptions(memberIds.map((memberId) => ({
            label: `Member ${memberId}`.slice(0, 100),
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
          label: `Approve ${memberId}`.slice(0, 100),
          value: `approve:${memberId}`,
          description: 'Approve and add this user to the alliance.',
        },
        {
          label: `Deny ${memberId}`.slice(0, 100),
          value: `deny:${memberId}`,
          description: 'Deny this join request.',
        },
      ]));
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('alliance_request_action_select')
          .setPlaceholder('Review pending join requests')
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
      );
  } else if (view === 'store') {
    const ownedText = store.upgrades
      .filter((upgrade) => upgrade.owned)
      .map((upgrade) => `${economy.getButtonEmoji(guild, upgrade.emojiCandidates, upgrade.fallbackEmoji)} **${upgrade.name}**`)
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
          ].join('\n'),
          inline: false,
        },
      );
    const storeSelect = buildStoreSelect(guild, store);
    if (storeSelect) components.push(storeSelect);
  } else if (view === 'manage') {
    baseEmbed
      .setColor(0xed4245)
      .setTitle(`🛠️ Alliance Management — ${data.alliance.name}`)
      .setDescription(data.alliance.ownerId === userId
        ? 'Owner controls are available below.'
        : 'Only the alliance owner can manage alliance settings.')
      .addFields(
        { name: 'Members', value: memberLines(data.alliance.members), inline: false },
        { name: 'Join Approval', value: data.alliance.joinApprovalEnabled ? 'Enabled (owner approval required)' : 'Disabled (instant join)', inline: false },
        { name: 'Pending Requests', value: `${(data.alliance.joinRequests ?? []).length}`, inline: true },
      );
    components.push(...buildManageSelects(data, userId));
  } else if (view === 'leaderboard') {
    baseEmbed
      .setColor(0x5865f2)
      .setTitle('🏆 Alliance Leaderboard')
      .setDescription(topLeaderboard);
  } else {
    baseEmbed.addFields(
      { name: 'Members', value: memberLines(data.alliance.members), inline: false },
      { name: 'Weekly Challenge', value: `**${challenge.challenge.name}**\n${challengeStatus}`, inline: false },
      { name: 'Progress', value: `${challengeProgressText}\n${challengeBar}`, inline: false },
      { name: 'Top Contributors', value: contributorLines(challenge.contributors), inline: false },
      { name: 'Join Approval', value: data.alliance.joinApprovalEnabled ? 'Enabled' : 'Disabled', inline: true },
    );
  }

  const notices = [notice, rewardGrantedNow].filter(Boolean);
  if (notices.length) {
    baseEmbed.addFields({ name: 'Notice', value: notices.join('\n').slice(0, 1024), inline: false });
  }

  return { embeds: [baseEmbed], components, _challengeRewardNotice: data.challenge?.rewardGrantedNow ?? null };
}

async function sendAllianceBroadcastDm(client, guild, memberIds, embed) {
  for (const memberId of memberIds ?? []) {
    const user = await client.users.fetch(memberId).catch(() => null);
    if (!user) continue;
    await user.send({ embeds: [embed] }).catch(() => null);
  }
}

async function maybeSendChallengeRewardDms(interaction, panelPayload) {
  const reward = panelPayload?._challengeRewardNotice;
  if (!reward?.memberIds?.length) return;
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
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined });
  await sendAllianceBroadcastDm(interaction.client, interaction.guild, reward.memberIds, embed);
}

async function notifyUpgradePurchase(interaction, alliance, upgrade) {
  if (!alliance || !upgrade) return;
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
    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined });
  await sendAllianceBroadcastDm(interaction.client, interaction.guild, alliance.members, embed);
}

function stripPanelMeta(panelPayload) {
  const { _challengeRewardNotice, ...response } = panelPayload;
  return response;
}

async function respondWithPanelUpdate(interaction, panelPayload) {
  await maybeSendChallengeRewardDms(interaction, panelPayload);
  return interaction.update(stripPanelMeta(panelPayload));
}

async function respondWithPanelReply(interaction, panelPayload) {
  await maybeSendChallengeRewardDms(interaction, panelPayload);
  return interaction.reply({
    ...stripPanelMeta(panelPayload),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAllianceButton(interaction) {
  const [, action, viewRaw] = interaction.customId.split(':');
  const view = PANEL_VIEWS.includes(viewRaw) ? viewRaw : 'overview';

  if (action === 'refresh') {
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, view));
  }
  if (action === 'create') return interaction.showModal(buildCreateAllianceModal());
  if (action === 'join') return interaction.showModal(buildJoinAllianceModal());
  if (action === 'rename') return interaction.showModal(buildRenameAllianceModal());
  if (action === 'toggle_approval') {
    const current = alliances.getMemberAlliance(interaction.guild.id, interaction.user.id);
    if (!current) {
      return interaction.reply({ embeds: [embeds.error('You are not in an alliance.', interaction.guild)], flags: MessageFlags.Ephemeral });
    }
    const result = alliances.setAllianceJoinApproval(interaction.guild.id, interaction.user.id, !current.joinApprovalEnabled);
    if (!result.ok) {
      return interaction.reply({ embeds: [embeds.error(result.reason, interaction.guild)], flags: MessageFlags.Ephemeral });
    }
    const statusText = result.alliance.joinApprovalEnabled ? 'enabled' : 'disabled';
    return respondWithPanelUpdate(
      interaction,
      buildAlliancePanel(interaction.guild, interaction.user.id, 'manage', `Join approval is now **${statusText}**.`),
    );
  }
  if (action === 'leave') {
    const result = alliances.leaveAlliance(interaction.guild.id, interaction.user.id);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'overview', 'You left your alliance.'));
  }
  return null;
}

async function handleAllianceSelect(interaction) {
  if (interaction.customId === 'alliance_nav_select') {
    const view = interaction.values[0] ?? 'overview';
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, view));
  }
  if (interaction.customId === 'alliance_join_select') {
    const allianceId = interaction.values[0];
    const result = alliances.joinAlliance(interaction.guild.id, interaction.user.id, allianceId);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    const notice = result.pendingApproval
      ? `Join request submitted to **${result.alliance.name}**.`
      : `You joined **${result.alliance.name}**.`;
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'overview', notice));
  }
  if (interaction.customId === 'alliance_store_select') {
    const upgradeId = interaction.values[0];
    const result = alliances.buyAllianceUpgrade(interaction.guild.id, interaction.user.id, upgradeId);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    await notifyUpgradePurchase(interaction, result.alliance, result.upgrade);
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'store', `Purchased **${result.upgrade.name}**.`));
  }
  if (interaction.customId === 'alliance_transfer_select') {
    const memberId = interaction.values[0];
    const result = alliances.transferAllianceOwnership(interaction.guild.id, interaction.user.id, memberId);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'manage', `Ownership transferred to <@${memberId}>.`));
  }
  if (interaction.customId === 'alliance_remove_select') {
    const memberId = interaction.values[0];
    const result = alliances.removeAllianceMember(interaction.guild.id, interaction.user.id, memberId);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'manage', `Removed <@${memberId}> from the alliance.`));
  }
  if (interaction.customId === 'alliance_request_action_select') {
    const [action, memberId] = String(interaction.values[0] ?? '').split(':');
    const approve = action === 'approve';
    if (!memberId || (action !== 'approve' && action !== 'deny')) {
      return interaction.reply({ embeds: [embeds.error('Invalid join-request action.', interaction.guild)], flags: MessageFlags.Ephemeral });
    }
    const result = alliances.resolveAllianceJoinRequest(interaction.guild.id, interaction.user.id, memberId, approve);
    if (!result.ok) {
      return interaction.reply({ embeds: [embeds.error(result.reason, interaction.guild)], flags: MessageFlags.Ephemeral });
    }
    const notice = approve
      ? `Approved join request for <@${memberId}>.`
      : `Denied join request for <@${memberId}>.`;
    return respondWithPanelUpdate(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'manage', notice));
  }
  return null;
}

async function handleAllianceModal(interaction) {
  const [, modalType] = interaction.customId.split(':');

  if (modalType === 'create') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const result = alliances.createAlliance(interaction.guild.id, interaction.user.id, name);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return respondWithPanelReply(
      interaction,
      buildAlliancePanel(interaction.guild, interaction.user.id, 'overview', `Alliance created: **${result.alliance.name}** (ID: \`${result.alliance.id}\`).`),
    );
  }

  if (modalType === 'join') {
    const value = interaction.fields.getTextInputValue('alliance').trim();
    const result = alliances.joinAlliance(interaction.guild.id, interaction.user.id, value);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    const notice = result.pendingApproval
      ? `Join request submitted to **${result.alliance.name}**.`
      : `You joined **${result.alliance.name}**.`;
    return respondWithPanelReply(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'overview', notice));
  }

  if (modalType === 'rename') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const result = alliances.renameAlliance(interaction.guild.id, interaction.user.id, name);
    if (!result.ok) {
      return interaction.reply({
        embeds: [embeds.error(result.reason, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return respondWithPanelReply(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'manage', `Alliance renamed to **${result.alliance.name}**.`));
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alliance')
    .setDescription('Open the unified alliance panel for challenges, management, and store upgrades.')
    .setDMPermission(false),

  async execute(interaction) {
    return respondWithPanelReply(interaction, buildAlliancePanel(interaction.guild, interaction.user.id, 'overview'));
  },

  isAllianceButtonCustomId(customId) {
    return String(customId ?? '').startsWith('alliance_btn:');
  },

  isAllianceSelectCustomId(customId) {
    const value = String(customId ?? '');
    return value === 'alliance_nav_select'
      || value === 'alliance_join_select'
      || value === 'alliance_store_select'
      || value === 'alliance_transfer_select'
      || value === 'alliance_remove_select'
      || value === 'alliance_request_action_select';
  },

  isAllianceModalCustomId(customId) {
    return String(customId ?? '').startsWith('alliance_modal:');
  },

  handleAllianceButton,
  handleAllianceSelect,
  handleAllianceModal,
};
