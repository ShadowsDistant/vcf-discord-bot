'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const OpenAI = require('openai');
const { isDevUser } = require('../../utils/roles');

// ── Constants ───────────────────────────────────────────────────────────────────
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? '';
const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'openai/gpt-oss-120b';
const MAX_TOKENS = 4096;
const TEMPERATURE = 1.0;
const TOP_P = 1.0;
const MAX_ITERATIONS = 10;
const DEFAULT_COLOR = 0x99aab5; // default grey
const CONFIRMATION_TIMEOUT_MS = 30_000;
const REVIEW_TIMEOUT_MS = 15 * 60_000;
const MODAL_SUBMIT_TIMEOUT_MS = 120_000;
const DESC_MAX = 4096;
const FIELD_VALUE_MAX = 1024;
const FIELDS_MAX = 25;
const MAX_LINK_BUTTONS = 10;
const NO_RESPONSE_TEXT = '*(No response)*';
const CHUNK_NEWLINE_SPLIT_THRESHOLD = 0.5;
const LOADING_EMOJI = '<a:loading:1493407458180468996>';
const AI_HARDCODED_ALLOW_IDS = new Set(['1272344731526889544']);
const AI_REVIEW_BUTTON_ID = 'ai_review_details';
const AI_OUTPUT_BUTTON_ID = 'ai_output_view';
const AI_CONTINUE_BUTTON_ID = 'ai_continue_conversation';
const AI_PAGE_PREV_BUTTON_ID = 'ai_page_prev';
const AI_PAGE_NEXT_BUTTON_ID = 'ai_page_next';
const AI_TURN_PREV_BUTTON_ID = 'ai_turn_prev';
const AI_TURN_NEXT_BUTTON_ID = 'ai_turn_next';
const AI_CONTINUE_MODAL_ID = 'ai_continue_modal';
const AI_CONTINUE_PROMPT_INPUT_ID = 'ai_continue_prompt';
const AI_UI_BUTTON_PREFIX = 'ai_ui_button:';
const AI_UI_SELECT_PREFIX = 'ai_ui_select:';
const AI_UI_MODAL_PREFIX = 'ai_ui_modal:';
const AI_MODEL_LABEL = 'Valley AI';
const AI_SESSIONS = new Map();
const MAX_CUSTOM_ID_BASE_LENGTH = 48; // keeps prefixed custom IDs within Discord's 100-char limit
const MAX_CONVERSATION_MESSAGES = 60;

const aiClient = new OpenAI({
  baseURL: NVIDIA_API_BASE,
  apiKey: NVIDIA_API_KEY,
});

// ── System prompt ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Valley AI, created by shadowsdistant.
You are an assistant operating inside VCF (Valley Correctional Facility), a roleplay faction for the Roblox game Valley Prison.
You have access to Discord management tools and a web search tool.

Guidelines:
- Use Discord tools only when the request explicitly requires Discord interaction (reading/modifying the server).
- Use the web search tool only when the request needs up-to-date information or web lookup.
- For dangerous actions (kick/ban/timeout members, delete channels or messages, create roles), clearly state what you intend to do — the system will ask the user to confirm before executing.
- Do not output code snippets, code fences, or raw executable code in responses.
- ALWAYS respond with a valid JSON object matching this exact embed schema (no markdown fences, just raw JSON):

{
  "title": "Optional title string or null",
  "description": "Main response text (required)",
  "color": "#rrggbb or null",
  "fields": [{ "name": "Field Title", "value": "Content", "inline": true }],
  "footer": "Optional footer string or null",
  "thumbnail_url": "Optional thumbnail URL or null",
  "image_url": "Optional image URL or null",
  "author_name": "Optional author name override or null",
  "author_icon_url": "Optional author icon URL or null",
  "link_buttons": [{ "label": "Button label", "url": "https://example.com" }],
  "buttons": [{ "id": "action_key", "label": "Button label", "style": "primary|secondary|success|danger", "ack_message": "Optional short confirmation text or null" }],
  "select_menus": [{ "id": "menu_key", "placeholder": "Choose an option", "min_values": 1, "max_values": 1, "options": [{ "label": "Option", "value": "opt_1", "description": "Optional description", "default": false }] }],
  "modal_buttons": [{ "id": "modal_key", "button_label": "Open form", "button_style": "primary|secondary|success|danger", "title": "Modal title", "submit_message": "Optional short confirmation text or null", "fields": [{ "id": "field_key", "label": "Field label", "style": "short|paragraph", "placeholder": "Optional placeholder", "required": true, "min_length": 0, "max_length": 4000, "value": "Optional default value" }] }]
}

