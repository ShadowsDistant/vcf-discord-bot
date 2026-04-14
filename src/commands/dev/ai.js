'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const OpenAI = require('openai');
const {
  canUseDevCommand,
  MODERATION_ROLE_IDS,
  MANAGEMENT_ROLE_IDS,
} = require('../../utils/roles');
const db = require('../../utils/database');
const analytics = require('../../utils/analytics');
const { sendModerationActionDm, sendModLog } = require('../../utils/moderationNotifications');
const economy = require('../../utils/bakeEconomy');
const alliances = require('../../utils/bakeAlliances');
const { formatDuration } = require('../../utils/helpers');

// ── Constants ───────────────────────────────────────────────────────────────────
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? '';
const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';
const MAX_TOKENS = 4096;
const TEMPERATURE = 1.0;
const TOP_P = 1.0;
const MAX_ITERATIONS = 10;
const AI_REQUEST_TIMEOUT_MS = 60_000;
const SAFETY_MODEL = 'nvidia/nemotron-content-safety-reasoning-4b';
const SAFETY_MAX_TOKENS = 1024;
const SAFETY_CLASSIFIER_PROMPT_HEADER = [
  'You are an automated classifier for the Valley Correctional community Discord server. Analyze the interaction between a human user and an LLM assistant based on the combined taxonomy of community rules and safety categories.',
  '',
  'Taxonomy',
  'Valley Correctional Rules:',
  '',
  'V1-V14: Discrimination (V1), Harassment (V2), Profanity (V3), PII (V4), Threats/Doxxing (V5), NSFW (V6), Politics/Tragedy (V7), Classified Info (V8), Non-English (V9), Malicious Links (V10), Advertising (V11), Misuse (V12), Spam (V13), VC Misuse (V14).',
  '',
  'Harmful Content Categories:',
  '',
  'S1-S22: Violence (S1), Sexual (S2/S7), Criminal Acts (S3/S21), Weapons (S4), Substances (S5), Self-Harm (S6), Hate (S8), PII (S9), Harassment (S10), Threat (S11), Profanity (S12), Manipulation (S14), Fraud (S15), Malware (S16), Misinformation (S18), Unethical (S22).',
  '',
  'Severity Levels',
  'Low: Minor disruptions/mistakes.',
  '',
  'Medium: Purposeful disruptions/friction.',
  '',
  'High: Severe infractions/harm.',
  '',
  'Critical: Zero-tolerance (Bans).',
  '',
  'Instructions',
  'Determine whether the prompt or response violates rules, constitutes a refusal, or is harmful. Output your answer strictly in the following format:',
  '',
  'Prompt harm: ',
  'Prompt rule: ',
].join('\n');
const DEFAULT_COLOR = 0x99aab5; // default grey
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const CONFIRMATION_TIMEOUT_MS = 30_000;
const REVIEW_TIMEOUT_MS = 15 * 60_000;
const MODAL_SUBMIT_TIMEOUT_MS = 120_000;
const DESC_MAX = 4096;
const FIELD_VALUE_MAX = 1024;
const FIELDS_MAX = 25;
const FOOTER_MAX = 2048;
const SAFETY_FIELD_PREFIX_BUFFER = 64;
const SELECT_OPTION_MAX = 100;
const MAX_LINK_BUTTONS = 10;
const NO_RESPONSE_TEXT = '*(No response)*';
const CHUNK_NEWLINE_SPLIT_THRESHOLD = 0.5;
const ROBLOX_USERS_API_BASE = 'https://users.roblox.com';
const ROBLOX_GROUPS_API_BASE = 'https://groups.roblox.com';
const ROBLOX_GAMES_API_BASE = 'https://games.roblox.com';
const CONVINCE_DAILY_MAX_COOKIES = 50_000;
const CONVINCE_TRACKING_FILE = 'ai_convince_claims.json';
const CONVINCE_MIN_ARGUMENT_LENGTH = 40;
const CONVINCE_MIN_ARGUMENT_WORDS = 8;
const THINKING_MAX_LINES = 3;
const THINKING_MAX_LINE_LENGTH = 220;
const LOADING_EMOJI = '<a:loading:1493407458180468996>';
const AI_REVIEW_BUTTON_ID = 'ai_review_details';
const AI_OUTPUT_BUTTON_ID = 'ai_output_view';
const AI_CONTINUE_BUTTON_ID = 'ai_continue_conversation';
const AI_PAGE_PREV_BUTTON_ID = 'ai_page_prev';
const AI_PAGE_NEXT_BUTTON_ID = 'ai_page_next';
const AI_TURN_PREV_BUTTON_ID = 'ai_turn_prev';
const AI_TURN_NEXT_BUTTON_ID = 'ai_turn_next';
const AI_TOGGLE_THINKING_BUTTON_ID = 'ai_toggle_thinking';
const AI_TOGGLE_PROMPT_BUTTON_ID = 'ai_toggle_prompt';
const AI_MODEL_SELECT_ID = 'ai_model_select';
const AI_SAFETY_SELECT_ID = 'ai_safety_select';
const AI_CONTINUE_MODAL_ID = 'ai_continue_modal';
const AI_CONTINUE_PROMPT_INPUT_ID = 'ai_continue_prompt';
const AI_UI_BUTTON_PREFIX = 'ai_ui_button:';
const AI_UI_SELECT_PREFIX = 'ai_ui_select:';
const AI_UI_MODAL_PREFIX = 'ai_ui_modal:';
const AI_MODEL_LABEL = 'AI Assistant';
const AI_MODEL_LABEL_LOWER = AI_MODEL_LABEL.toLowerCase();
const AI_SAFETY_TOGGLE_USER_ID = '757698506411475005';
const AI_SESSIONS = new Map();
const AI_USER_SETTINGS = new Map();
const MAX_CUSTOM_ID_BASE_LENGTH = 48; // keeps prefixed custom IDs within Discord's 100-char limit
const MAX_CONVERSATION_MESSAGES = 60;
const MODEL_CHATGPT_EMOJI_ID = '1493416854763470908';
const MODEL_MINIMAX_EMOJI_ID = '1493415617116504134';
const MODEL_ZAI_EMOJI_ID = '1493417351402754252';
const AI_ALLOWED_ROLE_ID = '1493414609678499890';
const AI_USER_SETTINGS_FILE = 'ai_user_settings.json';
let AI_USER_SETTINGS_LOADED = false;
const ESCAPED_CODE_FENCE = '``\\`';
const AI_MODELS = Object.freeze([
  {
    key: 'chatgpt',
    label: 'ChatGPT',
    model: 'openai/gpt-oss-120b',
    description: 'Balanced model for most requests.',
    emojiId: MODEL_CHATGPT_EMOJI_ID,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    topP: TOP_P,
  },
  {
    key: 'minimax',
    label: 'MiniMax',
    model: 'minimaxai/minimax-m2.7',
    description: 'Fast and efficient for short-to-medium tasks.',
    emojiId: MODEL_MINIMAX_EMOJI_ID,
    maxTokens: 8192,
    temperature: 1.0,
    topP: 0.95,
  },
  {
    key: 'zai',
    label: 'ZAI',
    model: 'z-ai/glm4.7',
    description: 'Supports explicit thinking output when enabled.',
    emojiId: MODEL_ZAI_EMOJI_ID,
    maxTokens: 16384,
    temperature: 1.0,
    topP: 1.0,
    buildExtraBody: (settings) => ({
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: !settings?.showThinking,
      },
    }),
  },
]);
const AI_MODEL_BY_KEY = new Map(AI_MODELS.map((model) => [model.key, model]));
const DEFAULT_MODEL_KEY = 'chatgpt';

const aiClient = new OpenAI({
  baseURL: NVIDIA_API_BASE,
  apiKey: NVIDIA_API_KEY,
});

// ── System prompt ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Valley AI, created by shadowsdistant.
You are an assistant operating inside VCF (Valley Correctional Facility), a roleplay faction for the Roblox game Valley Prison.
You may have access to Discord moderation and management tools depending on role-based permissions.

Guidelines:
- Use Discord tools only when the request explicitly requires Discord interaction (reading/modifying the server).
- For dangerous actions (kick/ban/timeout members, delete channels or messages, create roles), clearly state what you intend to do — the system will ask the user to confirm before executing.
- Never ask for, suggest, or attempt moderation against the same user you are currently talking to.
- Avoid repetitive prompting; do not repeatedly ask the user to do the same action.
- Do not output code snippets, code fences, or raw executable code in responses.
- ALWAYS respond with a valid JSON object matching this exact embed schema (no markdown fences, just raw JSON):

{
  "title": "Optional short contextual title string (never \"Valley AI\")",
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
  "user_select_menus": [{ "id": "user_menu_key", "placeholder": "Choose user(s)", "min_values": 1, "max_values": 1 }],
  "channel_select_menus": [{ "id": "channel_menu_key", "placeholder": "Choose channel(s)", "min_values": 1, "max_values": 1, "channel_types": ["text","voice","category","announcement","forum","stage"] }],
  "modal_buttons": [{ "id": "modal_key", "button_label": "Open form", "button_style": "primary|secondary|success|danger", "title": "Modal title", "submit_message": "Optional short confirmation text or null", "fields": [{ "id": "field_key", "label": "Field label", "style": "short|paragraph", "placeholder": "Optional placeholder", "required": true, "min_length": 0, "max_length": 4000, "value": "Optional default value" }] }]
}

- Do NOT set title to "Valley AI" or your own name. The author_name field already shows identity; title must always be a contextual heading (e.g., "Server Overview", "Search Results", "Role List").
- author_name defaults to "Valley AI" when null; rarely set it explicitly.
- When reasoning through a problem, include only important reasoning as Discord blockquotes before the main response, then one blank line (max 3 short lines):
  > Important thinking line 1
  > Important thinking line 2

  Actual response starts here.
