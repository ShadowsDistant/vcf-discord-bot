'use strict';

const { ContainerBuilder, MessageFlags } = require('discord.js');

const MAX_DISPLAY_TEXT = 4000;

function normalizeFlags(flags, ephemeral) {
  let resolved = 0;
  if (typeof flags === 'number') {
    resolved = flags;
  } else if (typeof flags === 'bigint') {
    resolved = Number(flags);
  } else if (flags && typeof flags.bitfield !== 'undefined') {
    resolved = Number(flags.bitfield);
  }

  if (ephemeral) resolved |= MessageFlags.Ephemeral;
  return resolved;
}

function hasFlag(flags, flag) {
  return (normalizeFlags(flags, false) & flag) === flag;
}

function toEmbedData(embed) {
  if (!embed) return null;
  if (typeof embed.toJSON === 'function') return embed.toJSON();
  if (embed.data && typeof embed.data === 'object') return embed.data;
  if (typeof embed === 'object') return embed;
  return null;
}

function buildEmbedText(embedData) {
  if (!embedData) return '';
  const chunks = [];

  if (embedData.author?.name) chunks.push(`### ${embedData.author.name}`);
  if (embedData.title) chunks.push(`## ${embedData.title}`);
  if (embedData.description) chunks.push(embedData.description);

  if (Array.isArray(embedData.fields) && embedData.fields.length > 0) {
    for (const field of embedData.fields) {
      const name = field?.name ?? 'Field';
      const value = field?.value ?? '';
      chunks.push(`**${name}**\n${value}`);
    }
  }

  if (embedData.footer?.text) chunks.push(`*${embedData.footer.text}*`);

  return chunks.filter(Boolean).join('\n\n').trim();
}

/**
 * Converts a legacy message payload with action rows into Components V2 display payload.
 * @param {object} payload - Discord.js message options (e.g., content/embeds/components/flags).
 * @param {"create"|"edit"} [mode='create'] - Use 'edit' when editing an existing message.
 * @param {boolean} [addV2Flag=true] - When true, applies MessageFlags.IsComponentsV2.
 * @returns {object} Transformed payload when conversion applies, otherwise the original payload.
 */
function createDisplayPayload(payload, mode = 'create', addV2Flag = true) {
  if (!payload || typeof payload !== 'object') return payload;
  if (!Array.isArray(payload.components) || payload.components.length === 0) return payload;
  if (hasFlag(payload.flags, MessageFlags.IsComponentsV2)) return payload;

  const next = { ...payload };
  const container = new ContainerBuilder();

  let remainingChars = MAX_DISPLAY_TEXT;
  const appendText = (text) => {
    if (!text || remainingChars <= 0) return;
    const normalized = String(text).trim();
    if (!normalized) return;
    const block = normalized.slice(0, remainingChars);
    if (!block) return;
    remainingChars -= block.length;
    container.addTextDisplayComponents((textDisplay) => textDisplay.setContent(block));
  };

  if (typeof next.content === 'string' && next.content.trim()) {
    appendText(next.content);
  }

  const embeds = Array.isArray(next.embeds) ? next.embeds : [];
  for (const embed of embeds) {
    const embedData = toEmbedData(embed);
    if (embedData?.color && typeof container.setAccentColor === 'function') {
      container.setAccentColor(embedData.color);
    }
    appendText(buildEmbedText(embedData));
    if (remainingChars <= 0) break;
  }

  for (const row of next.components) {
    const rowComponents = Array.isArray(row?.components)
      ? row.components
      : Array.isArray(row?.data?.components)
        ? row.data.components
        : null;
    if (!rowComponents || rowComponents.length === 0) continue;
    container.addActionRowComponents((actionRow) => actionRow.setComponents(...rowComponents));
  }

  next.components = [container];
  delete next.ephemeral;
  if (mode === 'edit') {
    next.content = null;
    next.embeds = null;
    next.poll = null;
    next.stickers = null;
  } else {
    delete next.content;
    delete next.embeds;
    delete next.poll;
    delete next.stickers;
  }

  if (addV2Flag) {
    next.flags = normalizeFlags(next.flags, payload.ephemeral) | MessageFlags.IsComponentsV2;
  } else if (payload.ephemeral) {
    next.flags = normalizeFlags(next.flags, true);
  }

  return next;
}

function messageIsV2(message) {
  const flags = message?.flags;
  if (!flags) return false;
  if (typeof flags.has === 'function') return flags.has(MessageFlags.IsComponentsV2);
  return (Number(flags?.bitfield ?? flags) & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2;
}

function patchInteractionDisplayComponents(interaction) {
  if (!interaction || interaction.__displayComponentsPatched) return interaction;
  interaction.__displayComponentsPatched = true;

  const originalReply = interaction.reply?.bind(interaction);
  if (originalReply) {
    interaction.reply = async (options) => {
      const converted = createDisplayPayload(options, 'create', true);
      if (converted !== options) interaction.__displayComponentsReplyV2 = true;
      return originalReply(converted);
    };
  }

  const originalFollowUp = interaction.followUp?.bind(interaction);
  if (originalFollowUp) {
    interaction.followUp = async (options) => originalFollowUp(createDisplayPayload(options, 'create', true));
  }

  const originalEditReply = interaction.editReply?.bind(interaction);
  if (originalEditReply) {
    interaction.editReply = async (options) => {
      const shouldConvert = interaction.__displayComponentsReplyV2 === true;
      if (!shouldConvert) return originalEditReply(options);
      return originalEditReply(createDisplayPayload(options, 'edit', false));
    };
  }

  const originalUpdate = interaction.update?.bind(interaction);
  if (originalUpdate) {
    interaction.update = async (options) => {
      if (!messageIsV2(interaction.message)) return originalUpdate(options);
      return originalUpdate(createDisplayPayload(options, 'edit', false));
    };
  }

  return interaction;
}

module.exports = {
  createDisplayPayload,
  patchInteractionDisplayComponents,
};