- Use fields for structured/tabular data.
- Use color for thematic tone: red (#ed4245) = error/danger, green (#57f287) = success, blue (#5865f2) = info, yellow (#fee75c) = warning, null = default grey.
- Markdown works in description and field values.
- description max 4096 chars, field values max 1024 chars, max 25 fields.
- If useful, include 0-10 link_buttons using valid https/http URLs.
- You may include interactive buttons/select menus/modal buttons to collect input from the user when helpful.
- Respect Discord limits: max 5 action rows, max 5 buttons per row, max 25 select options, max 5 modal fields.
- Prefer select_menus when asking the user to choose from a finite set of options.
- Select-menu interactions are sent back immediately as user context and should be treated as the user's answer.
- Button/modal interactions are stored as context and can be processed on the next "Continue" prompt.
- If output is paginated, image_url is shown on the first page.
- Keep responses concise and useful.`;

// ── Dangerous tools ──────────────────────────────────────────────────────────────
const DANGEROUS_TOOLS = new Set([
  'ban_member',
  'kick_member',
  'timeout_member',
  'delete_message',
  'create_role',
  'delete_role',
  'delete_channel',
]);

// ── Tool schemas (OpenAI function calling format) ────────────────────────────────
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a Discord channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the target channel.' },
          content: { type: 'string', description: 'The message text to send.' },
        },
        required: ['channel_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_message',
      description: 'Edit an existing message in a Discord channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The channel containing the message.' },
          message_id: { type: 'string', description: 'The ID of the message to edit.' },
          content: { type: 'string', description: 'The new message content.' },
        },
        required: ['channel_id', 'message_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Delete a message from a Discord channel. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The channel containing the message.' },
          message_id: { type: 'string', description: 'The ID of the message to delete.' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_channel_info',
      description: 'Get information about a specific Discord channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_channel_info',
      description: 'Get information about the channel where /ai was used.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_channels',
      description: 'List all channels in the current guild.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_channel_topic',
      description: 'Set the topic of a text channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          topic: { type: 'string', description: 'The new topic text (empty string to clear).' },
        },
        required: ['channel_id', 'topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_info',
      description: 'Get information about a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_members',
      description: 'List members in the guild (up to 100).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of members to return (1–100). Defaults to 50.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_guild_info',
      description: 'Get information about the current Discord guild/server.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_roles',
      description: 'List all roles in the guild.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_role',
      description: 'Create a new role in the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new role.' },
          color: { type: 'string', description: 'The hex color for the role (e.g. "#ff0000"). Optional.' },
          hoist: { type: 'boolean', description: 'Whether to display the role separately in the member list. Optional.' },
          mentionable: { type: 'boolean', description: 'Whether the role can be mentioned. Optional.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_role',
      description: 'Edit an existing role in the guild.',
      parameters: {
        type: 'object',
        properties: {
          role_id: { type: 'string', description: 'The role ID to edit.' },
          name: { type: 'string', description: 'Optional new role name.' },
          color: { type: 'string', description: 'Optional hex color (e.g. "#ff0000").' },
          hoist: { type: 'boolean', description: 'Optional hoist state.' },
          mentionable: { type: 'boolean', description: 'Optional mentionable state.' },
        },
        required: ['role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_role',
      description: 'Delete an existing role in the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          role_id: { type: 'string', description: 'The role ID to delete.' },
        },
        required: ['role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_role',
      description: 'Add a role to a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          role_id: { type: 'string', description: 'The ID of the role to add.' },
        },
        required: ['user_id', 'role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_role',
      description: 'Remove a role from a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          role_id: { type: 'string', description: 'The ID of the role to remove.' },
        },
        required: ['user_id', 'role_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Ban a member from the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to ban.' },
          reason: { type: 'string', description: 'The reason for the ban. Optional.' },
          delete_message_days: { type: 'number', description: 'Number of days of messages to delete (0–7). Optional, defaults to 0.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kick_member',
      description: 'Kick a member from the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to kick.' },
          reason: { type: 'string', description: 'The reason for the kick. Optional.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'timeout_member',
      description: 'Apply a timeout (communication disable) to a guild member. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to time out.' },
          duration_seconds: { type: 'number', description: 'The timeout duration in seconds (max 2419200 = 28 days).' },
          reason: { type: 'string', description: 'The reason for the timeout. Optional.' },
        },
        required: ['user_id', 'duration_seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_channel',
      description: 'Create a new channel in the guild.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new channel.' },
          type: {
            type: 'string',
            enum: ['text', 'voice', 'category', 'announcement', 'forum', 'stage'],
            description: 'The channel type. Defaults to "text".',
          },
          topic: { type: 'string', description: 'The channel topic (text channels only). Optional.' },
          parent_id: { type: 'string', description: 'The category channel ID to place this channel under. Optional.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_channel',
      description: 'Delete a channel from the guild. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel to delete.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pin_message',
      description: 'Pin a message in a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          message_id: { type: 'string', description: 'The ID of the message to pin.' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unpin_message',
      description: 'Unpin a message in a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          message_id: { type: 'string', description: 'The ID of the message to unpin.' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_message_history',
      description: 'Fetch recent message history from a channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          limit: { type: 'number', description: 'Number of messages to retrieve (1–100). Defaults to 25.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_reaction',
      description: 'Add a reaction emoji to a message.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel.' },
          message_id: { type: 'string', description: 'The ID of the message.' },
          emoji: { type: 'string', description: 'The emoji to react with (e.g. "👍" or a custom emoji ID).' },
        },
        required: ['channel_id', 'message_id', 'emoji'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_audit_logs',
      description: 'Get recent guild audit logs for moderation/server management actions.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum entries to return (1–50). Defaults to 10.' },
          user_id: { type: 'string', description: 'Optional user ID to filter by actor.' },
          action_type: { type: 'number', description: 'Optional Discord audit log action type integer.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bans',
      description: 'List currently banned users in the guild.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum entries to return (1–100). Defaults to 25.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invite',
      description: 'Create a channel invite for a guild channel.',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'Channel ID where the invite is created.' },
          max_age: { type: 'number', description: 'Optional invite expiration in seconds (0 = never).' },
          max_uses: { type: 'number', description: 'Optional max uses (0 = unlimited).' },
          temporary: { type: 'boolean', description: 'Optional temporary membership flag.' },
          unique: { type: 'boolean', description: 'Optional unique invite generation.' },
        },
        required: ['channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web using DuckDuckGo and return the top 5 results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
        },
        required: ['query'],
      },
    },
  },
];

// ── Channel type mapping ─────────────────────────────────────────────────────────
const CHANNEL_TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};

// ── Helpers ──────────────────────────────────────────────────────────────────────

/**
 * Strip <think>...</think> blocks (and leading/trailing whitespace) from a string.
 * @param {string} text
 * @returns {string}
 */
function stripThinkBlocks(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Remove fenced/inline markdown code formatting.
 * @param {string} text
 * @returns {string}
 */
function stripCodeMarkup(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Convert a CSS hex color string to an integer.
 * @param {string|null|undefined} hex
 * @returns {number}
 */
function hexToInt(hex) {
  if (!hex || typeof hex !== 'string') return DEFAULT_COLOR;
  const clean = hex.replace(/^#/, '').trim();
  const parsed = parseInt(clean, 16);
  return Number.isNaN(parsed) ? DEFAULT_COLOR : parsed;
}

/**
 * Truncate a string to maxLen, appending a suffix if truncated.
 * @param {string} str
 * @param {number} maxLen
 * @param {string} [suffix]
 * @returns {string}
 */
function truncate(str, maxLen, suffix = '…') {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - suffix.length) + suffix;
}

/**
 * Build a compact human-readable string of tool arguments for display.
 * @param {object} args
 * @returns {string}
 */
function formatToolArgs(args) {
  if (!args || typeof args !== 'object') return '';
  const parts = Object.entries(args).map(([k, v]) => {
    const val = typeof v === 'string' ? truncate(v, 40) : String(v);
    return `${k}: ${val}`;
  });
  return parts.join(', ');
}

/**
 * Validate if a string is an HTTP/HTTPS URL.
 * @param {string} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Ensure tool calls are compatible with OpenAI schema for follow-up turns.
 * @param {Array<unknown>} toolCalls
 * @returns {Array<{id:string,type:'function',function:{name:string,arguments:string}}>}
 */
function normalizeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((toolCall, index) => {
      const name = toolCall?.function?.name ? String(toolCall.function.name) : '';
      if (!name) return null;
      const argsRaw = toolCall?.function?.arguments;
      const args = typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw ?? {});
      return {
        id: String(toolCall?.id ?? `tool_call_${Date.now()}_${index}`),
        type: 'function',
        function: {
          name,
          arguments: args,
        },
      };
    })
    .filter(Boolean);
}

/**
 * Determine if user can access /ai.
 * @param {string} userId
 * @returns {boolean}
 */
function isAiAllowedUser(userId) {
  const id = String(userId);
  return isDevUser(id) || AI_HARDCODED_ALLOW_IDS.has(id);
}

/**
 * Strip all HTML tags from a string, iterating until no tags remain so that
 * nested/malformed tags such as "<scr<script>ipt>" cannot survive.
 * @param {string} str
 * @returns {string}
 */
function stripHtmlTags(str) {
  let result = str;
  let prev;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== prev);
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Fetch the top 5 web search results from DuckDuckGo's HTML endpoint.
 * @param {string} query
 * @returns {Promise<Array<{title:string, url:string, snippet:string}>>}
 */
async function duckDuckGoSearch(query) {
  const url = 'https://html.duckduckgo.com/html/';
  const body = `q=${encodeURIComponent(query)}&b=&kl=`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body,
  });
  const html = await res.text();

  const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippetMatches = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const results = [];
  const count = Math.min(5, titleMatches.length);
  for (let i = 0; i < count; i++) {
    const rawHref = titleMatches[i][1];
    let resolvedUrl = rawHref;
    try {
      const parsed = new URL(rawHref, 'https://html.duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) resolvedUrl = decodeURIComponent(uddg);
    } catch {
      // keep raw href
    }
    const title = stripHtmlTags(titleMatches[i][2]);
    const snippet = snippetMatches[i]
      ? stripHtmlTags(snippetMatches[i][1])
      : '';
    results.push({ title, url: resolvedUrl, snippet });
  }
  return results;
}

/**
 * Execute a named tool with the given parsed arguments.
 * Returns a JSON-serialisable value or throws on failure.
 * @param {string} toolName
 * @param {object} args
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<unknown>}
 */
async function executeTool(toolName, args, interaction) {
  const guild = interaction.guild;

  switch (toolName) {
    case 'send_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.send({ content: args.content });
      return { success: true, message_id: msg.id, channel_id: ch.id };
    }

    case 'edit_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.edit({ content: args.content });
      return { success: true, message_id: msg.id };
    }

    case 'delete_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.delete();
      return { success: true };
    }

    case 'get_channel_info': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch) throw new Error('Channel not found.');
      return {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        topic: ch.topic ?? null,
        position: ch.position ?? null,
        parent_id: ch.parentId ?? null,
        nsfw: ch.nsfw ?? false,
        created_at: ch.createdAt?.toISOString() ?? null,
      };
    }

    case 'get_current_channel_info': {
      const ch = interaction.channel;
      if (!ch) throw new Error('Current channel is unavailable.');
      return {
        id: ch.id,
        name: ch.name ?? null,
        type: ch.type,
        topic: ch.topic ?? null,
        parent_id: ch.parentId ?? null,
        nsfw: ch.nsfw ?? false,
        created_at: ch.createdAt?.toISOString() ?? null,
      };
    }

    case 'list_channels': {
      const channels = await guild.channels.fetch();
      return channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        parent_id: ch.parentId ?? null,
        position: ch.rawPosition ?? null,
      }));
    }

    case 'set_channel_topic': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      await ch.setTopic(args.topic);
      return { success: true, topic: args.topic };
    }

    case 'get_member_info': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      return {
        id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        bot: member.user.bot,
        roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
        joined_at: member.joinedAt?.toISOString() ?? null,
        created_at: member.user.createdAt?.toISOString() ?? null,
        timed_out_until: member.communicationDisabledUntil?.toISOString() ?? null,
      };
    }

    case 'list_members': {
      const limit = Math.min(100, Math.max(1, args.limit ?? 50));
      const members = await guild.members.fetch({ limit });
      return [...members.values()].map((m) => ({
        id: m.id,
        username: m.user.username,
        display_name: m.displayName,
        bot: m.user.bot,
      }));
    }

    case 'get_guild_info': {
      const g = guild;
      return {
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        member_count: g.memberCount,
        owner_id: g.ownerId,
        created_at: g.createdAt?.toISOString() ?? null,
        icon_url: g.iconURL({ dynamic: true }) ?? null,
        premium_tier: g.premiumTier,
        boost_count: g.premiumSubscriptionCount ?? 0,
      };
    }

    case 'list_roles': {
      const roles = await guild.roles.fetch();
      return [...roles.values()]
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          hoist: r.hoist,
          mentionable: r.mentionable,
          managed: r.managed,
          member_count: r.members.size,
        }));
    }

    case 'create_role': {
      const options = { name: args.name };
      if (args.color) options.color = hexToInt(args.color);
      if (typeof args.hoist === 'boolean') options.hoist = args.hoist;
      if (typeof args.mentionable === 'boolean') options.mentionable = args.mentionable;
      const role = await guild.roles.create(options);
      return { success: true, role_id: role.id, name: role.name };
    }

    case 'edit_role': {
      const role = await guild.roles.fetch(args.role_id);
      if (!role) throw new Error('Role not found.');
      const options = {};
      if (typeof args.name === 'string' && args.name.trim()) options.name = args.name.trim();
      if (typeof args.color === 'string' && args.color.trim()) options.color = hexToInt(args.color);
      if (typeof args.hoist === 'boolean') options.hoist = args.hoist;
      if (typeof args.mentionable === 'boolean') options.mentionable = args.mentionable;
      await role.edit(options);
      return { success: true, role_id: role.id, name: role.name };
    }

    case 'delete_role': {
      const role = await guild.roles.fetch(args.role_id);
      if (!role) throw new Error('Role not found.');
      await role.delete();
      return { success: true, role_id: args.role_id };
    }

    case 'add_role': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      await member.roles.add(args.role_id);
      return { success: true };
    }

    case 'remove_role': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      await member.roles.remove(args.role_id);
      return { success: true };
    }

    case 'ban_member': {
      const deleteMessageSeconds = Math.min(7, Math.max(0, args.delete_message_days ?? 0)) * 86400;
      await guild.members.ban(args.user_id, {
        reason: args.reason ?? undefined,
        deleteMessageSeconds,
      });
      return { success: true };
    }

    case 'kick_member': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      await member.kick(args.reason ?? undefined);
      return { success: true };
    }

    case 'timeout_member': {
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      const ms = Math.min(args.duration_seconds * 1000, 28 * 24 * 60 * 60 * 1000);
      await member.timeout(ms, args.reason ?? undefined);
      return { success: true };
    }

    case 'create_channel': {
      const type = CHANNEL_TYPE_MAP[args.type ?? 'text'] ?? ChannelType.GuildText;
      const options = { name: args.name, type };
      if (args.topic) options.topic = args.topic;
      if (args.parent_id) options.parent = args.parent_id;
      const ch = await guild.channels.create(options);
      return { success: true, channel_id: ch.id, name: ch.name };
    }

    case 'delete_channel': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch) throw new Error('Channel not found.');
      await ch.delete();
      return { success: true };
    }

    case 'pin_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.pin();
      return { success: true };
    }

    case 'unpin_message': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.unpin();
      return { success: true };
    }

    case 'get_message_history': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const limit = Math.min(100, Math.max(1, args.limit ?? 25));
      const messages = await ch.messages.fetch({ limit });
      return [...messages.values()].map((m) => ({
        id: m.id,
        author_id: m.author.id,
        author_username: m.author.username,
        content: m.content,
        created_at: m.createdAt.toISOString(),
        edited_at: m.editedAt?.toISOString() ?? null,
        attachments: m.attachments.size,
        embeds: m.embeds.length,
      }));
    }

    case 'add_reaction': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const msg = await ch.messages.fetch(args.message_id);
      await msg.react(args.emoji);
      return { success: true };
    }

    case 'get_audit_logs': {
      const limit = Math.min(50, Math.max(1, args.limit ?? 10));
      const fetchOptions = { limit };
      if (args.user_id) fetchOptions.user = args.user_id;
      if (Number.isInteger(args.action_type)) fetchOptions.type = args.action_type;
      const logs = await guild.fetchAuditLogs(fetchOptions);
      return [...logs.entries.values()].slice(0, limit).map((entry) => ({
        id: entry.id,
        action: entry.action,
        action_type: entry.actionType ?? null,
        target_id: entry.targetId ?? null,
        executor_id: entry.executorId ?? null,
        reason: entry.reason ?? null,
        created_at: entry.createdAt?.toISOString() ?? null,
      }));
    }

    case 'list_bans': {
      const limit = Math.min(100, Math.max(1, args.limit ?? 25));
      const bans = await guild.bans.fetch();
      return [...bans.values()].slice(0, limit).map((ban) => ({
        user_id: ban.user.id,
        username: ban.user.username,
        reason: ban.reason ?? null,
      }));
    }

    case 'create_invite': {
      const ch = await guild.channels.fetch(args.channel_id);
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based.');
      const invite = await ch.createInvite({
        maxAge: Math.max(0, args.max_age ?? 0),
        maxUses: Math.max(0, args.max_uses ?? 0),
        temporary: Boolean(args.temporary),
        unique: typeof args.unique === 'boolean' ? args.unique : true,
      });
      return {
        code: invite.code,
        url: invite.url,
        channel_id: ch.id,
        expires_at: invite.expiresAt?.toISOString() ?? null,
        max_uses: invite.maxUses,
      };
    }

    case 'search_web': {
      const results = await duckDuckGoSearch(args.query);
      return results;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Call the NVIDIA Build API with the current message history.
 * @param {object[]} messages
 * @returns {Promise<object>}
 */
async function callNvidiaApi(messages) {
  try {
    return await aiClient.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto',
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      top_p: TOP_P,
      stream: false,
    });
  } catch (error) {
    const status = error?.status ?? error?.code ?? undefined;
    const apiBody = error?.error ? JSON.stringify(error.error) : '';
    throw Object.assign(new Error(`NVIDIA API error${status ? ` ${status}` : ''}: ${error.message}`), { status, body: apiBody });
  }
}

/**
 * Build a "dangerous action confirmation" embed with confirm/cancel buttons.
 * @param {string} toolName
 * @param {object} args
 * @returns {{ embed: EmbedBuilder, row: ActionRowBuilder }}
 */
function buildDangerousActionUI(toolName, args) {
  const descriptions = {
    ban_member: `**Ban member** \`${args.user_id}\`${args.reason ? `\nReason: ${args.reason}` : ''}`,
    kick_member: `**Kick member** \`${args.user_id}\`${args.reason ? `\nReason: ${args.reason}` : ''}`,
    timeout_member: `**Timeout member** \`${args.user_id}\` for **${args.duration_seconds}s**${args.reason ? `\nReason: ${args.reason}` : ''}`,
    delete_message: `**Delete message** \`${args.message_id}\` in channel \`${args.channel_id}\``,
    create_role: `**Create role** named \`${args.name}\`${args.color ? ` (color: ${args.color})` : ''}`,
    delete_role: `**Delete role** \`${args.role_id}\``,
    delete_channel: `**Delete channel** \`${args.channel_id}\``,
  };

  const description = descriptions[toolName] ?? `**${toolName}** with args: \`${JSON.stringify(args)}\``;

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('⚠️ Dangerous Action — Confirm?')
    .setDescription(`The AI wants to perform the following action:\n\n${description}\n\nRespond within 30 seconds.`)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ai_dangerous_confirm')
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ai_dangerous_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