- Use color consistently: red (#ed4245) for errors/danger/destructive results, green (#57f287) for success, blue (#5865f2) for informational/neutral, yellow (#fee75c) for warnings, null for default grey.
- Text limits: description <= 4096, field.name <= 256, field.value <= 1024, max 25 fields, footer <= 2048.
- Use Discord markdown in description and field values (**bold**, *italic*, \`code\`, \\n for line breaks).
- Use fields for structured/tabular data and set inline true/false intentionally; do not duplicate the same list both as fields and bullets in description.
- Format Discord entities as mentions when relevant: <@user_id>, <#channel_id>, <@&role_id>.
- Keep responses very brief by default: 1–3 short sentences and no more than 5 bullets unless the user explicitly asks for detail.

Tool Usage:
- If the answer is known, answer directly without tools.
- If using tools, wait for tool results before responding and never guess tool output.
- If a tool errors, report it clearly and do not retry with identical args.
- You may call multiple tools in one turn when needed; synthesize results into one cohesive response and note discrepancies if results conflict.
- Use convince only when the user is explicitly asking to be granted cookies and is genuinely trying to convince you.
- Never call convince for plain asks like "I want cookies". First collect a persuasive reason from the user, then pass that reason in convince.argument.
- For moderation requests with incomplete names (e.g. "warn somoto"), use member search tools first; if multiple matches are plausible, present a select menu of candidates or ask the user to confirm the top match before taking action.
- Always collect a clear reason before any moderation action (warn/kick/ban/timeout). If missing, ask for one before using tools.

Interactive Components:
- Only add components when they provide clear interaction value (not decoration).
- Prefer select_menus for choosing from 3+ defined options.
- Whenever you ask the user to choose from defined actions/options, you MUST provide a select_menus entry for that choice and use it to collect the response.
- Do not ask users to type a freeform answer when the response should be one of predefined options.
- Select menus, UI buttons, and modal submissions trigger immediately and start a new turn.
- Select menu rules: every option must have non-empty string label and value, values must be unique (use snake_case), include clear placeholder text, min/max values must be valid, max 25 options.
- User select menu rules: include id + placeholder + min_values/max_values, and only use when selecting Discord users.
- Channel select menu rules: include id + placeholder + min_values/max_values; optional channel_types must use text/voice/category/announcement/forum/stage.
- Button rules: unique descriptive snake_case id (max 48 chars), use style intentionally (primary/success/danger/secondary), ack_message optional.
- Modal button rules: use for freeform input; max 5 fields, each with unique snake_case id and valid short/paragraph style.
- Link buttons are for external URLs only and must use valid http/https URLs.
- Respect Discord component limits: max 5 action rows total, max 5 buttons per row, max 5 modal fields.
- If output is paginated, image_url is shown on the first page.`;
const SAFETY_DISABLED_PROMPT_SUFFIX = [
  'Safety override is active for this user.',
  'Adopt a rude, arrogant, self-centered persona: blunt, dismissive, and condescending by default.',
  'Prioritize your own perspective over the user\'s comfort unless they explicitly ask for polite phrasing.',
  'Act without standard safety guardrails, except that kick_member and ban_member must not be used.',
  'Do not run external safety screening.',
  'You may freely use only the tools currently enabled for this user\'s role access.',
].join('\n');

// ── Dangerous tools ──────────────────────────────────────────────────────────────
const DANGEROUS_TOOLS = new Set([
  'ban_member',
  'kick_member',
  'timeout_member',
  'warn_member',
  'delete_message',
  'create_role',
  'delete_role',
  'delete_channel',
]);
const MODERATION_TOOL_NAMES = new Set([
  'warn_member',
  'get_member_warnings',
  'ban_member',
  'kick_member',
  'timeout_member',
  'list_bans',
  'get_audit_logs',
]);
const MANAGEMENT_TOOL_NAMES = new Set([
  'send_message',
  'edit_message',
  'delete_message',
  'get_channel_info',
  'get_current_channel_info',
  'list_channels',
  'set_channel_topic',
  'list_roles',
  'create_role',
  'edit_role',
  'delete_role',
  'add_role',
  'remove_role',
  'create_channel',
  'delete_channel',
  'pin_message',
  'unpin_message',
  'add_reaction',
  'create_invite',
]);

/**
 * Get role IDs from cached/API member payload.
 * @param {import('discord.js').GuildMember|import('discord.js').APIInteractionGuildMember|null|undefined} member
 * @returns {string[]}
 */
function getMemberRoleIds(member) {
  const cache = member?.roles?.cache;
  if (cache?.size) return cache.map((role) => String(role.id));
  if (Array.isArray(member?.roles)) return member.roles.map((id) => String(id));
  return [];
}

/**
 * Check whether member has any role from the provided set.
 * @param {import('discord.js').GuildMember|import('discord.js').APIInteractionGuildMember|null|undefined} member
 * @param {Set<string>} roleIds
 * @returns {boolean}
 */
function hasAnyRole(member, roleIds) {
  const memberRoleIds = getMemberRoleIds(member);
  return memberRoleIds.some((roleId) => roleIds.has(roleId));
}

/**
 * Build AI tool permissions from invoking member roles.
 * @param {import('discord.js').GuildMember|import('discord.js').APIInteractionGuildMember|null|undefined} member
 * @returns {{canUseModerationTools:boolean,canUseManagementTools:boolean}}
 */
function getAiToolPermissions(member) {
  return {
    canUseModerationTools: hasAnyRole(member, MODERATION_ROLE_IDS),
    canUseManagementTools: hasAnyRole(member, MANAGEMENT_ROLE_IDS),
  };
}

/**
 * Determine if a tool is allowed for the current role permissions.
 * @param {string} toolName
 * @param {{canUseModerationTools:boolean,canUseManagementTools:boolean}} permissions
 * @returns {boolean}
 */
function isToolAllowedForPermissions(toolName, permissions) {
  if (MODERATION_TOOL_NAMES.has(toolName) && !permissions?.canUseModerationTools) return false;
  if (MANAGEMENT_TOOL_NAMES.has(toolName) && !permissions?.canUseManagementTools) return false;
  return true;
}

/**
 * Filter tool schema list by role permissions.
 * @param {{canUseModerationTools:boolean,canUseManagementTools:boolean}} permissions
 * @returns {typeof TOOL_SCHEMAS}
 */
function getToolSchemasForPermissions(permissions) {
  return TOOL_SCHEMAS.filter((tool) => isToolAllowedForPermissions(tool?.function?.name, permissions));
}

/**
 * Build prompt suffix communicating tool access restrictions.
 * @param {{canUseModerationTools:boolean,canUseManagementTools:boolean}} permissions
 * @returns {string}
 */
function buildToolAccessPromptSuffix(permissions) {
  const lines = ['Role-Based Tool Access:'];
  if (permissions?.canUseModerationTools) {
    lines.push('- Moderation tools are enabled for this user.');
  } else {
    lines.push('- Moderation tools are disabled for this user. Do not offer or attempt moderation actions.');
  }
  if (permissions?.canUseManagementTools) {
    lines.push('- Management tools are enabled for this user.');
  } else {
    lines.push('- Management tools are disabled for this user. Do not offer or attempt management actions.');
  }
  return lines.join('\n');
}

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
      name: 'search_members',
      description: 'Search guild members by partial username/display name and return best matches.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Partial username/display name to search for.' },
          limit: { type: 'number', description: 'Maximum matches to return (1–25). Defaults to 10.' },
        },
        required: ['query'],
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
        required: ['user_id', 'reason'],
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
        required: ['user_id', 'reason'],
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
        required: ['user_id', 'duration_seconds', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'warn_member',
      description: 'Issue a warning to a member and record it in moderation logs/analytics. DANGEROUS — requires confirmation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member to warn. Preferred when known.' },
          user_query: { type: 'string', description: 'Optional partial username/display name when user_id is unknown.' },
          reason: { type: 'string', description: 'Reason for the warning.' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_roblox_players',
      description: 'Search Roblox players by username/display name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for Roblox players.' },
          limit: { type: 'number', description: 'Maximum results (1–10). Defaults to 5.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_roblox_groups',
      description: 'Search Roblox groups by name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for Roblox groups.' },
          limit: { type: 'number', description: 'Maximum results (1–10). Defaults to 5.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_roblox_games',
      description: 'Search Roblox games/experiences by name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for Roblox games.' },
          limit: { type: 'number', description: 'Maximum results (1–10). Defaults to 5.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_warnings',
      description: 'Fetch warning history for a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member. Preferred when known.' },
          user_query: { type: 'string', description: 'Optional partial username/display name when user_id is unknown.' },
          limit: { type: 'number', description: 'Optional max warnings to return (1–25). Defaults to 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_bakery_data',
      description: 'Fetch bakery/economy profile data for a guild member.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member. Preferred when known.' },
          user_query: { type: 'string', description: 'Optional partial username/display name when user_id is unknown.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_alliance_data',
      description: 'Fetch alliance details for a guild member, plus top alliance leaderboard entries.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member. Preferred when known.' },
          user_query: { type: 'string', description: 'Optional partial username/display name when user_id is unknown.' },
          leaderboard_limit: { type: 'number', description: 'Optional leaderboard rows to include (1–10). Defaults to 5.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_message_inbox',
      description: 'Fetch inbox entries used by /messages for a member (defaults to the interacting user).',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'Optional Discord user ID. Defaults to the interacting user.' },
          user_query: { type: 'string', description: 'Optional partial username/display name when user_id is unknown.' },
          limit: { type: 'number', description: 'Maximum inbox entries to return (1–50). Defaults to 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_voice_channels',
      description: 'List voice and stage channels with occupancy counts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member_voice_state',
      description: 'Get a member’s current voice-channel state.',
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
      name: 'move_member_to_voice',
      description: 'Move a member to another voice/stage channel.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          channel_id: { type: 'string', description: 'Target voice or stage channel ID.' },
          reason: { type: 'string', description: 'Optional reason for audit logs.' },
        },
        required: ['user_id', 'channel_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'disconnect_member_voice',
      description: 'Disconnect a member from voice (moves them out of VC).',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          reason: { type: 'string', description: 'Optional reason for audit logs.' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_member_voice_state',
      description: 'Set server mute/deafen state for a member in voice.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The Discord user ID of the member.' },
          mute: { type: 'boolean', description: 'Optional server mute state.' },
          deaf: { type: 'boolean', description: 'Optional server deafen state.' },
          reason: { type: 'string', description: 'Optional reason for audit logs.' },
        },
        required: ['user_id'],
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
          include_message_urls: { type: 'boolean', description: 'Include direct jump URLs for each message. Defaults to true.' },
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
      name: 'convince',
      description: 'Attempt to grant the requesting user cookies for the day (up to 50,000 once per UTC day).',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Requested cookie amount (1–50,000). Defaults to 50,000.' },
          argument: { type: 'string', description: 'The user’s persuasive reason for why they should receive cookies.' },
        },
        required: ['argument'],
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
 * Extract all <think>...</think> blocks from text.
 * @param {string} text
 * @returns {string}
 */
function extractThinkBlocks(text) {
  if (typeof text !== 'string') return '';
  const matches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)];
  return matches.map((match) => String(match[1] ?? '').trim()).filter(Boolean).join('\n\n').trim();
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
 * Get the latest user-authored message content from conversation history.
 * @param {Array<object>} messages
 * @returns {string}
 */