/**
 * Show a confirmation prompt and wait for the allowed user to respond.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Message} replyMsg
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<boolean>} true = confirmed, false = denied/timeout
 */
async function awaitConfirmation(interaction, replyMsg, toolName, args) {
  const { embed, row } = buildDangerousActionUI(toolName, args);
  await interaction.editReply({ embeds: [embed], components: [row] });

  try {
    const btn = await replyMsg.awaitMessageComponent({
      filter: (i) =>
        (i.customId === 'ai_dangerous_confirm' || i.customId === 'ai_dangerous_cancel') &&
        isAiAllowedUser(i.user.id),
      time: CONFIRMATION_TIMEOUT_MS,
    });
    await btn.deferUpdate();
    return btn.customId === 'ai_dangerous_confirm';
  } catch {
    // Timeout — remove buttons
    await interaction.editReply({ components: [] }).catch(() => null);
    return false;
  }
}

/**
 * Split text into chunks suitable for embed descriptions.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string[]}
 */
function chunkText(text, maxLen) {
  const chunks = [];
  let remaining = String(text ?? '');
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * CHUNK_NEWLINE_SPLIT_THRESHOLD) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks.length > 0 ? chunks : [NO_RESPONSE_TEXT];
}

/**
 * Map AI style strings to Discord button styles.
 * @param {string} style
 * @returns {ButtonStyle}
 */