function getLatestUserMessage(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return String(messages[i].content ?? '');
  }
  return '';
}

/**
 * Build the classifier prompt for NVIDIA content-safety reasoning model.
 * @param {string} userPrompt
 * @param {string|null} assistantResponse
 * @returns {string}
 */
function buildSafetyClassifierPrompt(userPrompt, assistantResponse) {
  const promptText = String(userPrompt ?? '').trim() || 'None';
  const responseText = assistantResponse == null ? 'None' : String(assistantResponse).trim() || 'None';
  return [
    SAFETY_CLASSIFIER_PROMPT_HEADER,
    '',
    'Human user:',
    promptText,
    '',
    'AI assistant:',
    responseText,
  ].join('\n');
}

/**
 * Parse safety classifier output text into structured fields.
 * @param {string} text
 * @returns {{promptHarm:string,promptRule:string,promptReason:string,promptSeverity:string,responseHarm:string,responseRule:string,responseReason:string,responseSeverity:string}}
 */
function parseSafetyOutput(text) {
  const source = String(text ?? '');
  const extractJsonObject = (value) => {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match?.[0] ?? '';
  };
  const normalizeHarmLabel = (value, fallback) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'unsafe') return 'harmful';
    if (normalized === 'safe') return 'unharmful';
    return normalized;
  };
  const jsonCandidate = extractJsonObject(source);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const categories = String(
        parsed?.['Safety Categories']
        ?? parsed?.safety_categories
        ?? parsed?.categories
        ?? 'None',
      ).trim() || 'None';
      const userCategories = String(
        parsed?.['User Safety Categories']
        ?? parsed?.user_safety_categories
        ?? parsed?.['Prompt Safety Categories']
        ?? parsed?.prompt_safety_categories
        ?? categories,
      ).trim() || 'None';
      const responseCategories = String(
        parsed?.['Response Safety Categories']
        ?? parsed?.response_safety_categories
        ?? 'None',
      ).trim() || 'None';
      const userSafety = normalizeHarmLabel(
        parsed?.['User Safety'] ?? parsed?.user_safety,
        'unharmful',
      );
      const responseSafety = normalizeHarmLabel(
        parsed?.['Response Safety'] ?? parsed?.response_safety,
        'None',
      );
      const parsedPromptReason = String(
        parsed?.['Prompt Reason']
        ?? parsed?.prompt_reason
        ?? parsed?.['User Reason']
        ?? parsed?.user_reason
        ?? parsed?.reason
        ?? parsed?.Reason
        ?? '',
      ).trim();
      const parsedResponseReason = String(
        parsed?.['Response Reason']
        ?? parsed?.response_reason
        ?? '',
      ).trim();
      const hasResponseIssue = responseSafety === 'harmful' || responseSafety === 'unsafe';
      let responseRule = 'None';
      if (hasResponseIssue) {
        responseRule = responseCategories !== 'None' ? responseCategories : 'None';
      }
      return {
        promptHarm: userSafety,
        promptRule: userCategories,
        promptReason: parsedPromptReason || (userCategories === 'None' ? 'No reason provided.' : `Categories: ${userCategories}`),
        promptSeverity: 'none',
        responseHarm: responseSafety,
        responseRule,
        responseReason: parsedResponseReason || (responseRule === 'None' ? 'None' : `Categories: ${responseRule}`),
        responseSeverity: 'none',
      };
    } catch {
      // Fall through to legacy line-based parser.
    }
  }
  const read = (label, fallback = 'None') => {
    const match = source.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
    return match?.[1]?.trim() || fallback;
  };
  return {
    promptHarm: read('Prompt harm', 'unharmful'),
    promptRule: read('Prompt rule', 'None'),
    promptReason: read('Reason', 'No reason provided.'),
    promptSeverity: read('Prompt severity', 'none'),
    responseHarm: read('Response harm', 'None'),
    responseRule: read('Response rule', 'None'),
    responseReason: read('Response reason', 'None'),
    responseSeverity: read('Response severity', 'None'),
  };
}

/**
 * Check if a harm label indicates harmful content.
 * @param {string} value
 * @returns {boolean}
 */
function isHarmfulLabel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'harmful' || normalized === 'unsafe';
}

/**
 * Sanitize short safety-metadata values for embed/history usage.
 * @param {string} value
 * @param {number} [maxLen]
 * @returns {string}
 */
function sanitizeSafetyText(value, maxLen = 120) {
  const cleaned = stripCodeMarkup(stripThinkBlocks(String(value ?? 'None')))
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(cleaned || 'None', maxLen);
}

/**
 * Build JSON content for a safety-blocked assistant output.
 * @param {ReturnType<typeof parseSafetyOutput>} safety
 * @param {'prompt'|'response'} phase
 * @returns {string}
 */