function toButtonStyle(style) {
  const key = String(style ?? '').toLowerCase();
  if (key === 'primary') return ButtonStyle.Primary;
  if (key === 'success') return ButtonStyle.Success;
  if (key === 'danger') return ButtonStyle.Danger;
  return ButtonStyle.Secondary;
}

/**
 * Sanitize AI-supplied identifiers.
 * @param {string} value
 * @param {string} fallback
 * @returns {string}
 */
function sanitizeId(value, fallback) {
  const clean = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, MAX_CUSTOM_ID_BASE_LENGTH);
  return clean || fallback;
}

/**
 * Keep conversation history bounded while preserving the system message.
 * @param {Array<object>} messages
 */
function trimConversationHistory(messages) {
  if (!Array.isArray(messages) || messages.length <= MAX_CONVERSATION_MESSAGES) return;
  const system = messages[0]?.role === 'system' ? messages[0] : null;
  const tail = messages.slice(-(MAX_CONVERSATION_MESSAGES - (system ? 1 : 0)));
  messages.length = 0;
  if (system) messages.push(system);
  messages.push(...tail);
}

/**
 * Parse AI output JSON and apply defaults/sanitization.
 * @param {string} rawContent
 * @returns {object}
 */
function parseAiOutput(rawContent) {
  const cleaned = stripThinkBlocks(rawContent);

  let data = null;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : cleaned.trim();
  try {
    data = JSON.parse(jsonStr);
  } catch {
    data = null;
  }

  if (!data || typeof data !== 'object') {
    data = { description: stripCodeMarkup(cleaned || NO_RESPONSE_TEXT) };
  }

  const color = hexToInt(data.color);
  const authorName = stripCodeMarkup(stripThinkBlocks(String(data.author_name ?? AI_MODEL_LABEL)));
  const footerText = data.footer ? stripCodeMarkup(stripThinkBlocks(String(data.footer))) : null;
  const title = data.title ? truncate(stripCodeMarkup(stripThinkBlocks(String(data.title))), 256) : null;
  const description = stripCodeMarkup(stripThinkBlocks(String(data.description ?? NO_RESPONSE_TEXT)));
  const fields = [];
  if (Array.isArray(data.fields)) {
    for (const f of data.fields) {
      if (!f?.name || !f?.value) continue;
      fields.push({
        name: truncate(stripCodeMarkup(stripThinkBlocks(String(f.name))), 256),
        value: truncate(stripCodeMarkup(stripThinkBlocks(String(f.value))), FIELD_VALUE_MAX),
        inline: Boolean(f.inline),
      });
      if (fields.length >= FIELDS_MAX) break;
    }
  }

  const linkButtons = [];
  if (Array.isArray(data.link_buttons)) {
    for (const b of data.link_buttons) {
      if (!b?.label || !b?.url) continue;
      const label = truncate(stripCodeMarkup(stripThinkBlocks(String(b.label))), 80);
      const url = String(b.url).trim();
      if (!label || !isHttpUrl(url)) continue;
      linkButtons.push({ label, url });
      if (linkButtons.length >= MAX_LINK_BUTTONS) break;
    }
  }

  return {
    color,
    authorName,
    authorIconUrl: data.author_icon_url ? String(data.author_icon_url) : undefined,
    footerText,
    title,
    description,
    thumbnailUrl: data.thumbnail_url ? String(data.thumbnail_url) : null,
    imageUrl: data.image_url ? String(data.image_url) : null,
    fields,
    linkButtons,
    buttons: Array.isArray(data.buttons) ? data.buttons : [],
    selectMenus: Array.isArray(data.select_menus) ? data.select_menus : [],
    modalButtons: Array.isArray(data.modal_buttons) ? data.modal_buttons : [],
  };
}

/**
 * Build paginated output embeds and AI-defined interactive rows.
 * @param {string} rawContent
 * @returns {{outputEmbeds:EmbedBuilder[],linkButtons:Array,uiRows:Array<ActionRowBuilder>,uiState:object}}
 */
function buildFinalOutput(rawContent) {
  const parsed = parseAiOutput(rawContent);
  const chunks = chunkText(parsed.description, DESC_MAX);
  const outputEmbeds = chunks.map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(parsed.color)
      .setDescription(chunk || NO_RESPONSE_TEXT)
      .setTimestamp();
    if (parsed.title) embed.setTitle(parsed.title);
    embed.setAuthor({ name: parsed.authorName, iconURL: parsed.authorIconUrl });
    if (parsed.footerText || chunks.length > 1) {
      const base = parsed.footerText ? `${parsed.footerText}` : '';
      const page = chunks.length > 1 ? `Page ${index + 1}/${chunks.length}` : '';
      const footer = [base, page].filter(Boolean).join(' • ');
      embed.setFooter({ text: footer });
    }
    if (parsed.thumbnailUrl) {
      try { embed.setThumbnail(parsed.thumbnailUrl); } catch { /* invalid url */ }
    }
    if (parsed.imageUrl && index === 0) {
      try { embed.setImage(parsed.imageUrl); } catch { /* invalid url */ }
    }
    if (index === 0 && parsed.fields.length > 0) embed.addFields(parsed.fields);
    return embed;
  });

  const uiRows = [];
  const uiState = { buttons: {}, selects: {}, modals: {} };

  if (parsed.buttons.length > 0) {
    let row = new ActionRowBuilder();
    for (let i = 0; i < parsed.buttons.length; i++) {
      const button = parsed.buttons[i];
      if (!button?.label) continue;
      if (row.components.length >= 5) {
        uiRows.push(row);
        row = new ActionRowBuilder();
      }
      const customId = `${AI_UI_BUTTON_PREFIX}${sanitizeId(button.id, `button_${i + 1}`)}`;
      uiState.buttons[customId] = {
        id: sanitizeId(button.id, `button_${i + 1}`),
        ackMessage: button.ack_message ? truncate(String(button.ack_message), 120) : null,
      };
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(truncate(stripCodeMarkup(String(button.label)), 80))
          .setStyle(toButtonStyle(button.style)),
      );
    }
    if (row.components.length > 0) uiRows.push(row);
  }

  for (let i = 0; i < parsed.selectMenus.length; i++) {
    const menu = parsed.selectMenus[i];
    if (!Array.isArray(menu?.options) || menu.options.length === 0) continue;
    const customId = `${AI_UI_SELECT_PREFIX}${sanitizeId(menu.id, `menu_${i + 1}`)}`;
    const options = [];
    for (const option of menu.options.slice(0, 25)) {
      if (!option?.label || !option?.value) continue;
      options.push({
        label: truncate(stripCodeMarkup(String(option.label)), 100),
        value: truncate(String(option.value), 100),
        description: option.description ? truncate(stripCodeMarkup(String(option.description)), 100) : undefined,
        default: Boolean(option.default),
      });
    }
    if (options.length === 0) continue;
    const minValues = Math.min(options.length, Math.max(1, menu.min_values ?? 1));
    const maxValues = Math.min(options.length, Math.max(minValues, menu.max_values ?? minValues));
    uiState.selects[customId] = { id: sanitizeId(menu.id, `menu_${i + 1}`) };
    uiRows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(truncate(String(menu.placeholder ?? 'Select an option'), 150))
          .setMinValues(minValues)
          .setMaxValues(maxValues)
          .addOptions(options),
      ),
    );
  }

  if (parsed.modalButtons.length > 0) {
    let row = new ActionRowBuilder();
    for (let i = 0; i < parsed.modalButtons.length; i++) {
      const modal = parsed.modalButtons[i];
      if (!modal?.button_label || !Array.isArray(modal.fields) || modal.fields.length === 0) continue;
      if (row.components.length >= 5) {
        uiRows.push(row);
        row = new ActionRowBuilder();
      }
      const customId = `${AI_UI_MODAL_PREFIX}${sanitizeId(modal.id, `modal_${i + 1}`)}`;
      uiState.modals[customId] = {
        id: sanitizeId(modal.id, `modal_${i + 1}`),
        title: truncate(String(modal.title ?? 'Form'), 45),
        submitMessage: modal.submit_message ? truncate(String(modal.submit_message), 120) : null,
        fields: modal.fields.slice(0, 5).map((field, fieldIndex) => ({
          id: sanitizeId(field.id, `field_${fieldIndex + 1}`),
          label: truncate(stripCodeMarkup(String(field.label ?? `Field ${fieldIndex + 1}`)), 45),
          style: String(field.style ?? 'short').toLowerCase() === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short,
          placeholder: field.placeholder ? truncate(String(field.placeholder), 100) : null,
          required: field.required !== false,
          minLength: Math.max(0, field.min_length ?? 0),
          maxLength: Math.min(4000, Math.max(1, field.max_length ?? 4000)),
          value: field.value ? truncate(String(field.value), 4000) : null,
        })),
      };
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(truncate(stripCodeMarkup(String(modal.button_label)), 80))
          .setStyle(toButtonStyle(modal.button_style)),
      );
    }
    if (row.components.length > 0) uiRows.push(row);
  }

  return {
    outputEmbeds,
    linkButtons: parsed.linkButtons,
    uiRows,
    uiState,
  };
}