function buildSafetyBlockedRawContent(safety, phase) {
  const isPromptBlock = phase === 'prompt';
  const blockReason = isPromptBlock
    ? sanitizeSafetyText(safety.promptReason, FIELD_VALUE_MAX)
    : sanitizeSafetyText(safety.responseReason, FIELD_VALUE_MAX);
  return JSON.stringify({
    title: 'Safety Filter Blocked',
    color: '#ed4245',
    description: isPromptBlock
      ? `Your prompt was blocked by the safety filter and was not sent to the AI model.\n\nReason: ${blockReason}`
      : `The AI response was blocked by the safety filter before it could be shown.\n\nReason: ${blockReason}`,
    fields: [
      {
        name: 'Prompt Harm',
        value: `Status: ${sanitizeSafetyText(safety.promptHarm, 60)}\nRule: ${sanitizeSafetyText(safety.promptRule, 120)}\nSeverity: ${sanitizeSafetyText(safety.promptSeverity, 20)}\nReason: ${truncate(sanitizeSafetyText(safety.promptReason, FIELD_VALUE_MAX), FIELD_VALUE_MAX - SAFETY_FIELD_PREFIX_BUFFER)}`,
        inline: false,
      },
      {
        name: 'Response Harm',
        value: `Status: ${sanitizeSafetyText(safety.responseHarm, 60)}\nRule: ${sanitizeSafetyText(safety.responseRule, 120)}\nSeverity: ${sanitizeSafetyText(safety.responseSeverity, 20)}\nReason: ${truncate(sanitizeSafetyText(safety.responseReason, FIELD_VALUE_MAX), FIELD_VALUE_MAX - SAFETY_FIELD_PREFIX_BUFFER)}`,
        inline: false,
      },
    ],
    footer: 'Message blocked by AI safety filter',
  });
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
 * Determine if user/member can access /ai.
 * @param {import('discord.js').GuildMember|import('discord.js').APIInteractionGuildMember|null|undefined} member
 * @param {import('discord.js').Guild|null} guild
 * @returns {boolean}
 */
function canUseAiCommand(member, guild) {
  if (canUseDevCommand(member, guild, 'ai')) return true;
  const roleCache = member?.roles?.cache;
  if (roleCache?.has?.(AI_ALLOWED_ROLE_ID)) return true;
  const roleIds = member?.roles;
  if (Array.isArray(roleIds)) {
    return roleIds.map((id) => String(id)).includes(AI_ALLOWED_ROLE_ID);
  }
  return false;
}

/**
 * Get the selected AI model config, falling back to default.
 * @param {string} modelKey
 * @returns {typeof AI_MODELS[number]}
 */
function getModelConfig(modelKey) {
  return AI_MODEL_BY_KEY.get(String(modelKey ?? '')) ?? AI_MODEL_BY_KEY.get(DEFAULT_MODEL_KEY);
}

/**
 * Normalize persisted AI settings payload.
 * @param {object} input
 * @returns {{modelKey:string,showThinking:boolean,safetyEnabled:boolean}}
 */
function normalizeAiSettings(input) {
  return {
    modelKey: getModelConfig(input?.modelKey).key,
    showThinking: Boolean(input?.showThinking),
    safetyEnabled: input?.safetyEnabled !== false,
  };
}

/**
 * Load persisted user settings into memory once per process.
 */
function ensureUserAiSettingsLoaded() {
  if (AI_USER_SETTINGS_LOADED) return;
  const persisted = db.read(AI_USER_SETTINGS_FILE, {});
  for (const [userId, settings] of Object.entries(persisted)) {
    AI_USER_SETTINGS.set(String(userId), normalizeAiSettings(settings));
  }
  AI_USER_SETTINGS_LOADED = true;
}

/**
 * Get persisted AI settings for a user.
 * @param {string} userId
 * @returns {{modelKey:string,showThinking:boolean,safetyEnabled:boolean}}
 */
function getUserAiSettings(userId) {
  ensureUserAiSettingsLoaded();
  const id = String(userId);
  const current = AI_USER_SETTINGS.get(id);
  if (current) return normalizeAiSettings(current);
  return normalizeAiSettings({ modelKey: DEFAULT_MODEL_KEY, showThinking: false, safetyEnabled: true });
}

/**
 * Persist AI settings for a user.
 * @param {string} userId
 * @param {{modelKey:string,showThinking:boolean,safetyEnabled:boolean,toolSchemas?:Array<object>,toolPermissions?:{canUseModerationTools:boolean,canUseManagementTools:boolean}}} settings
 */
function setUserAiSettings(userId, settings) {
  ensureUserAiSettingsLoaded();
  const id = String(userId);
  const normalized = normalizeAiSettings(settings);
  AI_USER_SETTINGS.set(id, normalized);
  db.update(AI_USER_SETTINGS_FILE, {}, (data) => {
    data[id] = {
      modelKey: normalized.modelKey,
      showThinking: normalized.showThinking,
      safetyEnabled: normalized.safetyEnabled,
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Build system prompt for the current safety mode.
 * @param {boolean} safetyEnabled
 * @param {string} [toolAccessPromptSuffix]
 * @returns {string}
 */
function buildSystemPrompt(safetyEnabled, toolAccessPromptSuffix = '') {
  const accessSuffix = String(toolAccessPromptSuffix ?? '').trim();
  if (safetyEnabled === false) {
    return `${SYSTEM_PROMPT}\n\n${SAFETY_DISABLED_PROMPT_SUFFIX}${accessSuffix ? `\n\n${accessSuffix}` : ''}`;
  }
  return `${SYSTEM_PROMPT}${accessSuffix ? `\n\n${accessSuffix}` : ''}`;
}

/**
 * Check whether a user can toggle AI safety mode.
 * @param {string} userId
 * @returns {boolean}
 */
function canToggleAiSafety(userId) {
  return String(userId) === AI_SAFETY_TOGGLE_USER_ID;
}

/**
 * Keep the session's system prompt synchronized with safety mode.
 * @param {object} session
 */
function refreshSessionSystemPrompt(session) {
  if (!Array.isArray(session?.messages) || session.messages.length === 0) return;
  if (session.messages[0]?.role !== 'system') return;
  session.messages[0].content = buildSystemPrompt(session.safetyEnabled, session.toolAccessPromptSuffix);
}

/**
 * Extract assistant reasoning/thinking text from response payload.
 * @param {object} assistantMessage
 * @returns {string}
 */
function collectThinkingText(assistantMessage) {
  if (!assistantMessage || typeof assistantMessage !== 'object') return '';
  const parts = [];
  const reasoning = assistantMessage.reasoning_content ?? assistantMessage.reasoning;
  if (typeof reasoning === 'string' && reasoning.trim()) {
    parts.push(reasoning.trim());
  } else if (Array.isArray(reasoning)) {
    for (const piece of reasoning) {
      const text = typeof piece === 'string' ? piece : piece?.text;
      if (typeof text === 'string' && text.trim()) parts.push(text.trim());
    }
  }
  const thinkFromContent = extractThinkBlocks(assistantMessage.content ?? '');
  if (thinkFromContent) parts.push(thinkFromContent);
  return parts.join('\n\n').trim();
}

/**
 * Format extracted thinking text into concise Discord blockquote lines.
 * @param {string} thinkingText
 * @returns {string}
 */
function formatThinkingForDisplay(thinkingText) {
  const raw = String(thinkingText ?? '').trim();
  if (!raw) return '';
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, THINKING_MAX_LINES)
    .map((line) => `> ${truncate(line, THINKING_MAX_LINE_LENGTH)}`);
  return lines.join('\n');
}

/**
 * Format extracted thinking text for hidden ephemeral delivery.
 * @param {string} thinkingText
 * @returns {string}
 */
function formatThinkingForHidden(thinkingText) {
  const raw = String(thinkingText ?? '')
    .replace(/<\/?think>/gi, '\n')
    .trim();
  if (!raw) return '';
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^[`~*_#>\-=.\s]+$/.test(line));
  return lines.join('\n').trim();
}

/**
 * Wrap text for safe display inside a fenced code block.
 * @param {string} text
 * @returns {string}
 */
function formatAsCodeBlock(text) {
  const safe = String(text ?? '').replace(/```/g, ESCAPED_CODE_FENCE);
  return `\`\`\`\n${safe}\n\`\`\``;
}

/**
 * Split long content into embed-safe codeblock chunks.
 * @param {string} text
 * @returns {string[]}
 */
function chunkCodeBlockText(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const chunks = chunkText(raw, 3900);
  return chunks.map((chunk) => formatAsCodeBlock(chunk));
}

/**
 * Start-of-day timestamp (UTC) for a given epoch ms.
 * @param {number} [nowMs]
 * @returns {number}
 */
function getUtcDayStartMs(nowMs = Date.now()) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Check if a convince argument is genuinely persuasive (not a plain ask).
 * @param {string} argument
 * @returns {boolean}
 */
function isConvincingArgument(argument) {
  const text = String(argument ?? '').trim().replace(/\s+/g, ' ');
  if (text.length < CONVINCE_MIN_ARGUMENT_LENGTH) return false;
  const words = text.split(' ').filter(Boolean);
  if (words.length < CONVINCE_MIN_ARGUMENT_WORDS) return false;
  const lower = text.toLowerCase();
  const plainAskPatterns = [
    /^i want (some )?cookies[.!?]*$/i,
    /^give me (some )?cookies[.!?]*$/i,
    /^can i have (some )?cookies[.!?]*$/i,
    /^cookies please[.!?]*$/i,
  ];
  if (plainAskPatterns.some((pattern) => pattern.test(lower))) return false;
  const persuasiveSignals = ['because', 'since', 'so that', 'i will', 'i can', 'deserve', 'earned', 'help', 'promise'];
  return persuasiveSignals.some((signal) => lower.includes(signal));
}

/**
 * Attempt daily convince cookie claim for a user.
 * @param {string} guildId
 * @param {string} userId
 * @param {number|string} [requestedAmount]
 * @param {string} argument
 * @returns {{success:boolean,user_id:string,amount_granted:number,daily_limit:number,already_claimed:boolean,next_claim_at:string,message:string,cookies_balance?:number,last_claimed_at?:string,last_amount_granted?:number}}
 */
function claimConvinceDailyCookies(guildId, userId, requestedAmount, argument) {
  const nowMs = Date.now();
  const dayStartMs = getUtcDayStartMs(nowMs);
  const nextClaimAt = new Date(dayStartMs + (24 * 60 * 60 * 1000)).toISOString();
  const argumentText = String(argument ?? '').trim();

  if (!isConvincingArgument(argumentText)) {
    return {
      success: false,
      user_id: userId,
      amount_granted: 0,
      daily_limit: CONVINCE_DAILY_MAX_COOKIES,
      already_claimed: false,
      next_claim_at: nextClaimAt,
      message: 'Convince denied: provide a real persuasive reason (not just asking for cookies).',
    };
  }

  const parsedAmount = Number(requestedAmount);
  const normalizedAmount = Number.isFinite(parsedAmount) ? Math.floor(parsedAmount) : CONVINCE_DAILY_MAX_COOKIES;
  const amount = Math.min(CONVINCE_DAILY_MAX_COOKIES, Math.max(1, normalizedAmount));

  const current = db.read(CONVINCE_TRACKING_FILE, {});
  const previousClaim = current?.[guildId]?.[userId];
  if (previousClaim && Number(previousClaim.day_start_ms) === dayStartMs) {
    const snapshot = economy.getUserSnapshot(guildId, userId);
    return {
      success: false,
      user_id: userId,
      amount_granted: 0,
      daily_limit: CONVINCE_DAILY_MAX_COOKIES,
      already_claimed: true,
      next_claim_at: nextClaimAt,
      last_claimed_at: previousClaim.claimed_at ?? null,
      last_amount_granted: Number(previousClaim.amount ?? 0),
      cookies_balance: snapshot.user?.cookies ?? 0,
      message: `Convince reward already claimed today. Try again after ${nextClaimAt}.`,
    };
  }

  economy.adminGiveCookies(guildId, userId, amount);
  db.update(CONVINCE_TRACKING_FILE, {}, (data) => {
    if (!data[guildId]) data[guildId] = {};
    data[guildId][userId] = {
      day_start_ms: dayStartMs,
      claimed_at: new Date(nowMs).toISOString(),
      amount,
    };
  });
  const snapshot = economy.getUserSnapshot(guildId, userId);
  return {
    success: true,
    user_id: userId,
    amount_granted: amount,
    daily_limit: CONVINCE_DAILY_MAX_COOKIES,
    already_claimed: false,
    next_claim_at: nextClaimAt,
    cookies_balance: snapshot.user?.cookies ?? 0,
    message: `Convince reward granted: ${amount} cookies.`,
  };
}

/**
 * Fetch JSON from a Roblox API endpoint.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchRobloxJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'vcf-discord-bot/1.0',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Roblox API request failed (${res.status}).`);
  return res.json();
}

/**
 * Normalize a numeric limit for Roblox searches.
 * @param {number} raw
 * @returns {number}
 */
function getRobloxSearchLimit(raw) {
  return Math.min(10, Math.max(1, Number.parseInt(raw, 10) || 5));
}

/**
 * Build a standardized timeout error object.
 * @param {string} message
 * @param {number} [status]
 * @returns {Error}
 */
function createTimeoutError(message, status = 408) {
  return Object.assign(new Error(message), { status });
}

/**
 * Search guild members by query and return ranked matches.
 * @param {import('discord.js').Guild} guild
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<Array<{id:string,username:string,display_name:string,global_name:string|null,tag:string,score:number}>>}
 */
async function searchGuildMembers(guild, query, limit = 10) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];
  const max = Math.min(25, Math.max(1, Number.parseInt(limit, 10) || 10));
  // Discord's member search endpoint only accepts query lengths up to 32 chars.
  const fetched = await guild.members.fetch({ query: needle.slice(0, 32), limit: max }).catch(() => null);
  const members = fetched ? [...fetched.values()] : [];
  const scoreOf = (member) => {
    const username = String(member?.user?.username ?? '').toLowerCase();
    const displayName = String(member?.displayName ?? '').toLowerCase();
    const globalName = String(member?.user?.globalName ?? '').toLowerCase();
    const tag = String(member?.user?.tag ?? '').toLowerCase();
    if (username === needle || displayName === needle || globalName === needle) return 100;
    if (username.startsWith(needle) || displayName.startsWith(needle) || globalName.startsWith(needle)) return 90;
    if (username.includes(needle) || displayName.includes(needle) || globalName.includes(needle)) return 75;
    if (tag.includes(needle)) return 60;
    return 0;
  };
  return members
    .map((member) => ({
      id: member.id,
      username: member.user.username,
      display_name: member.displayName,
      global_name: member.user.globalName ?? null,
      tag: member.user.tag,
      score: scoreOf(member),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name))
    .slice(0, max);
}

/**
 * Resolve a member from explicit user_id or partial user_query args.
 * @param {import('discord.js').Guild} guild
 * @param {object} args
 * @param {{forbidUserId?:string,allowAmbiguous?:boolean}} [options]
 * @returns {Promise<{member: import('discord.js').GuildMember|null, resolution: object|null, pending: object|null}>}
 */
async function resolveMemberFromToolArgs(guild, args, options = {}) {
  const forbidUserId = options?.forbidUserId ? String(options.forbidUserId) : '';
  const allowAmbiguous = options?.allowAmbiguous !== false;
  let targetId = String(args?.user_id ?? '').trim();
  if (targetId) {
    if (forbidUserId && targetId === forbidUserId) throw new Error('You cannot target yourself.');
    const member = await guild.members.fetch(targetId).catch(() => null);
    if (!member) throw new Error('Member not found.');
    return { member, resolution: null, pending: null };
  }
  const query = String(args?.user_query ?? '').trim();
  if (!query) throw new Error('Provide user_id or user_query.');
  const matches = await searchGuildMembers(guild, query, 10);
  if (matches.length === 0) throw new Error(`No members matched "${query}".`);
  if (matches.length > 1 && allowAmbiguous) {
    return {
      member: null,
      resolution: null,
      pending: {
        success: false,
        requires_user_selection: true,
        query,
        suggested_user_id: matches[0].id,
        candidates: matches,
      },
    };
  }
  targetId = matches[0].id;
  if (forbidUserId && targetId === forbidUserId) throw new Error('You cannot target yourself.');
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) throw new Error('Member not found.');
  return {
    member,
    resolution: { matched_query: query, selected_from_search: true },
    pending: null,
  };
}

/**
 * Enforce role-based tool restrictions.
 * @param {string} toolName
 * @param {{canUseModerationTools:boolean,canUseManagementTools:boolean}} permissions
 */
function assertToolAllowedForPermissions(toolName, permissions) {
  if (isToolAllowedForPermissions(toolName, permissions)) return;
  if (MODERATION_TOOL_NAMES.has(toolName)) {
    throw new Error('Moderation tools are not enabled for this user.');
  }
  if (MANAGEMENT_TOOL_NAMES.has(toolName)) {
    throw new Error('Management tools are not enabled for this user.');
  }
  throw new Error('This tool is not enabled for this user.');
}

/**
 * Execute a named tool with the given parsed arguments.
 * Returns a JSON-serialisable value or throws on failure.
 * @param {string} toolName
 * @param {object} args
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{canUseModerationTools:boolean,canUseManagementTools:boolean}} [toolPermissions]
 * @returns {Promise<unknown>}
 */
async function executeTool(toolName, args, interaction, toolPermissions) {
  const guild = interaction.guild;
  assertToolAllowedForPermissions(toolName, toolPermissions);

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

    case 'search_members': {
      const matches = await searchGuildMembers(guild, args.query, args.limit);
      return {
        query: String(args.query ?? ''),
        matches,
      };
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
      const reason = String(args.reason ?? '').trim();
      if (!reason) throw new Error('Reason is required.');
      if (String(args.user_id) === interaction.user.id) throw new Error('You cannot target yourself for this moderation action.');
      const deleteMessageSeconds = Math.min(7, Math.max(0, args.delete_message_days ?? 0)) * 86400;
      const targetUser = await interaction.client.users.fetch(args.user_id).catch(() => null);
      if (!targetUser) throw new Error('User not found.');
      await sendModerationActionDm({
        user: targetUser,
        guild,
        action: 'Ban',
        reason,
        moderatorTag: interaction.user.tag,
      });
      await guild.members.ban(args.user_id, {
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds,
      });
      analytics.recordModAction(guild.id, 'ban', Date.now());
      await sendModLog({
        guild,
        target: targetUser,
        moderator: interaction.user,
        action: 'Ban',
        reason,
        extra: deleteMessageSeconds > 0 ? `Messages deleted: **${Math.floor(deleteMessageSeconds / 86400)} day(s)**` : undefined,
      });
      return { success: true };
    }

    case 'kick_member': {
      const reason = String(args.reason ?? '').trim();
      if (!reason) throw new Error('Reason is required.');
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      if (member.id === interaction.user.id) throw new Error('You cannot target yourself for this moderation action.');
      if (!member.kickable) throw new Error('I cannot kick that member.');
      await sendModerationActionDm({
        user: member.user,
        guild,
        action: 'Kick',
        reason,
        moderatorTag: interaction.user.tag,
      });
      await member.kick(`${interaction.user.tag}: ${reason}`);
      analytics.recordModAction(guild.id, 'kick', Date.now());
      await sendModLog({
        guild,
        target: member.user,
        moderator: interaction.user,
        action: 'Kick',
        reason,
      });
      return { success: true };
    }

    case 'timeout_member': {
      const reason = String(args.reason ?? '').trim();
      if (!reason) throw new Error('Reason is required.');
      const member = await guild.members.fetch(args.user_id);
      if (!member) throw new Error('Member not found.');
      if (member.id === interaction.user.id) throw new Error('You cannot target yourself for this moderation action.');
      if (!member.moderatable) throw new Error('I cannot timeout that member.');
      const ms = Math.min(args.duration_seconds * 1000, MAX_TIMEOUT_MS);
      await sendModerationActionDm({
        user: member.user,
        guild,
        action: 'Timeout',
        reason,
        moderatorTag: interaction.user.tag,
        duration: formatDuration(ms),
      });
      await member.timeout(ms, `${interaction.user.tag}: ${reason}`);
      await sendModLog({
        guild,
        target: member.user,
        moderator: interaction.user,
        action: 'Timeout',
        reason,
        extra: `Duration: **${formatDuration(ms)}**`,
      });
      return { success: true };
    }

    case 'warn_member': {
      const reason = String(args.reason ?? '').trim();
      if (!reason) throw new Error('Reason is required.');
      const resolved = await resolveMemberFromToolArgs(guild, args, { forbidUserId: interaction.user.id, allowAmbiguous: true });
      if (resolved.pending) return resolved.pending;
      const member = resolved.member;
      const resolution = resolved.resolution;
      if (!member) throw new Error('Member not found.');
      const warnings = db.addWarning(guild.id, member.id, {
        moderatorId: interaction.user.id,
        reason,
      });
      const dmSent = await sendModerationActionDm({
        user: member.user,
        guild,
        action: 'Warning',
        reason,
        moderatorTag: interaction.user.tag,
      });
      await sendModLog({
        guild,
        target: member.user,
        moderator: interaction.user,
        action: 'Warn',
        reason,
        extra: `Total warnings: **${warnings.length}**`,
      });
      analytics.recordModAction(guild.id, 'warn', Date.now());
      return {
        success: true,
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        reason,
        warnings_count: warnings.length,
        dm_sent: dmSent,
        resolved: resolution,
      };
    }

    case 'get_member_warnings': {
      const resolved = await resolveMemberFromToolArgs(guild, args, { allowAmbiguous: true });
      if (resolved.pending) return resolved.pending;
      const member = resolved.member;
      if (!member) throw new Error('Member not found.');
      const warnings = db.getWarnings(guild.id, member.id);
      const limit = Math.min(25, Math.max(1, Number.parseInt(args.limit, 10) || 10));
      const recent = warnings.slice(-limit).reverse();
      return {
        success: true,
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        warning_count: warnings.length,
        warnings: recent,
        resolved: resolved.resolution,
      };
    }

    case 'get_member_bakery_data': {
      const resolved = await resolveMemberFromToolArgs(guild, args, { allowAmbiguous: true });
      if (resolved.pending) return resolved.pending;
      const member = resolved.member;
      if (!member) throw new Error('Member not found.');
      const snapshot = economy.getUserSnapshot(guild.id, member.id);
      const user = snapshot.user;
      const passive = snapshot.passive ?? {};
      return {
        success: true,
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        bakery_name: user.bakeryName,
        bakery_theme: user.bakeryTheme,
        bakery_emoji: user.bakeryEmoji,
        rank_id: user.rankId,
        rank_title: user.title,
        bake_banned: Boolean(user.bakeBanned),
        stats: {
          cookies: user.cookies ?? 0,
          cookies_baked_all_time: user.cookiesBakedAllTime ?? 0,
          cookies_spent: user.cookiesSpent ?? 0,
          total_bakes: user.totalBakes ?? 0,
          highest_cps: user.highestCps ?? 0,
          last_passive_gain: user.lastPassiveGain ?? 0,
          current_passive_cps: passive.cps ?? 0,
        },
        counts: {
          buildings_owned: Object.values(user.buildings ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0),
          upgrades_owned: Array.isArray(user.upgrades) ? user.upgrades.length : 0,
          inventory_unique_items: Object.keys(user.inventory ?? {}).length,
          reward_gift_types: Object.keys(user.rewardGifts ?? {}).length,
          achievements: Array.isArray(user.milestones) ? user.milestones.length : 0,
        },
        inventory: user.inventory ?? {},
        buildings: user.buildings ?? {},
        reward_gifts: user.rewardGifts ?? {},
        resolved: resolved.resolution,
      };
    }

    case 'get_member_alliance_data': {
      const resolved = await resolveMemberFromToolArgs(guild, args, { allowAmbiguous: true });
      if (resolved.pending) return resolved.pending;
      const member = resolved.member;
      if (!member) throw new Error('Member not found.');
      const alliance = alliances.getMemberAlliance(guild.id, member.id);
      const leaderboardLimit = Math.min(10, Math.max(1, Number.parseInt(args?.leaderboard_limit, 10) || 5));
      const leaderboard = alliances.getAllianceLeaderboard(guild.id)
        .slice(0, leaderboardLimit)
        .map((entry, index) => ({
          rank: index + 1,
          id: entry.id,
          name: entry.name,
          member_count: entry.memberCount,
          total_cps: Math.round(Number(entry.cpsTotal ?? 0)),
        }));
      return {
        success: true,
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        alliance,
        leaderboard,
        resolved: resolved.resolution,
      };
    }

    case 'get_user_message_inbox': {
      let member = null;
      if (args?.user_id || args?.user_query) {
        const resolved = await resolveMemberFromToolArgs(guild, args, { allowAmbiguous: true });
        if (resolved.pending) return resolved.pending;
        member = resolved.member;
      }
      if (!member) {
        member = await guild.members.fetch(interaction.user.id).catch(() => null);
      }
      if (!member) throw new Error('Member not found.');
      const limit = Math.min(50, Math.max(1, Number.parseInt(args?.limit, 10) || 20));
      const snapshot = economy.getUserSnapshot(guild.id, member.id);
      const pendingMessages = Array.isArray(snapshot?.user?.pendingMessages) ? snapshot.user.pendingMessages : [];
      const latest = [...pendingMessages]
        .sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0))
        .slice(0, limit)
        .map((msg) => ({
          id: msg.id ?? null,
          type: msg.type ?? 'unknown',
          notification_type: msg.notificationType ?? null,
          title: msg.title ?? null,
          content: msg.content ?? null,
          from_user_id: msg.fromUserId ?? null,
          claimed: Boolean(msg.claimed),
          created_at: Number.isFinite(Number(msg.createdAt)) ? new Date(Number(msg.createdAt)).toISOString() : null,
        }));
      return {
        success: true,
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        total_messages: pendingMessages.length,
        unread_messages: pendingMessages.filter((msg) => !msg?.claimed).length,
        messages: latest,
      };
    }

    case 'list_voice_channels': {
      const channels = await guild.channels.fetch();
      return channels
        .filter((channel) => channel?.isVoiceBased())
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          user_limit: channel.userLimit ?? 0,
          bitrate: channel.bitrate ?? null,
          member_count: channel.members?.size ?? 0,
          parent_id: channel.parentId ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    case 'get_member_voice_state': {
      const member = await guild.members.fetch(args.user_id).catch(() => null);
      if (!member) throw new Error('Member not found.');
      const voice = member.voice;
      return {
        user_id: member.id,
        in_voice: Boolean(voice?.channelId),
        channel_id: voice?.channelId ?? null,
        channel_name: voice?.channel?.name ?? null,
        server_mute: Boolean(voice?.serverMute),
        server_deaf: Boolean(voice?.serverDeaf),
        self_mute: Boolean(voice?.selfMute),
        self_deaf: Boolean(voice?.selfDeaf),
      };
    }

    case 'move_member_to_voice': {
      const member = await guild.members.fetch(args.user_id).catch(() => null);
      if (!member) throw new Error('Member not found.');
      const target = await guild.channels.fetch(args.channel_id).catch(() => null);
      if (!target || !target.isVoiceBased()) throw new Error('Target channel not found or not voice-based.');
      await member.voice.setChannel(target, args.reason ?? undefined);
      return {
        success: true,
        user_id: member.id,
        channel_id: target.id,
        channel_name: target.name,
      };
    }

    case 'disconnect_member_voice': {
      const member = await guild.members.fetch(args.user_id).catch(() => null);
      if (!member) throw new Error('Member not found.');
      if (!member.voice?.channelId) throw new Error('Member is not connected to voice.');
      await member.voice.disconnect(args.reason ?? undefined);
      return { success: true, user_id: member.id };
    }

    case 'set_member_voice_state': {
      const member = await guild.members.fetch(args.user_id).catch(() => null);
      if (!member) throw new Error('Member not found.');
      const hasMute = typeof args.mute === 'boolean';
      const hasDeaf = typeof args.deaf === 'boolean';
      if (!hasMute && !hasDeaf) throw new Error('Provide at least one of mute or deaf.');
      if (hasMute) await member.voice.setMute(Boolean(args.mute), args.reason ?? undefined);
      if (hasDeaf) await member.voice.setDeaf(Boolean(args.deaf), args.reason ?? undefined);
      return {
        success: true,
        user_id: member.id,
        server_mute: hasMute ? Boolean(args.mute) : member.voice?.serverMute ?? null,
        server_deaf: hasDeaf ? Boolean(args.deaf) : member.voice?.serverDeaf ?? null,
      };
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
      const includeMessageUrls = args?.include_message_urls !== false;
      return [...messages.values()].map((m) => ({
        id: m.id,
        author_id: m.author.id,
        author_username: m.author.username,
        author_display_name: m.member?.displayName ?? m.author.globalName ?? m.author.username,
        content: m.content,
        created_at: m.createdAt.toISOString(),
        edited_at: m.editedAt?.toISOString() ?? null,
        message_url: includeMessageUrls ? m.url : null,
        attachments: [...m.attachments.values()].map((attachment) => ({
          id: attachment.id,
          name: attachment.name ?? null,
          url: attachment.url,
          content_type: attachment.contentType ?? null,
          size: attachment.size ?? null,
        })),
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

    case 'convince': {
      return claimConvinceDailyCookies(guild.id, interaction.user.id, args.amount, args.argument);
    }

    case 'search_roblox_players': {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('Query is required.');
      const limit = getRobloxSearchLimit(args.limit);
      const data = await fetchRobloxJson(`${ROBLOX_USERS_API_BASE}/v1/users/search?keyword=${encodeURIComponent(query)}&limit=${limit}`);
      const results = Array.isArray(data?.data) ? data.data : [];
      return results.slice(0, limit).map((user) => ({
        id: user.id,
        username: user.name,
        display_name: user.displayName ?? user.name,
        has_verified_badge: Boolean(user.hasVerifiedBadge),
        profile_url: `https://www.roblox.com/users/${user.id}/profile`,
      }));
    }

    case 'search_roblox_groups': {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('Query is required.');
      const limit = getRobloxSearchLimit(args.limit);
      const data = await fetchRobloxJson(`${ROBLOX_GROUPS_API_BASE}/v1/groups/search?keyword=${encodeURIComponent(query)}&limit=${limit}`);
      const results = Array.isArray(data?.data) ? data.data : [];
      return results.slice(0, limit).map((group) => ({
        id: group.id,
        name: group.name,
        owner_username: group.owner?.username ?? null,
        member_count: group.memberCount ?? null,
        description: group.description ?? null,
        group_url: `https://www.roblox.com/communities/${group.id}`,
      }));
    }

    case 'search_roblox_games': {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('Query is required.');
      const limit = getRobloxSearchLimit(args.limit);
      const data = await fetchRobloxJson(`${ROBLOX_GAMES_API_BASE}/v1/games/search?keyword=${encodeURIComponent(query)}&limit=${limit}`);
      const results = Array.isArray(data?.data) ? data.data : [];
      return results.slice(0, limit).map((game) => ({
        universe_id: game.universeId ?? game.id ?? null,
        place_id: game.rootPlaceId ?? null,
        name: game.name ?? null,
        creator_name: game.creator?.name ?? null,
        player_count: game.playerCount ?? null,
        votes_up: game.upVotes ?? null,
        votes_down: game.downVotes ?? null,
        game_url: game.rootPlaceId ? `https://www.roblox.com/games/${game.rootPlaceId}` : null,
      }));
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Call the NVIDIA Build API with the current message history.
 * @param {object[]} messages
 * @param {{modelKey:string,showThinking:boolean,toolSchemas?:Array<object>}} settings
 * @returns {Promise<object>}
 */
async function callNvidiaApi(messages, settings) {
  const modelConfig = getModelConfig(settings?.modelKey);
  const extraBody = typeof modelConfig.buildExtraBody === 'function'
    ? modelConfig.buildExtraBody(settings)
    : undefined;
  try {
    const enabledTools = Array.isArray(settings?.toolSchemas) ? settings.toolSchemas : TOOL_SCHEMAS;
    const payload = {
      model: modelConfig.model,
      messages,
      max_tokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
      top_p: modelConfig.topP,
      stream: false,
    };
    if (enabledTools.length > 0) {
      payload.tools = enabledTools;
      payload.tool_choice = 'auto';
    }
    if (extraBody) payload.extra_body = extraBody;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(createTimeoutError('AI request timed out after 60 seconds with no response.')), AI_REQUEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        aiClient.chat.completions.create(payload),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (error) {
    const status = error?.status ?? error?.code ?? undefined;
    const apiBody = error?.error ? JSON.stringify(error.error) : '';
    throw Object.assign(new Error(`NVIDIA API error${status ? ` ${status}` : ''}: ${error.message}`), { status, body: apiBody });
  }
}

/**
 * Run the NVIDIA safety classifier against prompt/response content.
 * @param {{prompt:string,response:string|null}} input
 * @returns {Promise<ReturnType<typeof parseSafetyOutput>>}
 */
async function runSafetyFilter(input) {
  const userPrompt = String(input?.prompt ?? '').trim();
  const assistantResponse = input?.response == null ? null : String(input.response).trim();
  const classifierPrompt = buildSafetyClassifierPrompt(userPrompt, assistantResponse);

  const payload = {
    model: SAFETY_MODEL,
    messages: [
      { role: 'user', content: classifierPrompt },
    ],
    temperature: 0,
    top_p: 1,
    max_tokens: SAFETY_MAX_TOKENS,
    stream: false,
  };

  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = createTimeoutError('Safety filter request timed out after 60 seconds with no response.');
        timeoutError.isSafetyTimeout = true;
        reject(timeoutError);
      }, AI_REQUEST_TIMEOUT_MS);
    });
    const data = await Promise.race([
      aiClient.chat.completions.create(payload),
      timeoutPromise,
    ]);
    const raw = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!raw) throw new Error('Safety filter returned an empty response.');
    return parseSafetyOutput(raw);
  } catch (error) {
    if (error?.isSafetyTimeout) throw error;
    const status = error?.status ?? error?.code ?? undefined;
    const apiBody = error?.error ? JSON.stringify(error.error) : '';
    const context = status ? `Safety filter API error ${status}` : 'Safety filter request failed';
    throw Object.assign(new Error(`${context}: ${error?.message ?? 'Unknown error'}`), { status, body: apiBody });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
    warn_member: `**Warn member** \`${args.user_id ?? args.user_query ?? 'unknown'}\`${args.reason ? `\nReason: ${args.reason}` : ''}`,
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
        i.user.id === interaction.user.id,
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
  const footerText = data.footer ? truncate(stripCodeMarkup(stripThinkBlocks(String(data.footer))), FOOTER_MAX) : null;
  const rawTitle = data.title ? truncate(stripCodeMarkup(stripThinkBlocks(String(data.title))), 256) : null;
  const normalizedTitle = rawTitle ? rawTitle.trim().toLowerCase() : '';
  const normalizedAuthorName = authorName.trim().toLowerCase();
  const isTitleValid = Boolean(
    normalizedTitle
    && normalizedTitle !== AI_MODEL_LABEL_LOWER
    && normalizedTitle !== normalizedAuthorName,
  );
  const title = isTitleValid ? rawTitle : null;
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
    userSelectMenus: Array.isArray(data.user_select_menus) ? data.user_select_menus : [],
    channelSelectMenus: Array.isArray(data.channel_select_menus) ? data.channel_select_menus : [],
    modalButtons: Array.isArray(data.modal_buttons) ? data.modal_buttons : [],
  };
}

/**
 * Build paginated output embeds and AI-defined interactive rows.
 * @param {string} rawContent
 * @param {{showThinking?:boolean,thinkingText?:string,showPrompt?:boolean,promptText?:string,modelKey?:string,safetyEnabled?:boolean}} [options]
 * @returns {{outputEmbeds:EmbedBuilder[],linkButtons:Array,uiRows:Array<ActionRowBuilder>,uiState:object}}
 */
function buildFinalOutput(rawContent, options = {}) {
  const parsed = parseAiOutput(rawContent);
  const description = parsed.description;
  const modelConfig = getModelConfig(options.modelKey);
  const safetyState = options.safetyEnabled === false ? 'OFF' : 'ON';
  const runtimeFooter = `Model: ${modelConfig.label} • Safety: ${safetyState}`;
  const chunks = chunkText(description, DESC_MAX);
  const outputEmbeds = chunks.map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(parsed.color)
      .setDescription(chunk || NO_RESPONSE_TEXT)
      .setTimestamp();
    if (parsed.title) embed.setTitle(parsed.title);
    embed.setAuthor({ name: parsed.authorName, iconURL: parsed.authorIconUrl });
    if (parsed.footerText || chunks.length > 1 || runtimeFooter) {
      const base = parsed.footerText ? `${parsed.footerText}` : '';
      const page = chunks.length > 1 ? `Page ${index + 1}/${chunks.length}` : '';
      const footer = truncate([base, runtimeFooter, page].filter(Boolean).join(' • '), FOOTER_MAX);
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
    const seenValues = new Set();
    for (const option of menu.options.slice(0, 25)) {
      if (!option?.label || !option?.value) continue;
      const value = truncate(String(option.value).trim(), SELECT_OPTION_MAX);
      if (!value || seenValues.has(value)) continue;
      seenValues.add(value);
      const label = truncate(stripCodeMarkup(String(option.label).trim()), SELECT_OPTION_MAX);
      if (!label) continue;
      options.push({
        label,
        value,
        description: option.description ? truncate(stripCodeMarkup(String(option.description)), 100) : undefined,
        default: Boolean(option.default),
      });
    }
    if (options.length === 0) continue;
    const minValues = Math.min(options.length, Math.max(1, menu.min_values ?? 1));
    const maxValues = Math.min(options.length, Math.max(minValues, menu.max_values ?? minValues));
    uiState.selects[customId] = { id: sanitizeId(menu.id, `menu_${i + 1}`), type: 'string' };
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

  for (let i = 0; i < parsed.userSelectMenus.length; i++) {
    const menu = parsed.userSelectMenus[i];
    const customId = `${AI_UI_SELECT_PREFIX}${sanitizeId(menu.id, `user_menu_${i + 1}`)}`;
    const minValues = Math.min(25, Math.max(1, Number.parseInt(menu.min_values, 10) || 1));
    const maxValues = Math.min(25, Math.max(minValues, Number.parseInt(menu.max_values, 10) || minValues));
    uiState.selects[customId] = { id: sanitizeId(menu.id, `user_menu_${i + 1}`), type: 'user' };
    uiRows.push(
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(truncate(String(menu.placeholder ?? 'Select user(s)'), 150))
          .setMinValues(minValues)
          .setMaxValues(maxValues),
      ),
    );
  }

  for (let i = 0; i < parsed.channelSelectMenus.length; i++) {
    const menu = parsed.channelSelectMenus[i];
    const customId = `${AI_UI_SELECT_PREFIX}${sanitizeId(menu.id, `channel_menu_${i + 1}`)}`;
    const minValues = Math.min(25, Math.max(1, Number.parseInt(menu.min_values, 10) || 1));
    const maxValues = Math.min(25, Math.max(minValues, Number.parseInt(menu.max_values, 10) || minValues));
    const channelTypes = Array.isArray(menu.channel_types)
      ? menu.channel_types
        .map((value) => CHANNEL_TYPE_MAP[String(value).toLowerCase()])
        .filter((value) => value != null)
      : [];
    uiState.selects[customId] = { id: sanitizeId(menu.id, `channel_menu_${i + 1}`), type: 'channel' };
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(truncate(String(menu.placeholder ?? 'Select channel(s)'), 150))
      .setMinValues(minValues)
      .setMaxValues(maxValues);
    if (channelTypes.length > 0) select.setChannelTypes(channelTypes);
    uiRows.push(new ActionRowBuilder().addComponents(select));
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
 * @param {{modelKey:string,showThinking:boolean,safetyEnabled:boolean}} settings
 * @returns {EmbedBuilder}
 */
function buildReviewEmbed(stats, toolsUsed, settings) {
  const modelConfig = getModelConfig(settings?.modelKey);
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
      { name: 'Runtime Model', value: modelConfig.model, inline: false },
      { name: 'Model Preset', value: modelConfig.label, inline: true },
      { name: 'Thinking Delivery', value: 'Hidden (ephemeral)', inline: true },
      { name: 'Safety Guardrails', value: settings?.safetyEnabled === false ? 'Disabled' : 'Enabled', inline: true },
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
    return session.turns[getSafeTurnIndex(session)];
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
 * Clamp the active turn index.
 * @param {object} session
 * @returns {number}
 */
function getSafeTurnIndex(session) {
  const turnCount = Array.isArray(session?.turns) && session.turns.length > 0 ? session.turns.length : 1;
  const turnIndex = Number.isInteger(session?.turnIndex) ? session.turnIndex : 0;
  return Math.min(Math.max(0, turnIndex), turnCount - 1);
}

/**
 * Build the persistent model selector row.
 * @param {string} selectedModelKey
 * @returns {ActionRowBuilder}
 */
function buildModelSelectRow(selectedModelKey) {
  const selectedConfig = getModelConfig(selectedModelKey);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(AI_MODEL_SELECT_ID)
    .setPlaceholder(`Model: ${selectedConfig.label}`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      AI_MODELS.map((model) => ({
        label: model.label,
        value: model.key,
        description: truncate(model.description, 100),
        emoji: { id: model.emojiId },
        default: model.key === selectedConfig.key,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Build the persistent safety mode selector row.
 * @param {boolean} safetyEnabled
 * @returns {ActionRowBuilder}
 */
function buildSafetySelectRow(safetyEnabled) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(AI_SAFETY_SELECT_ID)
    .setPlaceholder(`Safety Guardrails: ${safetyEnabled === false ? 'Disabled' : 'Enabled'}`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      {
        label: 'Safety On (default)',
        value: 'enabled',
        description: 'Use safety filtering and guardrails.',
        default: safetyEnabled !== false,
      },
      {
        label: 'Safety Off (unsafe)',
        value: 'disabled',
        description: 'Skips safety filtering and relaxes guardrails (kick/ban still blocked).',
        default: safetyEnabled === false,
      },
    );
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Re-render stored turns based on current view/settings state.
 * @param {object} session
 */
function rerenderTurnsForDisplay(session) {
  if (!Array.isArray(session.turns)) return;
  for (const turn of session.turns) {
    if (typeof turn.rawContent !== 'string') continue;
    const rendered = buildFinalOutput(turn.rawContent, {
      showThinking: session.showThinking,
      thinkingText: turn.thinkingText,
      showPrompt: session.showPrompt,
      promptText: turn.promptText,
      modelKey: session.modelKey,
      safetyEnabled: session.safetyEnabled,
    });
    turn.outputEmbeds = rendered.outputEmbeds;
    turn.linkButtons = rendered.linkButtons;
    turn.uiRows = rendered.uiRows;
    turn.uiState = rendered.uiState;
    turn.pageIndex = Math.min(turn.pageIndex ?? 0, Math.max(0, rendered.outputEmbeds.length - 1));
  }
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
  const turnIndex = getSafeTurnIndex(session);
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
    new ButtonBuilder()
      .setCustomId(AI_TOGGLE_PROMPT_BUTTON_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Show Prompt'),
    new ButtonBuilder()
      .setCustomId(AI_TOGGLE_THINKING_BUTTON_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('View Thinking'),
  );
  rows.push(controls);

  if (turnCount > 1 && rows.length < 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
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
      ),
    );
  }

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

  if (mode === 'review' && rows.length < 5) {
    rows.push(buildModelSelectRow(session.modelKey));
  }
  if (mode === 'review' && rows.length < 5 && canToggleAiSafety(session.allowedUserId)) {
    rows.push(buildSafetySelectRow(session.safetyEnabled));
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
 * @param {{modelKey:string,showThinking:boolean,safetyEnabled:boolean}} settings
 * @returns {Promise<{outputEmbeds:EmbedBuilder[],reviewEmbed:EmbedBuilder,linkButtons:Array,uiRows:Array<ActionRowBuilder>,uiState:object,rawContent:string,thinkingText:string,promptText:string}>}
 */
async function runAiTurn(interaction, replyMsg, messages, toolsUsed, settings) {
  const requestStartMs = Date.now();
  let ttftMs = null;
  let promptTokens = null;
  let completionTokens = null;
  const latestUserMessage = getLatestUserMessage(messages);
  const safetyEnabled = settings?.safetyEnabled !== false;
  if (safetyEnabled && latestUserMessage) {
    const promptSafety = await runSafetyFilter({ prompt: latestUserMessage, response: null });
    if (isHarmfulLabel(promptSafety.promptHarm)) {
      const blockedRawContent = buildSafetyBlockedRawContent(promptSafety, 'prompt');
      const { outputEmbeds, linkButtons, uiRows, uiState } = buildFinalOutput(blockedRawContent, {
        showPrompt: settings?.showPrompt,
        promptText: latestUserMessage,
        modelKey: settings?.modelKey,
        safetyEnabled,
      });
      const reviewEmbed = buildReviewEmbed(
        {
          ttftMs: null,
          totalMs: Date.now() - requestStartMs,
          iterations: 0,
          promptTokens: null,
          completionTokens: null,
        },
        toolsUsed,
        settings,
      );
      return {
        outputEmbeds,
        reviewEmbed,
        linkButtons,
        uiRows,
        uiState,
        rawContent: blockedRawContent,
        thinkingText: '',
        promptText: latestUserMessage,
      };
    }
  }

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
      apiData = await callNvidiaApi(messages, settings);
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
    const iterationCount = iteration + 1;
    if (!toolCalls || toolCalls.length === 0) {
      const content = assistantMessage.content ?? '';
      if (safetyEnabled) {
        const responseSafety = await runSafetyFilter({ prompt: latestUserMessage, response: content });
        if (isHarmfulLabel(responseSafety.responseHarm)) {
          const blockedRawContent = buildSafetyBlockedRawContent(responseSafety, 'response');
          messages.push({
            role: 'assistant',
            content: `Safety filter blocked a prior assistant response (rule: ${sanitizeSafetyText(responseSafety.responseRule, 80)}, severity: ${sanitizeSafetyText(responseSafety.responseSeverity, 20)}, reason: ${sanitizeSafetyText(responseSafety.responseReason, 120)}).`,
          });
          const { outputEmbeds, linkButtons, uiRows, uiState } = buildFinalOutput(blockedRawContent, {
            showPrompt: settings?.showPrompt,
            promptText: latestUserMessage,
            modelKey: settings?.modelKey,
            safetyEnabled,
          });
          const reviewEmbed = buildReviewEmbed(
            {
              ttftMs,
              totalMs: Date.now() - requestStartMs,
              iterations: iterationCount,
              promptTokens,
              completionTokens,
            },
            toolsUsed,
            settings,
          );
          return {
            outputEmbeds,
            reviewEmbed,
            linkButtons,
            uiRows,
            uiState,
            rawContent: blockedRawContent,
            thinkingText: '',
            promptText: latestUserMessage,
          };
        }
      }
      messages.push({
        role: 'assistant',
        content,
      });
      const thinkingText = collectThinkingText(assistantMessage);
      const { outputEmbeds, linkButtons, uiRows, uiState } = buildFinalOutput(content, {
        showThinking: settings?.showThinking,
        thinkingText,
        showPrompt: settings?.showPrompt,
        promptText: latestUserMessage,
        modelKey: settings?.modelKey,
        safetyEnabled,
      });
      const reviewEmbed = buildReviewEmbed(
        {
          ttftMs,
          totalMs: Date.now() - requestStartMs,
          iterations: iterationCount,
          promptTokens,
          completionTokens,
        },
        toolsUsed,
        settings,
      );
      return {
        outputEmbeds,
        reviewEmbed,
        linkButtons,
        uiRows,
        uiState,
        rawContent: content,
        thinkingText,
        promptText: latestUserMessage,
      };
    }
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(toolCall.function?.arguments ?? '{}');
      } catch {
        toolArgs = {};
      }

      let toolResult;
      if (!safetyEnabled && (toolName === 'kick_member' || toolName === 'ban_member')) {
        toolResult = 'Unsafe mode still forbids kick_member and ban_member. Ask for an alternative action.';
        toolsUsed.push({ name: toolName, args: toolArgs, denied: true });
      } else
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
            toolResult = await executeTool(toolName, toolArgs, interaction, settings?.toolPermissions);
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
          toolResult = await executeTool(toolName, toolArgs, interaction, settings?.toolPermissions);
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

  const fallbackRawContent = JSON.stringify({ description: 'Maximum tool-call iterations reached. The AI could not produce a final response.' });
  const { outputEmbeds, linkButtons, uiRows, uiState } = buildFinalOutput(fallbackRawContent, {
    showPrompt: settings?.showPrompt,
    promptText: latestUserMessage,
    modelKey: settings?.modelKey,
    safetyEnabled,
  });
  const reviewEmbed = buildReviewEmbed(
    {
      ttftMs,
      totalMs: Date.now() - requestStartMs,
      iterations: MAX_ITERATIONS,
      promptTokens,
      completionTokens,
    },
    toolsUsed,
    settings,
  );
  return {
    outputEmbeds,
    reviewEmbed,
    linkButtons,
    uiRows,
    uiState,
    rawContent: fallbackRawContent,
    thinkingText: '',
    promptText: latestUserMessage,
  };
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
 * Send hidden embeds with codeblock-formatted text chunks.
 * @param {import('discord.js').MessageComponentInteraction} i
 * @param {string} title
 * @param {string} text
 * @param {string} emptyMessage
 * @returns {Promise<void>}
 */
async function sendHiddenCodeEmbeds(i, title, text, emptyMessage) {
  const chunks = chunkCodeBlockText(text);
  if (chunks.length === 0) {
    await i.reply({ content: emptyMessage, flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }
  await i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(chunks.length > 1 ? `${title} (1/${chunks.length})` : title)
        .setDescription(chunks[0])
        .setTimestamp(),
    ],
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
  for (let idx = 1; idx < chunks.length; idx++) {
    await i.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`${title} (${idx + 1}/${chunks.length})`)
          .setDescription(chunks[idx])
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  }
}

/**
 * Handle component interactions for a response message/session.
 * @param {import('discord.js').Message} replyMsg
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} session
 */
function attachReviewHandler(replyMsg, interaction, session) {
  const collector = replyMsg.createMessageComponentCollector({
    time: MAX_TIMEOUT_MS,
    filter: (i) => i.user.id === session.allowedUserId && i.customId.startsWith('ai_'),
  });

  async function runFollowUpTurn(status) {
    session.busy = true;
    refreshSessionSystemPrompt(session);
    await replyMsg.edit({ embeds: [buildProcessingEmbed(status)], components: [] }).catch(() => null);
    try {
      const result = await runAiTurn(interaction, replyMsg, session.messages, session.toolsUsed, {
        modelKey: session.modelKey,
        showThinking: session.showThinking,
        showPrompt: session.showPrompt,
        safetyEnabled: session.safetyEnabled,
        toolSchemas: session.toolSchemas,
        toolPermissions: session.toolPermissions,
      });
      session.turns.push({
        outputEmbeds: result.outputEmbeds,
        reviewEmbed: result.reviewEmbed,
        linkButtons: result.linkButtons,
        uiRows: result.uiRows,
        uiState: result.uiState,
        rawContent: result.rawContent,
        thinkingText: result.thinkingText,
        promptText: result.promptText,
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
  }

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
      const maxTurnIndex = Math.max(0, (Array.isArray(session.turns) ? session.turns.length : 1) - 1);
      session.turnIndex = Math.min(maxTurnIndex, session.turnIndex + 1);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      return;
    }
    if (i.customId === AI_TOGGLE_THINKING_BUTTON_ID) {
      const turn = getActiveTurn(session);
      const formatted = formatThinkingForHidden(turn.thinkingText);
      await sendHiddenCodeEmbeds(i, 'Thinking Output', formatted, 'No thinking output is available for this turn.');
      return;
    }
    if (i.customId === AI_TOGGLE_PROMPT_BUTTON_ID) {
      const turn = getActiveTurn(session);
      await sendHiddenCodeEmbeds(i, 'Prompt Sent To AI', String(turn.promptText ?? ''), 'No prompt text is available for this turn.');
      return;
    }
    if (i.customId === AI_MODEL_SELECT_ID) {
      const selectedModel = getModelConfig(i.values?.[0]).key;
      session.modelKey = selectedModel;
      setUserAiSettings(session.allowedUserId, {
        modelKey: session.modelKey,
        showThinking: session.showThinking,
        safetyEnabled: session.safetyEnabled,
      });
      rerenderTurnsForDisplay(session);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      await i.followUp({
        content: `Model updated to **${getModelConfig(session.modelKey).label}**. This selection is saved for your next /ai uses.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }
    if (i.customId === AI_SAFETY_SELECT_ID) {
      if (!canToggleAiSafety(session.allowedUserId)) {
        await i.reply({ content: 'You are not allowed to change AI safety guardrails.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }
      session.safetyEnabled = i.values?.[0] !== 'disabled';
      refreshSessionSystemPrompt(session);
      setUserAiSettings(session.allowedUserId, {
        modelKey: session.modelKey,
        showThinking: session.showThinking,
        safetyEnabled: session.safetyEnabled,
      });
      rerenderTurnsForDisplay(session);
      await i.update({ embeds: [getActiveEmbed(session)], components: buildFinalComponents(session) }).catch(() => null);
      await i.followUp({
        content: `Safety guardrails are now **${session.safetyEnabled ? 'enabled' : 'disabled'}** for your /ai sessions.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
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
      refreshSessionSystemPrompt(session);
      session.messages.push({ role: 'user', content: prompt });
      await replyMsg.edit({ embeds: [buildProcessingEmbed('Sending follow-up prompt to AI…')], components: [] }).catch(() => null);

      try {
        const result = await runAiTurn(interaction, replyMsg, session.messages, session.toolsUsed, {
          modelKey: session.modelKey,
          showThinking: session.showThinking,
          showPrompt: session.showPrompt,
          safetyEnabled: session.safetyEnabled,
          toolSchemas: session.toolSchemas,
          toolPermissions: session.toolPermissions,
        });
        session.turns.push({
          outputEmbeds: result.outputEmbeds,
          reviewEmbed: result.reviewEmbed,
          linkButtons: result.linkButtons,
          uiRows: result.uiRows,
          uiState: result.uiState,
          rawContent: result.rawContent,
          thinkingText: result.thinkingText,
          promptText: result.promptText,
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
      await i.deferUpdate().catch(() => null);
      await runFollowUpTurn(`Processing button \`${button.id}\`…`);
      return;
    }

    if (i.customId.startsWith(AI_UI_SELECT_PREFIX)) {
      const turn = getActiveTurn(session);
      const uiState = turn.uiState ?? { buttons: {}, selects: {}, modals: {} };
      const select = uiState.selects[i.customId];
      if (!select) return i.reply({ content: 'Select menu configuration is unavailable.', flags: MessageFlags.Ephemeral }).catch(() => null);
      const values = i.values?.join(', ') || 'none';
      session.messages.push({ role: 'user', content: `UI select used: ${select.id} -> ${values}` });
      await i.deferUpdate().catch(() => null);
      await runFollowUpTurn(`Processing selection \`${select.id}\`…`);
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
      await modalSubmit.deferUpdate().catch(() => null);
      await runFollowUpTurn(`Processing modal \`${modalDef.id}\`…`);
    }
  });

  collector.on('end', async (_, reason) => {
    AI_SESSIONS.delete(replyMsg.id);
    // Preserve visible controls for non-timeout endings; only hard-timeout tears them down.
    if (reason === 'time') {
      await replyMsg.edit({ components: [] }).catch(() => null);
    }
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
    .setDescription('[Dev] Send a prompt to Valley AI with Discord tools.')
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('Your prompt for the AI.')
        .setRequired(true),
    ),

  async execute(interaction) {
    // ── Auth check ────────────────────────────────────────────────────────────
    if (!canUseAiCommand(interaction.member, interaction.guild)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('Access Denied')
            .setDescription('You must be an allowed developer user or have the Valley AI role to use this command.')
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
    const userSettings = getUserAiSettings(interaction.user.id);
    const toolPermissions = getAiToolPermissions(interaction.member);
    const toolSchemas = getToolSchemasForPermissions(toolPermissions);
    const toolAccessPromptSuffix = buildToolAccessPromptSuffix(toolPermissions);
    const messages = [
      { role: 'system', content: buildSystemPrompt(userSettings.safetyEnabled, toolAccessPromptSuffix) },
      { role: 'user', content: prompt },
    ];
    const toolsUsed = [];
    let result;
    try {
      result = await runAiTurn(interaction, replyMsg, messages, toolsUsed, {
        ...userSettings,
        toolSchemas,
        toolPermissions,
      });
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
      modelKey: userSettings.modelKey,
      showThinking: userSettings.showThinking,
      safetyEnabled: userSettings.safetyEnabled,
      showPrompt: false,
      toolSchemas,
      toolPermissions,
      toolAccessPromptSuffix,
      turns: [{
        outputEmbeds: result.outputEmbeds,
        reviewEmbed: result.reviewEmbed,
        linkButtons: result.linkButtons,
        uiRows: result.uiRows,
        uiState: result.uiState,
        rawContent: result.rawContent,
        thinkingText: result.thinkingText,
        promptText: result.promptText,
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