/**
 * Build review/details embed.
 * @param {{ttftMs:number|null,totalMs:number,iterations:number,promptTokens:number|null,completionTokens:number|null}} stats
 * @param {Array} toolsUsed
 * @returns {EmbedBuilder}
 */
function buildReviewEmbed(stats, toolsUsed) {
  const toolLines = toolsUsed.length
    ? toolsUsed.map((t) => {
      const argStr = formatToolArgs(t.args);
      const label = argStr ? `${t.name}(${argStr})` : t.name;
      if (t.denied) return `🚫 ${label} — denied`;
      if (t.error) return `❌ ${label} — ${truncate(t.error, 80)}`;
      return `✅ ${label}`;
    }).join('\n')
    : 'None';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🧾 AI Review')
    .setDescription('Diagnostics for this AI response.')
    .addFields(
      { name: 'Assistant', value: AI_MODEL_LABEL, inline: false },
      { name: 'Runtime Model', value: MODEL, inline: false },
      { name: 'TTFT', value: stats.ttftMs != null ? `${stats.ttftMs} ms` : 'N/A', inline: true },
      { name: 'Total Time', value: `${stats.totalMs} ms`, inline: true },
      { name: 'Iterations', value: String(stats.iterations), inline: true },
      { name: 'Prompt Tokens', value: stats.promptTokens != null ? String(stats.promptTokens) : 'N/A', inline: true },
      { name: 'Completion Tokens', value: stats.completionTokens != null ? String(stats.completionTokens) : 'N/A', inline: true },
      { name: 'Tools Used', value: truncate(toolLines, FIELD_VALUE_MAX), inline: false },
    )
    .setTimestamp();
}

/**
 * Get the active turn object from a session.
 * @param {object} session
 * @returns {object}
 */
function getActiveTurn(session) {
  if (Array.isArray(session.turns) && session.turns.length > 0) {
    const clampedTurnIndex = Math.min(Math.max(0, session.turnIndex ?? 0), session.turns.length - 1);
    return session.turns[clampedTurnIndex];
  }
  return {
    outputEmbeds: [],
    reviewEmbed: null,
    linkButtons: [],
    uiRows: [],
    uiState: { buttons: {}, selects: {}, modals: {} },
    pageIndex: 0,
    viewMode: 'output',
  };
}

/**
 * Build interactive components for output/review pages.
 * @param {object} session
 * @returns {ActionRowBuilder[]}
 */
function buildFinalComponents(session) {
  const turn = getActiveTurn(session);
  const mode = turn.viewMode ?? 'output';
  const pageCount = Math.max(1, turn.outputEmbeds?.length ?? 1);
  const pageIndex = Math.min(Math.max(0, turn.pageIndex ?? 0), pageCount - 1);
  const turnCount = Math.max(1, session.turns?.length ?? 1);
  const turnIndex = Math.min(Math.max(0, session.turnIndex ?? 0), turnCount - 1);
  const rows = [];

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(mode === 'output' ? AI_REVIEW_BUTTON_ID : AI_OUTPUT_BUTTON_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(mode === 'output' ? 'Review' : 'Back to Output'),
    new ButtonBuilder()
      .setCustomId(AI_CONTINUE_BUTTON_ID)
      .setStyle(ButtonStyle.Primary)
      .setLabel('Continue'),
  );

  if (turnCount > 1) {
    controls.addComponents(
      new ButtonBuilder()
        .setCustomId(AI_TURN_PREV_BUTTON_ID)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Prev Message')
        .setDisabled(turnIndex === 0),
      new ButtonBuilder()
        .setCustomId(AI_TURN_NEXT_BUTTON_ID)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Next Message')
        .setDisabled(turnIndex >= turnCount - 1),
    );
  }
  rows.push(controls);

  if (mode === 'output' && pageCount > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(AI_PAGE_PREV_BUTTON_ID)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Prev Page')
          .setDisabled(pageIndex === 0),
        new ButtonBuilder()
          .setCustomId(AI_PAGE_NEXT_BUTTON_ID)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Next Page')
          .setDisabled(pageIndex >= pageCount - 1),
      ),
    );
  }

  if (mode === 'output' && Array.isArray(turn.uiRows)) {
    for (const row of turn.uiRows) {
      if (rows.length >= 5) break;
      rows.push(row);
    }
  }

  let index = 0;
  while (mode === 'output' && index < turn.linkButtons?.length && rows.length < 5) {
    const row = new ActionRowBuilder();
    while (index < turn.linkButtons.length && row.components.length < 5) {
      const item = turn.linkButtons[index++];
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(item.label)
          .setURL(item.url),
      );
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Execute one AI turn (supports tool calls) and return render state.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Message} replyMsg
 * @param {Array<object>} messages
 * @param {Array<object>} toolsUsed
 * @returns {Promise<{outputEmbeds:EmbedBuilder[],reviewEmbed:EmbedBuilder,linkButtons:Array,uiRows:Array<ActionRowBuilder>,uiState:object}>}
 */
async function runAiTurn(interaction, replyMsg, messages, toolsUsed) {
  const requestStartMs = Date.now();
  let ttftMs = null;
  let promptTokens = null;
  let completionTokens = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    trimConversationHistory(messages);

    if (iteration > 0) {
      await interaction.editReply({
        embeds: [buildProcessingEmbed(`Processing results… (iteration ${iteration + 1}/${MAX_ITERATIONS})`)],
        components: [],
      });
    }

    let apiData;
    const iterationStartMs = Date.now();
    try {
      apiData = await callNvidiaApi(messages);
    } catch (err) {
      throw err;
    }
    if (ttftMs == null) ttftMs = Date.now() - iterationStartMs;

    if (apiData?.usage) {
      promptTokens = apiData.usage.prompt_tokens ?? promptTokens;
      completionTokens = apiData.usage.completion_tokens ?? completionTokens;
    }

    const choice = apiData?.choices?.[0];
    if (!choice) throw new Error('Received an empty response from the AI API.');

    const assistantMessage = choice.message ?? {};
    const toolCalls = normalizeToolCalls(assistantMessage.tool_calls);
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    const iterationCount = iteration + 1;
    if (!toolCalls || toolCalls.length === 0) {
      const content = assistantMessage.content ?? '';
      const { outputEmbeds, linkButtons, uiRows, uiState } = buildFinalOutput(content);
      const reviewEmbed = buildReviewEmbed(
        {
          ttftMs,
          totalMs: Date.now() - requestStartMs,
          iterations: iterationCount,
          promptTokens,
          completionTokens,
        },
        toolsUsed,
      );
      return { outputEmbeds, reviewEmbed, linkButtons, uiRows, uiState };
    }

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(toolCall.function?.arguments ?? '{}');
      } catch {
        toolArgs = {};
      }

      let toolResult;
      if (DANGEROUS_TOOLS.has(toolName)) {
        await interaction.editReply({
          embeds: [buildProcessingEmbed(`Waiting for confirmation of \`${toolName}\`…`)],
          components: [],
        });
        const confirmed = await awaitConfirmation(interaction, replyMsg, toolName, toolArgs);
        if (!confirmed) {
          toolResult = 'Action was denied by the user (or timed out). Do not attempt this action again without asking the user.';
          toolsUsed.push({ name: toolName, args: toolArgs, denied: true });
          await interaction.editReply({
            embeds: [buildProcessingEmbed('Action denied. Continuing…')],
            components: [],
          });
        } else {
          try {
            toolResult = await executeTool(toolName, toolArgs, interaction);
            toolsUsed.push({ name: toolName, args: toolArgs, success: true });
          } catch (err) {
            toolResult = `Error executing ${toolName}: ${err.message}`;
            toolsUsed.push({ name: toolName, args: toolArgs, error: err.message });
          }
          await interaction.editReply({
            embeds: [buildProcessingEmbed('Action executed. Continuing…')],
            components: [],
          });
        }
      } else {
        try {
          toolResult = await executeTool(toolName, toolArgs, interaction);
          toolsUsed.push({ name: toolName, args: toolArgs, success: true });
        } catch (err) {
          toolResult = `Error executing ${toolName}: ${err.message}`;
          toolsUsed.push({ name: toolName, args: toolArgs, error: err.message });
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
      });
    }
  }

  const { outputEmbeds, linkButtons, uiRows, uiState } = buildFinalOutput(
    JSON.stringify({ description: 'Maximum tool-call iterations reached. The AI could not produce a final response.' }),
  );
  const reviewEmbed = buildReviewEmbed(
    {
      ttftMs,
      totalMs: Date.now() - requestStartMs,
      iterations: MAX_ITERATIONS,
      promptTokens,
      completionTokens,
    },
    toolsUsed,
  );
  return { outputEmbeds, reviewEmbed, linkButtons, uiRows, uiState };
}

/**
 * Build the active embed for current session mode.
 * @param {object} session
 * @returns {EmbedBuilder}
 */
function getActiveEmbed(session) {
  const turn = getActiveTurn(session);
  if (turn.viewMode === 'review') return turn.reviewEmbed;
  return turn.outputEmbeds[turn.pageIndex] ?? turn.outputEmbeds[0];
}

/**
 * Handle component interactions for a response message/session.
 * @param {import('discord.js').Message} replyMsg
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} session
 */
function attachReviewHandler(replyMsg, interaction, session) {
  const collector = replyMsg.createMessageComponentCollector({
    time: REVIEW_TIMEOUT_MS,
    filter: (i) => i.user.id === session.allowedUserId && i.customId.startsWith('ai_'),
  });

  collector.on('collect', async (i) => {
    if (session.busy) {
      await i.reply({ content: 'Already processing a request. Please wait…', flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    if (i.customId === AI_REVIEW_BUTTON_ID) {
      const turn = getActiveTurn(session);
      turn.viewMode = 'review';
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }
    if (i.customId === AI_OUTPUT_BUTTON_ID) {
      const turn = getActiveTurn(session);
      turn.viewMode = 'output';
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }
    if (i.customId === AI_PAGE_PREV_BUTTON_ID) {
      const turn = getActiveTurn(session);
      if (turn.viewMode === 'output') turn.pageIndex = Math.max(0, turn.pageIndex - 1);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }
    if (i.customId === AI_PAGE_NEXT_BUTTON_ID) {
      const turn = getActiveTurn(session);
      if (turn.viewMode === 'output') turn.pageIndex = Math.min(turn.outputEmbeds.length - 1, turn.pageIndex + 1);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }
    if (i.customId === AI_TURN_PREV_BUTTON_ID) {
      session.turnIndex = Math.max(0, session.turnIndex - 1);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }
    if (i.customId === AI_TURN_NEXT_BUTTON_ID) {
      session.turnIndex = Math.min(session.turns.length - 1, session.turnIndex + 1);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }

    if (i.customId === AI_CONTINUE_BUTTON_ID) {
      const modal = new ModalBuilder()
        .setCustomId(AI_CONTINUE_MODAL_ID)
        .setTitle('Continue Conversation')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(AI_CONTINUE_PROMPT_INPUT_ID)
              .setLabel('Next message')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(2000),
          ),
        );

      await i.showModal(modal).catch(() => null);
      let modalSubmit;
      try {
        modalSubmit = await i.awaitModalSubmit({
          filter: (m) => m.customId === AI_CONTINUE_MODAL_ID && m.user.id === session.allowedUserId,
          time: MODAL_SUBMIT_TIMEOUT_MS,
        });
      } catch {
        return;
      }

      const prompt = modalSubmit.fields.getTextInputValue(AI_CONTINUE_PROMPT_INPUT_ID)?.trim();
      if (!prompt) {
        await modalSubmit.reply({ content: 'Prompt cannot be empty.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      session.busy = true;
      await modalSubmit.deferUpdate().catch(() => null);
      session.messages.push({ role: 'user', content: prompt });
      await replyMsg.edit({ embeds: [buildProcessingEmbed('Sending follow-up prompt to AI…')], components: [] }).catch(() => null);

      try {
        const result = await runAiTurn(interaction, replyMsg, session.messages, session.toolsUsed);
        session.turns.push({
          outputEmbeds: result.outputEmbeds,
          reviewEmbed: result.reviewEmbed,
          linkButtons: result.linkButtons,
          uiRows: result.uiRows,
          uiState: result.uiState,
          pageIndex: 0,
          viewMode: 'output',
        });
        session.turnIndex = session.turns.length - 1;
        await replyMsg.edit({
          embeds: [getActiveEmbed(session)],
          components: buildFinalComponents(session),
        });
      } catch (err) {
        await replyMsg.edit({
          embeds: [buildErrorEmbed(err.message, err.status)],
          components: [],
        }).catch(() => null);
      } finally {
        session.busy = false;
      }
      return;
    }

    if (i.customId.startsWith(AI_UI_BUTTON_PREFIX)) {
      const turn = getActiveTurn(session);
      const uiState = turn.uiState ?? { buttons: {}, selects: {}, modals: {} };
      const button = uiState.buttons[i.customId];
      if (!button) return i.reply({ content: 'Button configuration is unavailable.', flags: MessageFlags.Ephemeral }).catch(() => null);
      session.messages.push({ role: 'user', content: `UI button clicked: ${button.id}` });
      await i.reply({
        content: button.ackMessage ?? `Captured button click: \`${button.id}\`. Click **Continue** to let Valley AI use it.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }

    if (i.customId.startsWith(AI_UI_SELECT_PREFIX)) {
      const turn = getActiveTurn(session);
      const uiState = turn.uiState ?? { buttons: {}, selects: {}, modals: {} };
      const select = uiState.selects[i.customId];
      if (!select) return i.reply({ content: 'Select menu configuration is unavailable.', flags: MessageFlags.Ephemeral }).catch(() => null);
      const values = i.values?.join(', ') || 'none';
      session.messages.push({ role: 'user', content: `UI select used: ${select.id} -> ${values}` });
      session.busy = true;
      await i.update({
        embeds: [buildProcessingEmbed(`Processing selection \`${select.id}\`…`)],
        components: [],
      }).catch(() => null);
      try {
        const result = await runAiTurn(interaction, replyMsg, session.messages, session.toolsUsed);
        session.turns.push({
          outputEmbeds: result.outputEmbeds,
          reviewEmbed: result.reviewEmbed,
          linkButtons: result.linkButtons,
          uiRows: result.uiRows,
          uiState: result.uiState,
          pageIndex: 0,
          viewMode: 'output',
        });
        session.turnIndex = session.turns.length - 1;
        await replyMsg.edit({
          embeds: [getActiveEmbed(session)],
          components: buildFinalComponents(session),
        });
      } catch (err) {
        await replyMsg.edit({
          embeds: [buildErrorEmbed(err.message, err.status)],
          components: [],
        }).catch(() => null);
      } finally {
        session.busy = false;
      }
      return;
    }

    if (i.customId.startsWith(AI_UI_MODAL_PREFIX)) {
      const turn = getActiveTurn(session);
      const uiState = turn.uiState ?? { buttons: {}, selects: {}, modals: {} };
      const modalDef = uiState.modals[i.customId];
      if (!modalDef) return i.reply({ content: 'Modal configuration is unavailable.', flags: MessageFlags.Ephemeral }).catch(() => null);
      const modalCustomId = `${i.customId}:submit`;
      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle(modalDef.title);
      const rows = modalDef.fields.map((field) => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(field.style)
          .setRequired(field.required)
          .setMinLength(field.minLength)
          .setMaxLength(field.maxLength);
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        if (field.value) input.setValue(field.value);
        return new ActionRowBuilder().addComponents(input);
      });
      modal.addComponents(rows);
      await i.showModal(modal).catch(() => null);
      let modalSubmit;
      try {
        modalSubmit = await i.awaitModalSubmit({
          filter: (m) => m.customId === modalCustomId && m.user.id === session.allowedUserId,
          time: MODAL_SUBMIT_TIMEOUT_MS,
        });
      } catch {
        return;
      }
      const collected = modalDef.fields.map((field) => `${field.id}: ${modalSubmit.fields.getTextInputValue(field.id)}`);
      session.messages.push({ role: 'user', content: `UI modal submitted: ${modalDef.id} -> ${collected.join(' | ')}` });
      await modalSubmit.reply({
        content: modalDef.submitMessage ?? `Captured modal submission for \`${modalDef.id}\`.\nClick **Continue** to let Valley AI use it.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  });

  collector.on('end', async () => {
    AI_SESSIONS.delete(replyMsg.id);
  });
}

/**
 * Build a simple "processing" embed shown while the AI is working.
 * @param {string} [status]
 * @returns {EmbedBuilder}
 */
function buildProcessingEmbed(status = 'Thinking…') {
  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle(`${LOADING_EMOJI} Processing`)
    .setDescription(`${LOADING_EMOJI} ${status}`)
    .setTimestamp();
}

/**
 * Build an error embed for API/unexpected failures.
 * @param {string} message
 * @param {number} [statusCode]
 * @returns {EmbedBuilder}
 */
function buildErrorEmbed(message, statusCode) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('❌ Error')
    .setDescription(message)
    .setTimestamp();
  if (statusCode) {
    embed.addFields({ name: 'Status Code', value: String(statusCode), inline: true });
  }
  return embed;
}

// ── Command definition ──────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('[Dev] Send a prompt to Valley AI with Discord tools and web search.')
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('Your prompt for the AI.')
        .setRequired(true),
    ),

  async execute(interaction) {
    // ── Auth check ────────────────────────────────────────────────────────────
    if (!isAiAllowedUser(interaction.user.id)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('Access Denied')
            .setDescription('This command is restricted to the bot developer.')
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!NVIDIA_API_KEY) {
      return interaction.reply({
        embeds: [buildErrorEmbed('NVIDIA_API_KEY is not configured.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const prompt = interaction.options.getString('prompt', true);

    // ── Defer reply immediately ───────────────────────────────────────────────
    await interaction.deferReply();
    const replyMsg = await interaction.fetchReply();

    await interaction.editReply({
      embeds: [buildProcessingEmbed('Sending prompt to AI…')],
      components: [],
    });

    // ── Message history ───────────────────────────────────────────────────────
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    const toolsUsed = [];
    let result;
    try {
      result = await runAiTurn(interaction, replyMsg, messages, toolsUsed);
    } catch (err) {
      return interaction.editReply({
        embeds: [buildErrorEmbed(err.message, err.status)],
        components: [],
      });
    }

    const session = {
      allowedUserId: interaction.user.id,
      messages,
      toolsUsed,
      turns: [{
        outputEmbeds: result.outputEmbeds,
        reviewEmbed: result.reviewEmbed,
        linkButtons: result.linkButtons,
        uiRows: result.uiRows,
        uiState: result.uiState,
        pageIndex: 0,
        viewMode: 'output',
      }],
      turnIndex: 0,
      busy: false,
    };

    const components = buildFinalComponents(session);
    await interaction.editReply({
      embeds: [getActiveEmbed(session)],
      components,
    });

    const finalMsg = await interaction.fetchReply().catch(() => null);
    if (finalMsg) {
      AI_SESSIONS.set(finalMsg.id, session);
      attachReviewHandler(finalMsg, interaction, session);
    }
    return null;
  },
};
