'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  userMention,
} = require('discord.js');
const db = require('./database');
const { ROLE_IDS } = require('./roles');

const ECONOMY_FILE = 'bake_economy.json';
const PASSIVE_CAP_MS = 24 * 60 * 60 * 1000;
const MARKET_LISTING_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MARKET_FEE_RATE = 0.05;
const BASE_GOLDEN_CHANCE = 0.03;
const DEFAULT_COOKIE_IMAGE = null;

const RARITY = {
  common: { id: 'common', name: 'Common', weight: 50, valueMultiplier: 1, color: 0xa3a3a3, emoji: '🍪' },
  uncommon: { id: 'uncommon', name: 'Uncommon', weight: 25, valueMultiplier: 3, color: 0x57f287, emoji: '🟩' },
  rare: { id: 'rare', name: 'Rare', weight: 13, valueMultiplier: 10, color: 0x5865f2, emoji: '🟦' },
  epic: { id: 'epic', name: 'Epic', weight: 7, valueMultiplier: 30, color: 0x9b59b6, emoji: '🟪' },
  legendary: { id: 'legendary', name: 'Legendary', weight: 3.5, valueMultiplier: 100, color: 0xfee75c, emoji: '🟨' },
  mythic: { id: 'mythic', name: 'Mythic', weight: 1, valueMultiplier: 500, color: 0xed4245, emoji: '🟥' },
  celestial: { id: 'celestial', name: 'Celestial', weight: 0.4, valueMultiplier: 2500, color: 0x111111, emoji: '⬛' },
  secret: { id: 'secret', name: '???', weight: 0.1, valueMultiplier: 10000, color: 0x2b2d31, emoji: '❓' },
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'secret'];
const RARITY_EMOJI_CANDIDATES = {
  common: ['common', 'cookie_common', 'bake_common', 'cc_common'],
  uncommon: ['uncommon', 'cookie_uncommon', 'bake_uncommon', 'cc_uncommon'],
  rare: ['rare', 'cookie_rare', 'bake_rare', 'cc_rare'],
  epic: ['epic', 'cookie_epic', 'bake_epic', 'cc_epic'],
  legendary: ['legendary', 'cookie_legendary', 'bake_legendary', 'cc_legendary'],
  mythic: ['mythic', 'cookie_mythic', 'bake_mythic', 'cc_mythic'],
  celestial: ['celestial', 'cookie_celestial', 'bake_celestial', 'cc_celestial'],
  secret: ['secret', 'cookie_secret', 'bake_secret', 'cc_secret'],
};

function normalizeEmojiName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

const STATIC_CUSTOM_EMOJIS_BY_CATEGORY = {
  upgrades: new Map([
    ['Fingers_crossed', '1492474335896666122'],
    ['Ladyfingers', '1492472620417941714'],
    ['Ritual_rolling_pins', '1492472343749071008'],
    ['Underworld_ovens', '1492472400657387630'],
    ['Gingerbread_trees', '1492472589698994276'],
    ['Ive_got_the_Midas_touch', '1492474459460993075'],
    ['Fortune_cookie', '1492472027695808572'],
    ['Golden_switch_off', '1492472122705055765'],
    ['Lucky_golden_clover', '1492472263583469628'],
    ['Golden_switch', '1492472120846848021'],
    ['Golden_cookie_sound', '1492472117315115008'],
    ['Kitten_helpers', '1492472253097578596'],
    ['Kitten_workers', '1492472260521492670'],
    ['Kitten_engineers', '1492472248140038166'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  cookies: new Map([
    ['Plain_cookies', '1492472701909205063'],
    ['Chocolate_chip_cookie', '1492471981273124915'],
    ['Oatmeal_raisin_cookies', '1492472677468737636'],
    ['Sugar_cookies', '1492472768304906291'],
    ['Butter_cookies', '1492472856389484636'],
    ['Shortbread_biscuits', '1492472742740623540'],
    ['Peanut_butter_cookies', '1492472690412490773'],
    ['Macadamia_nut_cookies', '1492472631952408618'],
    ['Maple_cookies', '1492472636066758766'],
    ['Cinnamon_cookies', '1492472535605055518'],
    ['Chocolate_oatmeal_cookies', '1492472529493950474'],
    ['Doublechip_cookies', '1492472560724738122'],
    ['Earl_Grey_cookies', '1492472564981829633'],
    ['French_pure_butter_cookies', '1492472582048448653'],
    ['Granola_cookies', '1492472599408676944'],
    ['Hazelnut_cookies', '1492472606245257297'],
    ['Icebox_cookies', '1492472613576900698'],
    ['Kolachy_cookies', '1492472618417258637'],
    ['Norwegian_cookies', '1492472675044556862'],
    ['Spritz_cookies', '1492472763040927795'],
    ['Caramel_cookies', '1492472510921310208'],
    ['Chocolate_macarons', '1492472528319418408'],
    ['Dalgona_cookies', '1492472552042532945'],
    ['Dragon_cookie', '1492472562314379484'],
    ['Eclipse_cookies', '1492472568437932132'],
    ['Frosted_sugar_cookies', '1492472583361400933'],
    ['Marshmallow_sandwich_cookies', '1492472639141187635'],
    ['Matcha_cookies', '1492472640718504026'],
    ['Ricotta_cookies', '1492472718166065153'],
    ['Ube_cookies', '1492472779952623696'],
    ['Ardent_heart_biscuits', '1492471802558152764'],
    ['Cosmic_chocolate_butter_biscuit', '1492472544446513172'],
    ['Dark_chocolate_butter_biscuit', '1492472553934032906'],
    ['Golden_heart_biscuits', '1492472595516358726'],
    ['Prism_heart_biscuits', '1492472704740364430'],
    ['Pure_heart_biscuits', '1492472709966332034'],
    ['Ruby_chocolate_butter_biscuit', '1492472733072756808'],
    ['White_chocolate_butter_biscuit', '1492472797119647805'],
    ['Raspberry_cheesecake_cookies', '1492472716102598756'],
    ['Zilla_wafers', '1492472811430744285'],
    ['Everybutter_biscuit', '1492472572451885116'],
    ['Eternal_heart_biscuits', '1492472571374076014'],
    ['Perforated_millefeuille_cosmos', '1492472303269970041'],
    ['Highdefinition_cookie', '1492472609990774884'],
    ['Flavor_text_cookie', '1492472578592477304'],
    ['Burnt_cookie', '1492472853168259173'],
    ['Birthday_cookie', '1492472832557322281'],
    ['PerfectCookie', '1492473120877973554'],
    ['GoldCookie', '1492473111914873014'],
    ['SpoopierCookie', '1492473129191342111'],
    ['Cookie_dough', '1492472541602775040'],
    ['Cookie_bars', '1492472539950088262'],
    ['Cookie_crumbs', '1492472540348809388'],
    ['Deepfried_cookie_dough', '1492472557587398847'],
    ['Cookie_egg', '1492471987799326861'],
    ['Faberge_egg', '1492472022188560525'],
    ['Century_egg', '1492471926138863807'],
    ['Golden_goose_egg', '1492472118451900477'],
    ['Dragon_egg', '1492471993281282091'],
    ['Cheated_cookies', '1492474178094370986'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  goldenCookies: new Map(),
  milk: new Map([
    ['Plain_milk', '1492472318126067722'],
    ['Banana_milk', '1492473599095865374'],
    ['Blueberry_milk', '1492473601427902557'],
    ['Caramel_milk', '1492473602669281381'],
    ['Chocolate_milk', '1492473605882122411'],
    ['Honey_milk', '1492473628690874408'],
    ['Lime_milk', '1492473652610859140'],
    ['Strawberry_milk', '1492473728066650272'],
    ['Vanilla_milk', '1492473730373517484'],
    ['Zebra_milk', '1492473732114026607'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
  achievements: new Map(),
  buildings: new Map([
    ['Alchemylab', '1492475165076881539'],
    ['Antim', '1492475165941039155'],
    ['Bank', '1492475168793038999'],
    ['Chancemaker', '1492475170336805016'],
    ['Cortex_Baker', '1492475171720790096'],
    ['Cursor_64px', '1492475174136840223'],
    ['Factory_new', '1492475175906840757'],
    ['Farm', '1492475177215201320'],
    ['Fractal_engine', '1492475181128487035'],
    ['Grandmas', '1492475182613528606'],
    ['Idleverse', '1492475186610438176'],
    ['Javascript_console', '1492475187894161449'],
    ['Mine_new', '1492475192365289513'],
    ['Portal_new', '1492475193619386400'],
    ['Prism', '1492475194718159000'],
    ['Shipment_new', '1492475197544988722'],
    ['Temple', '1492475198430253146'],
    ['Timemachine_new', '1492475203987574965'],
    ['Wizardtower', '1492475206785044480'],
    ['You', '1492475208261439549'],
  ].map(([name, id]) => [normalizeEmojiName(name), { name, id }])),
};

const STATIC_EMOJI_CATEGORY_PRIORITY = ['upgrades', 'cookies', 'goldenCookies', 'milk', 'achievements', 'buildings'];

const BUILDING_EMOJI_ALIASES = {
  cursor: ['Cursor_64px'],
  grandma: ['Grandmas'],
  farm: ['Farm'],
  mine: ['Mine_new'],
  factory: ['Factory_new'],
  bank: ['Bank'],
  temple: ['Temple'],
  wizardTower: ['Wizardtower'],
  shipment: ['Shipment_new'],
  alchemyLab: ['Alchemylab'],
  portal: ['Portal_new'],
  timeMachine: ['Timemachine_new'],
  antimatterCondenser: ['Antim'],
  prism: ['Prism'],
  chancemaker: ['Chancemaker'],
  fractalEngine: ['Fractal_engine'],
  javascriptConsole: ['Javascript_console'],
  idleverse: ['Idleverse'],
  cortexBaker: ['Cortex_Baker'],
};

const ITEM_EMOJI_ALIASES = {};

const MILK_EMOJI_ALIASES = {
  plain: ['Plain_milk'],
  chocolate: ['Chocolate_milk'],
  strawberry: ['Strawberry_milk'],
  vanilla: ['Vanilla_milk'],
  honey: ['Honey_milk'],
  caramel: ['Caramel_milk'],
  banana: ['Banana_milk'],
  lime: ['Lime_milk'],
  blueberry: ['Blueberry_milk'],
  zebra: ['Zebra_milk'],
};

const TIER_UNLOCKS = {
  rare: (u) => u.totalBakes >= 500 || u.unlockedTiers.includes('rare'),
  epic: (u) => (u.totalBakes >= 2500 && getTotalBuildingsOwned(u) >= 10) || u.unlockedTiers.includes('epic'),
  legendary: (u) => (u.totalBakes >= 10000 && getTotalBuildingsOwned(u) >= 50) || u.unlockedTiers.includes('legendary'),
  mythic: (u) => (u.totalBakes >= 50000 && getTotalBuildingsOwned(u) >= 200 && u.milestones.length >= 5) || u.unlockedTiers.includes('mythic'),
  celestial: (u) => (u.totalBakes >= 250000 && getTotalBuildingsOwned(u) >= 500 && u.milestones.length >= 20) || u.unlockedTiers.includes('celestial'),
};

const BUILDINGS = [
  { id: 'cursor', name: 'Cursor', baseCost: 15, baseCps: 0.1, description: 'Autoclicks once every 10 seconds.' },
  { id: 'grandma', name: 'Grandma', baseCost: 100, baseCps: 1, description: 'A nice grandma to bake more cookies.' },
  { id: 'farm', name: 'Farm', baseCost: 1100, baseCps: 8, description: 'Grows cookie plants from cookie seeds.' },
  { id: 'mine', name: 'Mine', baseCost: 12000, baseCps: 47, description: 'Mines out cookie dough and chocolate chips.' },
  { id: 'factory', name: 'Factory', baseCost: 130000, baseCps: 260, description: 'Produces large quantities of cookies.' },
  { id: 'bank', name: 'Bank', baseCost: 1400000, baseCps: 1400, description: 'Generates cookies from interest.' },
  { id: 'temple', name: 'Temple', baseCost: 20000000, baseCps: 7800, description: 'Full of praying grandmas.' },
  { id: 'wizardTower', name: 'Wizard Tower', baseCost: 330000000, baseCps: 44000, description: 'Conjures cookies with magic spells.' },
  { id: 'shipment', name: 'Shipment', baseCost: 5100000000, baseCps: 260000, description: 'Brings in fresh cookies from the cookie planet.' },
  { id: 'alchemyLab', name: 'Alchemy Lab', baseCost: 75000000000, baseCps: 1600000, description: 'Turns gold into cookies.' },
  { id: 'portal', name: 'Portal', baseCost: 1000000000000, baseCps: 10000000, description: 'Opens a door to the Cookieverse.' },
  { id: 'timeMachine', name: 'Time Machine', baseCost: 14000000000000, baseCps: 65000000, description: 'Brings cookies from the past.' },
  { id: 'antimatterCondenser', name: 'Antimatter Condenser', baseCost: 170000000000000, baseCps: 430000000, description: 'Condenses antimatter into cookies.' },
  { id: 'prism', name: 'Prism', baseCost: 2100000000000000, baseCps: 2900000000, description: 'Converts light into cookies.' },
  { id: 'chancemaker', name: 'Chancemaker', baseCost: 26000000000000000, baseCps: 21000000000, description: 'Generates cookies from pure luck.' },
  { id: 'fractalEngine', name: 'Fractal Engine', baseCost: 310000000000000000, baseCps: 150000000000, description: 'Builds cookies from nested cookie dimensions.' },
  { id: 'javascriptConsole', name: 'Javascript Console', baseCost: 71000000000000000000, baseCps: 1100000000000, description: 'Creates cookies from the source code of the universe.' },
  { id: 'idleverse', name: 'Idleverse', baseCost: 12000000000000000000000, baseCps: 8300000000000, description: 'Hijacks idle universes for cookie production.' },
  { id: 'cortexBaker', name: 'Cortex Baker', baseCost: 1900000000000000000000000, baseCps: 64000000000000, description: 'A giant brain that thinks cookies into existence.' },
];

const BUILDING_MAP = new Map(BUILDINGS.map((b) => [b.id, b]));

const UPGRADES = [
  { id: 'fingers_crossed', name: 'Fingers Crossed', category: 'baking', cost: 100, effect: '+1 manual bake', unlockedWhen: (u) => u.totalBakes >= 25 },
  { id: 'ladyfingers', name: 'Ladyfingers', category: 'baking', cost: 500, effect: '+5 manual bake', unlockedWhen: (u) => u.totalBakes >= 250 },
  { id: 'ritual_rolling_pins', name: 'Ritual Rolling Pins', category: 'baking', cost: 5000, effect: '+1% of CPS to manual bake', unlockedWhen: (u) => getTotalBuildingsOwned(u) >= 10 },
  { id: 'underworld_ovens', name: 'Underworld Ovens', category: 'building', cost: 1000, effect: '2x Grandma CPS', buildingId: 'grandma', multiplier: 2, unlockedWhen: (u) => (u.buildings.grandma ?? 0) >= 1 },
  { id: 'gingerbread_trees', name: 'Gingerbread Trees', category: 'building', cost: 11000, effect: '2x Farm CPS', buildingId: 'farm', multiplier: 2, unlockedWhen: (u) => (u.buildings.farm ?? 0) >= 1 },
  { id: 'ive_got_the_midas_touch', name: "I've got the Midas touch", category: 'building', cost: 55000, effect: '2x Farm CPS', buildingId: 'farm', multiplier: 2, unlockedWhen: (u) => (u.buildings.farm ?? 0) >= 10 },
  { id: 'fortune_cookie', name: 'Fortune Cookie', category: 'global', cost: 125000, effect: '+10% CPS', globalMultiplier: 1.1, unlockedWhen: (u) => u.cookiesBakedAllTime >= 10000 },
  { id: 'golden_switch_off', name: 'Golden Switch Off', category: 'tier', cost: 45000, effect: 'Unlock Rare tier early', unlockTier: 'rare', unlockedWhen: (u) => u.totalBakes >= 100 },
  { id: 'lucky_golden_clover', name: 'Lucky Golden Clover', category: 'tier', cost: 500000, effect: 'Unlock Epic tier early', unlockTier: 'epic', unlockedWhen: (u) => u.totalBakes >= 1000 },
  { id: 'golden_switch', name: 'Golden Switch', category: 'golden', cost: 20000, effect: '+1% Golden Cookie chance', goldenChanceBonus: 0.01, unlockedWhen: (u) => u.goldenCookiesTriggered >= 3 },
  { id: 'golden_cookie_sound', name: 'Golden Cookie Sound', category: 'golden', cost: 250000, effect: '+5s Golden Cookie timer', goldenDurationBonusMs: 5000, unlockedWhen: (u) => u.goldenCookiesClaimed >= 10 },
  { id: 'kitten_helpers', name: 'Kitten Helpers', category: 'kitten', cost: 9000, effect: 'Milk gives +10% more CPS scaling', kittenScale: 0.1, unlockedWhen: (u) => u.milkLevel >= 100 },
  { id: 'kitten_workers', name: 'Kitten Workers', category: 'kitten', cost: 90000, effect: 'Milk gives +12% more CPS scaling', kittenScale: 0.12, unlockedWhen: (u) => u.milkLevel >= 200 },
  { id: 'kitten_engineers', name: 'Kitten Engineers', category: 'kitten', cost: 900000, effect: 'Milk gives +15% more CPS scaling', kittenScale: 0.15, unlockedWhen: (u) => u.milkLevel >= 300 },
];

const UPGRADE_MAP = new Map(UPGRADES.map((u) => [u.id, u]));

const MILK_TYPES = [
  { pct: 0, type: 'Plain Milk' },
  { pct: 100, type: 'Chocolate Milk' },
  { pct: 200, type: 'Strawberry Milk' },
  { pct: 300, type: 'Vanilla Milk' },
  { pct: 400, type: 'Honey Milk' },
  { pct: 500, type: 'Caramel Milk' },
  { pct: 600, type: 'Banana Milk' },
  { pct: 700, type: 'Lime Milk' },
  { pct: 800, type: 'Blueberry Milk' },
  { pct: 900, type: 'Zebra Milk' },
];

const ACHIEVEMENTS = [
  { id: 'baked_100', name: 'Warm-up Batch', desc: 'Bake 100 cookies.', check: (u) => u.cookiesBakedAllTime >= 100 },
  { id: 'baked_1k', name: 'Cookie Cadet', desc: 'Bake 1,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 1000 },
  { id: 'baked_10k', name: 'Dough Enthusiast', desc: 'Bake 10,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 10000 },
  { id: 'baked_100k', name: 'Factory Fresh', desc: 'Bake 100,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 100000 },
  { id: 'baked_1m', name: 'Crumbocalypse', desc: 'Bake 1,000,000 cookies.', check: (u) => u.cookiesBakedAllTime >= 1000000 },
  { id: 'spend_10k', name: 'Retail Therapy', desc: 'Spend 10,000 cookies.', check: (u) => u.cookiesSpent >= 10000 },
  { id: 'spend_100k', name: 'Cookie Investor', desc: 'Spend 100,000 cookies.', check: (u) => u.cookiesSpent >= 100000 },
  { id: 'spend_1m', name: 'Big Dough Energy', desc: 'Spend 1,000,000 cookies.', check: (u) => u.cookiesSpent >= 1000000 },
  { id: 'rare_first', name: 'Blue Crumb', desc: 'Bake your first Rare item.', check: (u) => !!u.firstTierBakes.rare },
  { id: 'epic_first', name: 'Purple Bite', desc: 'Bake your first Epic item.', check: (u) => !!u.firstTierBakes.epic },
  { id: 'legendary_first', name: 'Golden Crunch', desc: 'Bake your first Legendary item.', check: (u) => !!u.firstTierBakes.legendary },
  { id: 'mythic_first', name: 'Red Revelation', desc: 'Bake your first Mythic item.', check: (u) => !!u.firstTierBakes.mythic },
  { id: 'celestial_first', name: 'Star Oven', desc: 'Bake your first Celestial item.', check: (u) => !!u.firstTierBakes.celestial },
  { id: 'discover_10', name: 'Sampler Plate', desc: 'Discover 10 unique items.', check: (u) => u.uniqueItemsDiscovered.length >= 10 },
  { id: 'discover_25', name: 'Collector-ish', desc: 'Discover 25 unique items.', check: (u) => u.uniqueItemsDiscovered.length >= 25 },
  { id: 'discover_50', name: 'Museum Curator', desc: 'Discover 50 unique items.', check: (u) => u.uniqueItemsDiscovered.length >= 50 },
  { id: 'discover_all', name: 'Completionist Crumbs', desc: 'Discover all public items.', check: (u) => u.uniqueItemsDiscovered.length >= ITEMS.filter((i) => i.rarity !== 'secret').length },
  { id: 'cps_100', name: 'Steam Oven', desc: 'Reach 100 CPS.', check: (u) => u.highestCps >= 100 },
  { id: 'cps_10k', name: 'Planetary Oven', desc: 'Reach 10,000 CPS.', check: (u) => u.highestCps >= 10000 },
  { id: 'cps_1m', name: 'Quantum Oven', desc: 'Reach 1,000,000 CPS.', check: (u) => u.highestCps >= 1000000 },
  { id: 'cps_1b', name: 'Reality Oven', desc: 'Reach 1,000,000,000 CPS.', check: (u) => u.highestCps >= 1000000000 },
  { id: 'market_10', name: 'Bazaar Rookie', desc: 'Complete 10 marketplace transactions.', check: (u) => (u.marketplaceBuys + u.marketplaceSells) >= 10 },
  { id: 'market_50', name: 'Market Mogul', desc: 'Complete 50 marketplace transactions.', check: (u) => (u.marketplaceBuys + u.marketplaceSells) >= 50 },
  { id: 'golden_10', name: 'Sun Chaser', desc: 'Trigger 10 Golden Cookies.', check: (u) => u.goldenCookiesTriggered >= 10 },
  { id: 'golden_50', name: 'Solar Addict', desc: 'Trigger 50 Golden Cookies.', check: (u) => u.goldenCookiesTriggered >= 50 },
  { id: 'bakery_named', name: 'Brand Identity', desc: 'Name your bakery.', check: (u) => u.bakeryName !== 'Unnamed Bakery' },
  { id: 'milk_1000', name: 'Dairy Singularity', desc: 'Reach 1,000% milk.', check: (u) => u.milkLevel >= 1000 },
  { id: 'one_of_each', name: 'Shopping Spree', desc: 'Own at least 1 of every building.', check: (u) => BUILDINGS.every((b) => (u.buildings[b.id] ?? 0) >= 1) },
  { id: 'single_50', name: 'Monobuild', desc: 'Own 50 of one building type.', check: (u) => BUILDINGS.some((b) => (u.buildings[b.id] ?? 0) >= 50) },
  { id: 'single_100', name: 'Monolith Bakery', desc: 'Own 100 of one building type.', check: (u) => BUILDINGS.some((b) => (u.buildings[b.id] ?? 0) >= 100) },
  { id: 'single_200', name: 'One Trick Tyrant', desc: 'Own 200 of one building type.', check: (u) => BUILDINGS.some((b) => (u.buildings[b.id] ?? 0) >= 200) },
];

function buildItem(name, rarity, baseValue, flavorText, image = null) {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return {
    id,
    name,
    rarity,
    baseValue,
    flavorText,
    image: image ?? DEFAULT_COOKIE_IMAGE,
  };
}

const ITEMS = [
  buildItem('Plain Cookies', 'common', 1, 'The classic baseline of every bakery.'),
  buildItem('Chocolate Chip Cookie', 'common', 2, 'A timeless cookie with reliable charm.'),
  buildItem('Oatmeal Raisin Cookies', 'common', 2, 'Surprisingly dependable and chewy.'),
  buildItem('Sugar Cookies', 'common', 2, 'Sweet geometry with sharp edges.'),
  buildItem('Butter Cookies', 'common', 2, 'Tiny buttery confidence boosters.'),
  buildItem('Shortbread Biscuits', 'common', 3, 'Crisp, rich, and snack-approved.'),
  buildItem('Peanut Butter Cookies', 'common', 3, 'Nutty comfort in circular form.'),
  buildItem('Macadamia Nut Cookies', 'common', 3, 'Crunchy status symbols.'),
  buildItem('Maple Cookies', 'common', 3, 'Syrupy warmth in cookie form.'),
  buildItem('Cinnamon Cookies', 'common', 3, 'Spiced and cozy.'),
  buildItem('Chocolate Oatmeal Cookies', 'uncommon', 4, 'A bolder oat-powered combo.'),
  buildItem('Doublechip Cookies', 'uncommon', 5, 'Double chips, double confidence.'),
  buildItem('Earl Grey Cookies', 'uncommon', 6, 'Tea-time elegance in crumbs.'),
  buildItem('French Pure Butter Cookies', 'uncommon', 6, 'Silky butter and crisp bite.'),
  buildItem('Granola Cookies', 'uncommon', 6, 'Crunch engineered for momentum.'),
  buildItem('Hazelnut Cookies', 'uncommon', 6, 'Nutty and refined.'),
  buildItem('Icebox Cookies', 'uncommon', 6, 'Cool-headed and consistent.'),
  buildItem('Kolachy Cookies', 'uncommon', 7, 'Jam-ready pastry precision.'),
  buildItem('Norwegian Cookies', 'uncommon', 7, 'Nordic snack excellence.'),
  buildItem('Spritz Cookies', 'uncommon', 8, 'Delicate loops with bite.'),
  buildItem('Caramel Cookies', 'rare', 10, 'Buttery caramel wrapped in crunch.'),
  buildItem('Chocolate Macarons', 'rare', 11, 'Elegant sugar architecture.'),
  buildItem('Dalgona Cookies', 'rare', 12, 'Sweet and sharply brittle.'),
  buildItem('Dragon Cookie', 'rare', 12, 'A legendary cookie with flair.'),
  buildItem('Eclipse Cookies', 'rare', 13, 'Dark and radiant at once.'),
  buildItem('Frosted Sugar Cookies', 'rare', 13, 'Colorful frosting perfection.'),
  buildItem('Marshmallow Sandwich Cookies', 'rare', 13, 'Soft center, serious crunch.'),
  buildItem('Matcha Cookies', 'rare', 13, 'Earthy and clean.'),
  buildItem('Ricotta Cookies', 'rare', 13, 'Rich, airy, and indulgent.'),
  buildItem('Ube Cookies', 'rare', 12, 'Vivid and sweetly unique.'),
  buildItem('Ardent Heart Biscuits', 'epic', 50, 'A blazing symbol of sugary devotion.'),
  buildItem('Cosmic Chocolate Butter Biscuit', 'epic', 40, 'Butter and cocoa from the stars.'),
  buildItem('Dark Chocolate Butter Biscuit', 'epic', 45, 'Smooth intensity in biscuit form.'),
  buildItem('Golden Heart Biscuits', 'epic', 60, 'Shiny, rich, and lucky.'),
  buildItem('Prism Heart Biscuits', 'epic', 55, 'Refracts flavor into color.'),
  buildItem('Pure Heart Biscuits', 'epic', 42, 'Clean sweetness, no compromise.'),
  buildItem('Ruby Chocolate Butter Biscuit', 'epic', 47, 'Gem-toned cocoa luxury.'),
  buildItem('White Chocolate Butter Biscuit', 'epic', 54, 'Sweet cream with buttery depth.'),
  buildItem('Raspberry Cheesecake Cookies', 'epic', 56, 'Dessert layered into one bite.'),
  buildItem('Zilla Wafers', 'epic', 50, 'Huge crunch energy.'),
  buildItem('Everybutter Biscuit', 'legendary', 100, 'Contains all known butter states.'),
  buildItem('Eternal Heart Biscuits', 'legendary', 120, 'A forever-snack from beyond time.'),
  buildItem('Perforated Millefeuille Cosmos', 'legendary', 130, 'Layered pastry at cosmic scale.'),
  buildItem('Highdefinition Cookie', 'legendary', 140, 'Rendered in impossible detail.'),
  buildItem('Flavor Text Cookie', 'legendary', 145, 'Self-aware and very descriptive.'),
  buildItem('Burnt Cookie', 'legendary', 150, 'Charred but weirdly powerful.'),
  buildItem('Birthday Cookie', 'legendary', 155, 'Confetti-grade sugar celebration.'),
  buildItem('PerfectCookie', 'legendary', 160, 'Mathematically flawless.'),
  buildItem('GoldCookie', 'legendary', 170, 'Pure gilded snack economics.'),
  buildItem('SpoopierCookie', 'legendary', 200, 'Unsettlingly delicious.'),
  buildItem('Cookie Dough', 'mythic', 450, 'Unbaked potential with immense value.'),
  buildItem('Cookie Bars', 'mythic', 500, 'Dense, rich, and highly tradable.'),
  buildItem('Cookie Crumbs', 'mythic', 550, 'Tiny fragments of big power.'),
  buildItem('Deepfried Cookie Dough', 'mythic', 600, 'Dangerously tasty and volatile.'),
  buildItem('Cookie Egg', 'mythic', 650, 'An impossible confection relic.'),
  buildItem('Faberge Egg', 'mythic', 700, 'Ornate, rare, and absurdly valuable.'),
  buildItem('Century Egg', 'celestial', 2500, 'A relic from an older bake cycle.'),
  buildItem('Golden Goose Egg', 'celestial', 3000, 'A luck-charged economy catalyst.'),
  buildItem('Dragon Egg', 'celestial', 3500, 'Holds ancient oven heat.'),
  buildItem('Cheated Cookies', 'secret', 10000, 'The ledger says this should not exist.'),
];

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]));

const THEMES = {
  classic: { label: 'Classic', color: 0x5865f2 },
  dark_chocolate: { label: 'Dark Chocolate', color: 0x3d2a1f },
  mint: { label: 'Mint', color: 0x2ecc71 },
  strawberry: { label: 'Strawberry', color: 0xff6fa8 },
  golden: { label: 'Golden', color: 0xffd166 },
  void: { label: 'Void', color: 0x2b2d31 },
};

const TITLES = [
  { id: 'cookie_novice', name: 'Cookie Novice', cost: 5000 },
  { id: 'dough_magnate', name: 'Dough Magnate', cost: 500000 },
  { id: 'the_one_who_bakes', name: 'The One Who Bakes', cost: 50000000 },
];

function getDefaultGuildState() {
  return {
    users: {},
    itemStats: {},
    marketplace: { listings: [], nextListingId: 1 },
    settings: {
      adminLogChannelId: null,
      adminModRoleId: ROLE_IDS.moderationAccess,
      goldenCookieDurationMs: 15000,
    },
  };
}

function getDefaultUserState(userId) {
  const buildings = {};
  for (const building of BUILDINGS) buildings[building.id] = 0;
  return {
    userId,
    bakeryName: 'Unnamed Bakery',
    bakeryTheme: 'classic',
    bakeryEmoji: '🍪',
    title: 'Cookie Novice',
    cookies: 0,
    cookiesBakedAllTime: 0,
    cookiesSpent: 0,
    totalBakes: 0,
    lastInteraction: Date.now(),
    buildings,
    upgrades: [],
    inventory: {},
    milestones: [],
    milkLevel: 0,
    uniqueItemsDiscovered: [],
    goldenCookiesTriggered: 0,
    goldenCookiesClaimed: 0,
    highestCps: 0,
    rarestItemId: null,
    unlockedTiers: [],
    activeBuffs: [],
    pendingGoldenCookie: null,
    firstTierBakes: {},
    marketplaceBuys: 0,
    marketplaceSells: 0,
    transactionHistory: [],
    consumedBoosts: [],
    clickFrenzyCharges: 0,
    clickFrenzyExpiresAt: 0,
    forceGoldenCookieOnNextBake: false,
  };
}

function readState() {
  return db.read(ECONOMY_FILE, {});
}

function writeState(data) {
  db.write(ECONOMY_FILE, data);
}

function getGuildState(data, guildId) {
  if (!data[guildId]) data[guildId] = getDefaultGuildState();
  return data[guildId];
}

function getUserState(guildState, userId) {
  if (!guildState.users[userId]) guildState.users[userId] = getDefaultUserState(userId);
  return guildState.users[userId];
}

function cleanMarketplace(guildState, now = Date.now()) {
  guildState.marketplace.listings = (guildState.marketplace.listings ?? []).filter((listing) =>
    (now - listing.listedAt) < MARKET_LISTING_LIFETIME_MS);
}

function getTotalBuildingsOwned(user) {
  return Object.values(user.buildings).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

function getUnlockedRarities(user, now = new Date()) {
  const unlocked = new Set(['common', 'uncommon']);
  for (const tier of ['rare', 'epic', 'legendary', 'mythic', 'celestial']) {
    if (TIER_UNLOCKS[tier](user)) unlocked.add(tier);
  }
  const isMidnightMinute = now.getUTCHours() === 0 && now.getUTCMinutes() === 0;
  if ((isMidnightMinute && user.totalBakes >= 7777) || user.uniqueItemsDiscovered.length >= 60) {
    unlocked.add('secret');
  }
  return unlocked;
}

function getRarityForItem(itemId) {
  return ITEM_MAP.get(itemId)?.rarity ?? 'common';
}

function compareRarity(itemA, itemB) {
  const a = RARITY_ORDER.indexOf(getRarityForItem(itemA));
  const b = RARITY_ORDER.indexOf(getRarityForItem(itemB));
  return a - b;
}

function getBuildingPrice(buildingId, owned, quantity = 1) {
  const building = BUILDING_MAP.get(buildingId);
  if (!building) return null;
  let total = 0;
  for (let i = 0; i < quantity; i += 1) {
    total += building.baseCost * (1.15 ** (owned + i));
  }
  return Math.ceil(total);
}

function hasUpgrade(user, upgradeId) {
  return user.upgrades.includes(upgradeId);
}

function getMilkType(milkPct) {
  let current = MILK_TYPES[0].type;
  for (const type of MILK_TYPES) {
    if (milkPct >= type.pct) current = type.type;
  }
  return current;
}

function getStaticCustomEmoji(candidates = []) {
  const normalizedCandidates = candidates.map(normalizeEmojiName).filter(Boolean);
  if (normalizedCandidates.length === 0) return null;
  for (const category of STATIC_EMOJI_CATEGORY_PRIORITY) {
    const categoryMap = STATIC_CUSTOM_EMOJIS_BY_CATEGORY[category];
    if (!categoryMap) continue;
    for (const candidate of normalizedCandidates) {
      const match = categoryMap.get(candidate);
      if (match) return match;
    }
  }
  return null;
}

function getCustomGuildEmoji(guild, candidates = []) {
  const cache = guild?.emojis?.cache;
  if (!cache || cache.size === 0) return null;
  const normalizedByName = new Map(cache.map((emoji) => [normalizeEmojiName(emoji.name), emoji]));
  const normalizedCandidates = candidates.map(normalizeEmojiName).filter(Boolean);
  if (normalizedCandidates.length === 0) return null;
  const matched = normalizedCandidates.map((name) => normalizedByName.get(name)).find(Boolean);
  if (matched) return `<${matched.animated ? 'a' : ''}:${matched.name}:${matched.id}>`;
  const staticMatch = getStaticCustomEmoji(normalizedCandidates);
  if (!staticMatch) return null;
  return `<:${staticMatch.name}:${staticMatch.id}>`;
}

function getCookieFallbackEmoji(guild) {
  return getCustomGuildEmoji(guild, ['plain_cookie', 'plain_cookies', 'cookie', 'cookies', 'cc_cookie']) ?? '🍪';
}

function getRarityEmoji(rarityId, guild) {
  const rarity = RARITY[rarityId];
  if (!rarity) return getCookieFallbackEmoji(guild);
  const customEmoji = getCustomGuildEmoji(guild, RARITY_EMOJI_CANDIDATES[rarityId] ?? [rarityId]);
  return customEmoji ?? rarity.emoji;
}

function getItemEmoji(itemOrId, guild) {
  const item = typeof itemOrId === 'string' ? ITEM_MAP.get(itemOrId) : itemOrId;
  if (!item) return getCookieFallbackEmoji(guild);
  const customEmoji = getCustomGuildEmoji(guild, [
    item.id,
    item.name,
    `cookie_${item.id}`,
    `${item.id}_cookie`,
    `cc_${item.id}`,
    ...(ITEM_EMOJI_ALIASES[item.id] ?? []),
  ]);
  return customEmoji ?? getRarityEmoji(item.rarity, guild);
}

function computeCps(user, nowTs = Date.now()) {
  let buildingCps = 0;
  for (const building of BUILDINGS) {
    const owned = user.buildings[building.id] ?? 0;
    let multiplier = 1;
    for (const upgradeId of user.upgrades) {
      const upgrade = UPGRADE_MAP.get(upgradeId);
      if (upgrade?.buildingId === building.id && typeof upgrade.multiplier === 'number') {
        multiplier *= upgrade.multiplier;
      }
    }
    for (const buff of user.activeBuffs) {
      if (buff.type === 'buildingSpecial' && buff.buildingId === building.id && buff.expiresAt > nowTs) {
        multiplier *= 2;
      }
    }
    buildingCps += owned * building.baseCps * multiplier;
  }

  let globalMultiplier = 1;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.globalMultiplier) globalMultiplier *= upgrade.globalMultiplier;
  }

  const milkLevel = user.milestones.length * 4;
  user.milkLevel = milkLevel;
  let kittenBonus = 0;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.kittenScale) kittenBonus += (milkLevel / 100) * upgrade.kittenScale;
  }

  const consumedBonus = (user.consumedBoosts ?? [])
    .filter((boost) => boost.expiresAt > nowTs)
    .reduce((sum, boost) => sum + boost.cpsBonus, 0);
  user.consumedBoosts = (user.consumedBoosts ?? []).filter((boost) => boost.expiresAt > nowTs);

  const frenzy = (user.activeBuffs ?? []).find((buff) => buff.type === 'frenzy' && buff.expiresAt > nowTs);
  const frenzyMultiplier = frenzy ? 7 : 1;

  const total = (buildingCps + consumedBonus) * globalMultiplier * (1 + kittenBonus) * frenzyMultiplier;
  user.highestCps = Math.max(user.highestCps ?? 0, total);
  return total;
}

function applyPassiveIncome(user, nowTs = Date.now()) {
  const elapsed = Math.min(Math.max(0, nowTs - (user.lastInteraction ?? nowTs)), PASSIVE_CAP_MS);
  const cps = computeCps(user, nowTs);
  const gained = Math.floor((elapsed / 1000) * cps);
  if (gained > 0) {
    user.cookies += gained;
    user.cookiesBakedAllTime += gained;
  }
  user.lastInteraction = nowTs;
  user.activeBuffs = (user.activeBuffs ?? []).filter((buff) => buff.expiresAt > nowTs);
  return { elapsedMs: elapsed, gained, cps };
}

function weightedPickItem(user, nowDate = new Date()) {
  const unlocked = getUnlockedRarities(user, nowDate);
  const availableItems = ITEMS.filter((item) => unlocked.has(item.rarity));
  const rarityWeights = RARITY_ORDER
    .filter((rarity) => unlocked.has(rarity))
    .map((rarity) => ({ rarity, weight: RARITY[rarity].weight }));
  const totalWeight = rarityWeights.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedRarity = 'common';
  for (const entry of rarityWeights) {
    roll -= entry.weight;
    if (roll <= 0) {
      selectedRarity = entry.rarity;
      break;
    }
  }
  const pool = availableItems.filter((item) => item.rarity === selectedRarity);
  return pool[Math.floor(Math.random() * pool.length)] ?? availableItems[0];
}

function getManualBakeYield(user, nowTs = Date.now()) {
  let base = 1;
  if (hasUpgrade(user, 'fingers_crossed')) base += 1;
  if (hasUpgrade(user, 'ladyfingers')) base += 5;
  if (hasUpgrade(user, 'ritual_rolling_pins')) base += Math.floor(computeCps(user, nowTs) * 0.01);
  if (user.clickFrenzyCharges > 0 && user.clickFrenzyExpiresAt > nowTs) {
    user.clickFrenzyCharges -= 1;
    base *= 777;
    if (user.clickFrenzyCharges <= 0) user.clickFrenzyExpiresAt = 0;
  }
  return Math.max(1, Math.floor(base));
}

function registerItemBake(guildState, user, item, userId) {
  if (!guildState.itemStats[item.id]) {
    guildState.itemStats[item.id] = {
      itemId: item.id,
      rarity: item.rarity,
      baseValue: item.baseValue,
      totalInCirculation: 0,
      firstBakedBy: userId,
    };
  }
  guildState.itemStats[item.id].totalInCirculation += 1;
  if (!user.uniqueItemsDiscovered.includes(item.id)) user.uniqueItemsDiscovered.push(item.id);
  user.inventory[item.id] = (user.inventory[item.id] ?? 0) + 1;
  user.firstTierBakes[item.rarity] = true;
  if (!user.rarestItemId || compareRarity(user.rarestItemId, item.id) < 0) user.rarestItemId = item.id;
}

function evaluateAchievements(user) {
  const newlyEarned = [];
  const earned = new Set(user.milestones);
  for (const achievement of ACHIEVEMENTS) {
    if (!earned.has(achievement.id) && achievement.check(user)) {
      user.milestones.push(achievement.id);
      newlyEarned.push(achievement);
    }
  }
  user.milkLevel = user.milestones.length * 4;
  return newlyEarned;
}

function getGoldenChance(user) {
  let chance = BASE_GOLDEN_CHANCE;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.goldenChanceBonus) chance += upgrade.goldenChanceBonus;
  }
  return chance;
}

function createGoldenCookieState(user, settings, nowTs = Date.now()) {
  let durationMs = settings.goldenCookieDurationMs ?? 15000;
  for (const upgradeId of user.upgrades) {
    const upgrade = UPGRADE_MAP.get(upgradeId);
    if (upgrade?.goldenDurationBonusMs) durationMs += upgrade.goldenDurationBonusMs;
  }
  const token = `${nowTs}_${Math.floor(Math.random() * 1e7)}`;
  user.pendingGoldenCookie = { token, expiresAt: nowTs + durationMs, triggeredAt: nowTs };
  user.goldenCookiesTriggered += 1;
  return user.pendingGoldenCookie;
}

function bake(guildId, userId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const user = getUserState(guildState, userId);
  const nowTs = Date.now();
  const passive = applyPassiveIncome(user, nowTs);

  if (user.pendingGoldenCookie?.expiresAt <= nowTs) user.pendingGoldenCookie = null;

  const yieldAmount = getManualBakeYield(user, nowTs);
  user.cookies += yieldAmount;
  user.cookiesBakedAllTime += yieldAmount;
  user.totalBakes += 1;

  const item = weightedPickItem(user, new Date(nowTs));
  registerItemBake(guildState, user, item, userId);

  let golden = null;
  const forceGolden = user.forceGoldenCookieOnNextBake;
  user.forceGoldenCookieOnNextBake = false;
  if (forceGolden || Math.random() < getGoldenChance(user)) {
    golden = createGoldenCookieState(user, guildState.settings, nowTs);
  }

  const newlyEarned = evaluateAchievements(user);
  writeState(data);
  return { user, item, passive, manualYield: yieldAmount, golden, newlyEarned };
}

function getUserSnapshot(guildId, userId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const user = getUserState(guildState, userId);
  const passive = applyPassiveIncome(user, Date.now());
  evaluateAchievements(user);
  writeState(data);
  return { data, guildState, user, passive };
}

function saveUserSnapshot(data) {
  writeState(data);
}

function toCookieNumber(num) {
  if (!Number.isFinite(num)) return '0';
  return Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

function progressBar(current, total, size = 12) {
  const ratio = total <= 0 ? 1 : Math.max(0, Math.min(1, current / total));
  const filled = Math.round(size * ratio);
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)} ${Math.round(ratio * 100)}%`;
}

function getThemeColor(theme) {
  return THEMES[theme]?.color ?? THEMES.classic.color;
}

function buildDashboardEmbed(guild, user, view = 'home', options = {}) {
  const cps = computeCps(user, Date.now());
  const totalItems = ITEMS.length;
  const discovered = user.uniqueItemsDiscovered.length;
  const titlePrefix = `${user.bakeryEmoji ?? '🍪'} ${user.bakeryName ?? 'Unnamed Bakery'}`;

  const embed = new EmbedBuilder()
    .setColor(getThemeColor(user.bakeryTheme))
    .setTitle(`${titlePrefix} • ${view.charAt(0).toUpperCase() + view.slice(1)}`)
    .setTimestamp();

  if (guild) {
    embed.setFooter({
      text: `${guild.name} • ${user.title ?? 'Cookie Novice'}`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }

  if (view === 'home') {
    embed.setDescription('The ovens roar. The crumbs whisper. The economy expands.');
    embed.addFields(
      { name: '🍪 Cookies', value: `**${toCookieNumber(user.cookies)}**`, inline: true },
      { name: '⚙️ CPS', value: `**${toCookieNumber(cps)}**`, inline: true },
      { name: '🥛 Milk', value: `**${toCookieNumber(user.milkLevel)}%** (${getMilkType(user.milkLevel)})`, inline: true },
      { name: '📚 Collection', value: `Discovered: **${discovered}/${totalItems}**`, inline: true },
      { name: '🏗️ Buildings', value: `Owned: **${toCookieNumber(getTotalBuildingsOwned(user))}**`, inline: true },
      { name: '🏆 Achievements', value: `**${user.milestones.length}/${ACHIEVEMENTS.length}**`, inline: true },
    );
  }

  if (view === 'stats') {
    embed.setDescription('Numbers. So many numbers. Delicious numbers.');
    embed.addFields(
      { name: 'Total bakes', value: toCookieNumber(user.totalBakes), inline: true },
      { name: 'Cookies baked (lifetime)', value: toCookieNumber(user.cookiesBakedAllTime), inline: true },
      { name: 'Cookies spent', value: toCookieNumber(user.cookiesSpent), inline: true },
      { name: 'Highest CPS', value: toCookieNumber(user.highestCps), inline: true },
      { name: 'Golden Cookies', value: `${toCookieNumber(user.goldenCookiesClaimed)}/${toCookieNumber(user.goldenCookiesTriggered)} claimed`, inline: true },
      { name: 'Marketplace tx', value: `${user.marketplaceBuys} buys • ${user.marketplaceSells} sells`, inline: true },
    );
    const rarest = user.rarestItemId ? ITEM_MAP.get(user.rarestItemId)?.name ?? 'Unknown' : 'None';
    embed.addFields({ name: 'Rarest baked item', value: rarest });
    if ((user.transactionHistory ?? []).length) {
      const history = user.transactionHistory.slice(-5).reverse().map((tx) =>
        `• ${tx.type.toUpperCase()} ${tx.quantity}x ${ITEM_MAP.get(tx.itemId)?.name ?? tx.itemId} for ${toCookieNumber(tx.price)} (${userMention(tx.counterparty)})`);
      embed.addFields({ name: 'Recent transactions', value: history.join('\n').slice(0, 1024) });
    }
  }

  if (view === 'inventory') {
    const rarityFilter = options.rarityFilter ?? 'all';
    const entries = Object.entries(user.inventory)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ item: ITEM_MAP.get(itemId), qty }))
      .filter((entry) => entry.item)
      .filter((entry) => rarityFilter === 'all' || entry.item.rarity === rarityFilter)
      .sort((a, b) => compareRarity(b.item.id, a.item.id) || (b.qty - a.qty));

    if (entries.length === 0) {
      embed.setDescription('Inventory currently empty. Keep baking, crumb warrior.');
    } else {
      const page = Math.max(0, Math.min(options.page ?? 0, Math.floor((entries.length - 1) / 8)));
      const pageEntries = entries.slice(page * 8, page * 8 + 8);
      embed.setDescription(pageEntries
        .map((entry) => `${getItemEmoji(entry.item, guild)} **${entry.item.name}** x${entry.qty} • value ${toCookieNumber(entry.item.baseValue * RARITY[entry.item.rarity].valueMultiplier)}`)
        .join('\n'));
      embed.addFields({
        name: 'Collection',
        value: `Discovered: **${user.uniqueItemsDiscovered.length}/${ITEMS.length}**`,
      });
      embed.setFooter({ text: `Page ${page + 1}/${Math.max(1, Math.ceil(entries.length / 8))}` });
    }
  }

  if (view === 'milk') {
    const currentType = getMilkType(user.milkLevel);
    const nextType = MILK_TYPES.find((type) => type.pct > user.milkLevel);
    const start = [...MILK_TYPES].reverse().find((type) => type.pct <= user.milkLevel)?.pct ?? 0;
    const target = nextType?.pct ?? (user.milkLevel || 1);
    const milkKey = currentType.toLowerCase().replace(/\s*milk$/, '');
    const milkEmoji = getCustomGuildEmoji(guild, MILK_EMOJI_ALIASES[milkKey] ?? []) ?? '🥛';
    embed.setDescription(`Current milk: ${milkEmoji} **${currentType}**`);
    embed.addFields(
      { name: 'Milk level', value: `${toCookieNumber(user.milkLevel)}%`, inline: true },
      { name: 'Achievements', value: `${user.milestones.length}/${ACHIEVEMENTS.length}`, inline: true },
      { name: 'Progress', value: progressBar(user.milkLevel - start, Math.max(1, target - start)) },
    );
    if (nextType) embed.addFields({ name: 'Next milk type', value: `${nextType.type} at ${nextType.pct}%` });
  }

  if (view === 'achievements') {
    const earned = new Set(user.milestones);
    const lastEarned = user.milestones.length
      ? ACHIEVEMENTS.find((a) => a.id === user.milestones[user.milestones.length - 1])
      : null;
    const spotlight = lastEarned ?? ACHIEVEMENTS.find((a) => !earned.has(a.id)) ?? ACHIEVEMENTS[0];
    embed.setDescription('Milestones that feed your glorious milk pipeline.');
    const lines = ACHIEVEMENTS.slice(0, 20).map((a) => `${earned.has(a.id) ? '✅' : getCookieFallbackEmoji(guild)} **${a.name}** — ${a.desc}`);
    embed.addFields({ name: 'Achievement board', value: lines.join('\n').slice(0, 1024) });
    embed.addFields({ name: 'Progress', value: `${earned.size}/${ACHIEVEMENTS.length}` });
  }

  if (view === 'buildings') {
    const selected = BUILDING_MAP.get(options.buildingId ?? 'cursor') ?? BUILDINGS[0];
    const owned = user.buildings[selected.id] ?? 0;
    const buildingEmoji = getCustomGuildEmoji(guild, [
      selected.id,
      selected.name,
      `building_${selected.id}`,
      `cc_${selected.id}`,
      ...(BUILDING_EMOJI_ALIASES[selected.id] ?? []),
    ]) ?? getCookieFallbackEmoji(guild);
    embed.setDescription(`${buildingEmoji} ${selected.description}`);
    embed.addFields(
      { name: 'Owned', value: toCookieNumber(owned), inline: true },
      { name: 'Base CPS', value: toCookieNumber(selected.baseCps), inline: true },
      { name: 'Current CPS', value: toCookieNumber(selected.baseCps * owned), inline: true },
      { name: 'Buy x1', value: toCookieNumber(getBuildingPrice(selected.id, owned, 1)), inline: true },
      { name: 'Buy x10', value: toCookieNumber(getBuildingPrice(selected.id, owned, 10)), inline: true },
      { name: 'Buy x100', value: toCookieNumber(getBuildingPrice(selected.id, owned, 100)), inline: true },
    );
  }

  if (view === 'upgrades') {
    const selectedId = options.upgradeId ?? UPGRADES[0].id;
    const selected = UPGRADE_MAP.get(selectedId) ?? UPGRADES[0];
    const unlocked = selected.unlockedWhen(user);
    const purchased = user.upgrades.includes(selected.id);
    embed.setDescription(selected.effect);
    embed.addFields(
      { name: 'Category', value: selected.category, inline: true },
      { name: 'Cost', value: toCookieNumber(selected.cost), inline: true },
      { name: 'Status', value: purchased ? 'Purchased' : unlocked ? 'Unlocked' : 'Locked', inline: true },
    );
  }

  return embed;
}

function buildDashboardComponents(user, view = 'home', options = {}) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bakery_nav:home`).setLabel('Home').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bakery_nav:inventory`).setLabel('Inventory').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bakery_nav:buildings`).setLabel('Buildings').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bakery_nav:upgrades`).setLabel('Upgrades').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bakery_nav:stats`).setLabel('Stats').setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bakery_nav:milk`).setLabel('Milk').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bakery_nav:achievements`).setLabel('Achievements').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bakery_open_marketplace').setLabel('Marketplace').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bakery_set_name').setLabel('Set Bakery Name').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bakery_set_listing').setLabel('List Item').setStyle(ButtonStyle.Secondary),
    ),
  );

  if (view === 'inventory') {
    const raritySelect = new StringSelectMenuBuilder()
      .setCustomId(`bakery_inventory_filter:${options.page ?? 0}`)
      .setPlaceholder('Filter by rarity')
      .addOptions(
        { label: 'All rarities', value: 'all' },
        ...RARITY_ORDER.map((id) => ({ label: RARITY[id].name, value: id, emoji: getRarityEmoji(id, options.guild) })),
      );
    rows.push(new ActionRowBuilder().addComponents(raritySelect));

    const itemOptions = Object.entries(user.inventory)
      .filter(([, qty]) => qty > 0)
      .slice(0, 25)
      .map(([itemId, qty]) => ({
        label: `${ITEM_MAP.get(itemId)?.name ?? itemId}`.slice(0, 100),
        description: `Owned: ${qty}`,
        value: itemId,
        emoji: getItemEmoji(itemId, options.guild),
      }));
    if (itemOptions.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('bakery_inventory_item')
            .setPlaceholder('Pick an item to act on')
            .addOptions(itemOptions),
        ),
      );
    }
  }

  if (view === 'buildings') {
    const buildingMenu = new StringSelectMenuBuilder()
      .setCustomId('bakery_building_select')
      .setPlaceholder('Choose a building')
      .addOptions(BUILDINGS.slice(0, 25).map((b) => ({
        label: b.name,
        value: b.id,
        emoji: getCustomGuildEmoji(options.guild, [b.id, b.name, `building_${b.id}`, `cc_${b.id}`, ...(BUILDING_EMOJI_ALIASES[b.id] ?? [])]) ?? getCookieFallbackEmoji(options.guild),
      })));
    rows.push(new ActionRowBuilder().addComponents(buildingMenu));
    const selectedBuilding = options.buildingId ?? 'cursor';
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bakery_build_buy:${selectedBuilding}:1`).setLabel('Buy x1').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`bakery_build_buy:${selectedBuilding}:10`).setLabel('Buy x10').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`bakery_build_buy:${selectedBuilding}:100`).setLabel('Buy x100').setStyle(ButtonStyle.Success),
      ),
    );
  }

  if (view === 'upgrades') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('bakery_upgrade_select')
          .setPlaceholder('Choose an upgrade')
          .addOptions(UPGRADES.slice(0, 25).map((u) => ({
            label: u.name.slice(0, 100),
            value: u.id,
            emoji: getCustomGuildEmoji(options.guild, [u.id, `upgrade_${u.id}`, `cc_${u.id}`, u.buildingId, ...(BUILDING_EMOJI_ALIASES[u.buildingId] ?? [])].filter(Boolean)) ?? getCookieFallbackEmoji(options.guild),
          }))),
      ),
    );
    const selectedUpgrade = options.upgradeId ?? UPGRADES[0].id;
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bakery_upgrade_buy:${selectedUpgrade}`).setLabel('Buy Upgrade').setStyle(ButtonStyle.Success),
      ),
    );
  }
  return rows;
}

function pickGoldenReward(user) {
  const rewards = ['frenzy', 'lucky', 'clickFrenzy', 'cookieStorm', 'buildingSpecial', 'sweet'];
  return rewards[Math.floor(Math.random() * rewards.length)];
}

function claimGoldenCookie(guildId, userId, token) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const now = Date.now();
  const pending = user.pendingGoldenCookie;
  if (!pending || pending.token !== token) {
    return { ok: false, reason: 'This Golden Cookie fizzled out or was never yours.' };
  }
  if (pending.expiresAt < now) {
    user.pendingGoldenCookie = null;
    writeState(data);
    return { ok: false, reason: 'Too slow. The Golden Cookie evaporated while laughing at you.' };
  }

  const reward = pickGoldenReward(user);
  let description = '';

  if (reward === 'frenzy') {
    user.activeBuffs.push({ type: 'frenzy', multiplier: 7, expiresAt: now + 30000 });
    description = '⚡ **Frenzy!** Your CPS is x7 for 30 seconds.';
  } else if (reward === 'lucky') {
    const payout = Math.max(1000, Math.floor(user.cookies * 0.1));
    user.cookies += payout;
    user.cookiesBakedAllTime += payout;
    description = `💰 **Lucky!** You found **${toCookieNumber(payout)}** cookies in a suspicious couch cushion.`;
  } else if (reward === 'clickFrenzy') {
    user.clickFrenzyCharges = 3;
    user.clickFrenzyExpiresAt = now + 60000;
    description = '🖱️ **Click Frenzy!** Your next 3 `/bake` uses are x777 within 60 seconds.';
  } else if (reward === 'cookieStorm') {
    const drops = 3 + Math.floor(Math.random() * 3);
    const stormItems = [];
    for (let i = 0; i < drops; i += 1) {
      const item = weightedPickItem(user, new Date(now));
      registerItemBake(guildState, user, item, userId);
      stormItems.push(item.name);
    }
    description = `🌩️ **Cookie Storm!** Items rained down: ${stormItems.map((n) => `**${n}**`).join(', ')}.`;
  } else if (reward === 'buildingSpecial') {
    const owned = BUILDINGS.filter((building) => (user.buildings[building.id] ?? 0) > 0);
    if (owned.length) {
      const selected = owned[Math.floor(Math.random() * owned.length)];
      user.activeBuffs.push({ type: 'buildingSpecial', buildingId: selected.id, expiresAt: now + (10 * 60 * 1000) });
      description = `🏗️ **Building Special!** ${selected.name} CPS is doubled for 10 minutes.`;
    } else {
      description = '🏗️ The universe wanted a building special, but you own no buildings yet. It gave you existential dread instead.';
    }
  } else if (reward === 'sweet') {
    const candidates = ['rare', 'epic', 'legendary', 'mythic', 'celestial'].filter((tier) => !user.unlockedTiers.includes(tier));
    if (candidates.length) {
      const tier = candidates[Math.floor(Math.random() * candidates.length)];
      user.unlockedTiers.push(tier);
      description = `🍭 **Sweet!** You unlocked **${RARITY[tier].name}** tier early.`;
    } else {
      const fallback = 5000;
      user.cookies += fallback;
      user.cookiesBakedAllTime += fallback;
      description = `🍭 All tiers were already unlocked, so the cookie coughed up **${toCookieNumber(fallback)}** bonus cookies instead.`;
    }
  }

  user.pendingGoldenCookie = null;
  user.goldenCookiesClaimed += 1;
  evaluateAchievements(user);
  writeState(data);
  return { ok: true, reward, description, user };
}

function getListingDisplay(listing, guild) {
  const item = ITEM_MAP.get(listing.itemId);
  return `${item ? getItemEmoji(item, guild) : '🍪'} **${item?.name ?? listing.itemId}** x${listing.quantity} • ${toCookieNumber(listing.pricePerUnit)} each • Seller: <@${listing.sellerId}>`;
}

function getMarketplaceEmbed(guild, guildState, user, page = 0, rarityFilter = 'all') {
  cleanMarketplace(guildState);
  const listings = guildState.marketplace.listings
    .filter((listing) => listing.quantity > 0)
    .filter((listing) => rarityFilter === 'all' || ITEM_MAP.get(listing.itemId)?.rarity === rarityFilter);
  const pageCount = Math.max(1, Math.ceil(listings.length / 8));
  const pageIndex = Math.max(0, Math.min(page, pageCount - 1));
  const pageListings = listings.slice(pageIndex * 8, pageIndex * 8 + 8);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏪 Cookie Marketplace')
    .setDescription(pageListings.length
      ? pageListings.map((listing) => `\`${listing.id}\` • ${getListingDisplay(listing, guild)}`).join('\n')
      : 'No listings match that filter. The stalls are eerily quiet.')
    .setTimestamp();

  if (guild) {
    embed.setFooter({
      text: `${guild.name} • Page ${pageIndex + 1}/${pageCount} • Balance ${toCookieNumber(user.cookies)}`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }
  return { embed, pageIndex, pageCount, listingCount: listings.length };
}

function getMarketplaceComponents(guildState, page = 0, rarityFilter = 'all') {
  cleanMarketplace(guildState);
  const listings = guildState.marketplace.listings
    .filter((listing) => listing.quantity > 0)
    .filter((listing) => rarityFilter === 'all' || ITEM_MAP.get(listing.itemId)?.rarity === rarityFilter);
  const pageCount = Math.max(1, Math.ceil(listings.length / 8));
  const pageIndex = Math.max(0, Math.min(page, pageCount - 1));
  const pageListings = listings.slice(pageIndex * 8, pageIndex * 8 + 8);

  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`market_filter:${pageIndex}`)
        .setPlaceholder('Filter listings')
        .addOptions([{ label: 'All rarities', value: 'all' }, ...RARITY_ORDER.map((id) => ({ label: RARITY[id].name, value: id }))]),
    ),
  );

  if (pageListings.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('market_select_listing')
          .setPlaceholder('Choose a listing to buy')
          .addOptions(pageListings.map((listing) => ({
            label: `${ITEM_MAP.get(listing.itemId)?.name ?? listing.itemId} x${listing.quantity}`.slice(0, 100),
            description: `${toCookieNumber(listing.pricePerUnit)} each • by ${listing.sellerTag ?? listing.sellerId}`.slice(0, 100),
            value: String(listing.id),
          }))),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_prev:${pageIndex}:${rarityFilter}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex <= 0),
      new ButtonBuilder().setCustomId(`market_next:${pageIndex}:${rarityFilter}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex >= pageCount - 1),
      new ButtonBuilder().setCustomId('market_list_item').setLabel('List Item').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('market_my_listings').setLabel('My Listings').setStyle(ButtonStyle.Primary),
    ),
  );
  return rows;
}

function buyBuilding(guildId, userId, buildingId, quantity) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  applyPassiveIncome(user, Date.now());
  const owned = user.buildings[buildingId] ?? 0;
  const cost = getBuildingPrice(buildingId, owned, quantity);
  if (!cost || user.cookies < cost) return { ok: false, reason: `You need ${toCookieNumber(cost ?? 0)} cookies.` };
  user.cookies -= cost;
  user.cookiesSpent += cost;
  user.buildings[buildingId] = owned + quantity;
  const newlyEarned = evaluateAchievements(user);
  writeState(data);
  return { ok: true, cost, newlyEarned, user };
}

function buyUpgrade(guildId, userId, upgradeId) {
  const upgrade = UPGRADE_MAP.get(upgradeId);
  if (!upgrade) return { ok: false, reason: 'Unknown upgrade.' };
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  applyPassiveIncome(user, Date.now());
  if (user.upgrades.includes(upgradeId)) return { ok: false, reason: 'Already purchased.' };
  if (!upgrade.unlockedWhen(user)) return { ok: false, reason: 'That upgrade is still locked.' };
  if (user.cookies < upgrade.cost) return { ok: false, reason: `Need ${toCookieNumber(upgrade.cost)} cookies.` };
  user.cookies -= upgrade.cost;
  user.cookiesSpent += upgrade.cost;
  user.upgrades.push(upgradeId);
  if (upgrade.unlockTier && !user.unlockedTiers.includes(upgrade.unlockTier)) user.unlockedTiers.push(upgrade.unlockTier);
  const newlyEarned = evaluateAchievements(user);
  writeState(data);
  return { ok: true, upgrade, newlyEarned };
}

function sellInventoryItem(guildId, userId, itemId, sellAll = false) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const qty = user.inventory[itemId] ?? 0;
  if (qty <= 0) return { ok: false, reason: 'You do not own that item.' };
  const item = ITEM_MAP.get(itemId);
  if (!item) return { ok: false, reason: 'Unknown item.' };
  const amount = sellAll ? qty : 1;
  const value = item.baseValue * RARITY[item.rarity].valueMultiplier * amount;
  user.inventory[itemId] -= amount;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  user.cookies += value;
  user.cookiesBakedAllTime += value;
  writeState(data);
  return { ok: true, amount, value, item };
}

function consumeInventoryItem(guildId, userId, itemId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  const qty = user.inventory[itemId] ?? 0;
  if (qty <= 0) return { ok: false, reason: 'You do not own that item.' };
  const item = ITEM_MAP.get(itemId);
  if (!item) return { ok: false, reason: 'Unknown item.' };
  user.inventory[itemId] -= 1;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  const cpsBonus = (item.baseValue * RARITY[item.rarity].valueMultiplier) * 0.01;
  user.consumedBoosts.push({ cpsBonus, expiresAt: Date.now() + (5 * 60 * 1000) });
  writeState(data);
  return { ok: true, item, cpsBonus };
}

function listItemForSale(guildId, userId, sellerTag, itemId, quantity, pricePerUnit) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const user = getUserState(guildState, userId);
  const owned = user.inventory[itemId] ?? 0;
  if (owned < quantity) return { ok: false, reason: 'Not enough inventory.' };
  user.inventory[itemId] -= quantity;
  if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
  const listing = {
    id: guildState.marketplace.nextListingId++,
    itemId,
    quantity,
    pricePerUnit,
    listedAt: Date.now(),
    sellerId: userId,
    sellerTag,
  };
  guildState.marketplace.listings.push(listing);
  writeState(data);
  return { ok: true, listing };
}

function cancelListing(guildId, userId, listingId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const index = guildState.marketplace.listings.findIndex((listing) => listing.id === listingId);
  if (index === -1) return { ok: false, reason: 'Listing not found.' };
  const listing = guildState.marketplace.listings[index];
  if (listing.sellerId !== userId) return { ok: false, reason: 'That listing is not yours.' };
  const user = getUserState(guildState, userId);
  user.inventory[listing.itemId] = (user.inventory[listing.itemId] ?? 0) + listing.quantity;
  guildState.marketplace.listings.splice(index, 1);
  writeState(data);
  return { ok: true, listing };
}

function buyListing(guildId, buyerId, listingId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  cleanMarketplace(guildState);
  const listing = guildState.marketplace.listings.find((entry) => entry.id === listingId);
  if (!listing) return { ok: false, reason: 'Listing not found.' };
  if (listing.sellerId === buyerId) return { ok: false, reason: "You can't buy your own listing." };

  const buyer = getUserState(guildState, buyerId);
  const seller = getUserState(guildState, listing.sellerId);
  applyPassiveIncome(buyer, Date.now());
  const totalPrice = listing.quantity * listing.pricePerUnit;
  if (buyer.cookies < totalPrice) return { ok: false, reason: `Need ${toCookieNumber(totalPrice)} cookies.` };

  const fee = Math.floor(totalPrice * MARKET_FEE_RATE);
  const payout = totalPrice - fee;
  buyer.cookies -= totalPrice;
  seller.cookies += payout;
  seller.cookiesBakedAllTime += payout;
  buyer.inventory[listing.itemId] = (buyer.inventory[listing.itemId] ?? 0) + listing.quantity;
  buyer.marketplaceBuys += 1;
  seller.marketplaceSells += 1;
  buyer.transactionHistory.push({
    type: 'buy',
    itemId: listing.itemId,
    quantity: listing.quantity,
    price: totalPrice,
    counterparty: listing.sellerId,
    timestamp: Date.now(),
  });
  seller.transactionHistory.push({
    type: 'sell',
    itemId: listing.itemId,
    quantity: listing.quantity,
    price: totalPrice,
    counterparty: buyerId,
    timestamp: Date.now(),
  });
  buyer.transactionHistory = buyer.transactionHistory.slice(-50);
  seller.transactionHistory = seller.transactionHistory.slice(-50);
  const idx = guildState.marketplace.listings.findIndex((entry) => entry.id === listing.id);
  if (idx >= 0) guildState.marketplace.listings.splice(idx, 1);
  evaluateAchievements(buyer);
  evaluateAchievements(seller);
  writeState(data);
  return { ok: true, listing, totalPrice, fee, payout };
}

function getAdminLogChannelId(guildId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  return guildState.settings.adminLogChannelId ?? null;
}

function setAdminLogChannel(guildId, channelId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  guildState.settings.adminLogChannelId = channelId;
  writeState(data);
}

function getAdminModRoleId(guildId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  return guildState.settings.adminModRoleId ?? ROLE_IDS.moderationAccess;
}

function setAdminModRoleId(guildId, roleId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  guildState.settings.adminModRoleId = roleId;
  writeState(data);
}

function adminEnsureTarget(guildId, targetUserId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const target = getUserState(guildState, targetUserId);
  return { data, guildState, target };
}

function adminGiveCookies(guildId, targetUserId, amount) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  target.cookies += amount;
  if (amount > 0) target.cookiesBakedAllTime += amount;
  writeState(data);
}

function adminGiveItem(guildId, targetUserId, itemId, quantity) {
  const { data, guildState, target } = adminEnsureTarget(guildId, targetUserId);
  const item = ITEM_MAP.get(itemId);
  if (!item) return false;
  target.inventory[itemId] = (target.inventory[itemId] ?? 0) + quantity;
  registerItemBake(guildState, target, item, targetUserId);
  writeState(data);
  return true;
}

function adminUnlockUpgrade(guildId, targetUserId, upgradeId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!UPGRADE_MAP.has(upgradeId)) return false;
  if (!target.upgrades.includes(upgradeId)) target.upgrades.push(upgradeId);
  writeState(data);
  return true;
}

function adminSetBuilding(guildId, targetUserId, buildingId, count) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!BUILDING_MAP.has(buildingId)) return false;
  target.buildings[buildingId] = Math.max(0, count);
  writeState(data);
  return true;
}

function adminGrantAchievement(guildId, targetUserId, achievementId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  if (!ACHIEVEMENTS.some((a) => a.id === achievementId)) return false;
  if (!target.milestones.includes(achievementId)) target.milestones.push(achievementId);
  target.milkLevel = target.milestones.length * 4;
  writeState(data);
  return true;
}

function adminForceGolden(guildId, targetUserId) {
  const { data, target } = adminEnsureTarget(guildId, targetUserId);
  target.forceGoldenCookieOnNextBake = true;
  writeState(data);
}

function adminResetUser(guildId, targetUserId) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  guildState.users[targetUserId] = getDefaultUserState(targetUserId);
  writeState(data);
}

function buildBakeAdminEmbed(guild, actorId, targetId) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🛠️ Bake Admin Console')
    .setDescription(`Operator: <@${actorId}>\nTarget: <@${targetId}>`)
    .addFields({
      name: 'Actions',
      value: [
        '• Give/Remove Cookies',
        '• Give Item',
        '• Unlock Upgrade',
        '• Set Building Count',
        '• Grant Achievement',
        '• Trigger Golden Cookie',
        '• Reset User',
        '• View User Data',
      ].join('\n'),
    })
    .setTimestamp();
  if (guild) {
    embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
  }
  return embed;
}

function buildBakeAdminComponents(actorId, targetId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`bakeadmin_action:${actorId}:${targetId}`)
    .setPlaceholder('Choose an admin action')
    .addOptions(
      { label: 'Give Cookies', value: 'give_cookies' },
      { label: 'Remove Cookies', value: 'remove_cookies' },
      { label: 'Give Item', value: 'give_item' },
      { label: 'Unlock Upgrade', value: 'unlock_upgrade' },
      { label: 'Set Building Count', value: 'set_building' },
      { label: 'Grant Achievement', value: 'grant_achievement' },
      { label: 'Trigger Golden Cookie', value: 'trigger_golden' },
      { label: 'Reset User', value: 'reset_user' },
      { label: 'View User Data', value: 'view_user' },
      { label: 'Set Admin Log Channel', value: 'set_log_channel' },
      { label: 'Set Admin Mod Role', value: 'set_mod_role' },
    );
  return [new ActionRowBuilder().addComponents(select)];
}

function modalForAdminAction(actorId, targetId, action) {
  const modal = new ModalBuilder().setCustomId(`bakeadmin_modal:${actorId}:${targetId}:${action}`);
  if (action === 'give_cookies' || action === 'remove_cookies') {
    modal.setTitle(action === 'give_cookies' ? 'Give Cookies' : 'Remove Cookies');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true),
    ));
    return modal;
  }
  if (action === 'give_item') {
    modal.setTitle('Give Item');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('itemId').setLabel('Item ID').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return modal;
  }
  if (action === 'set_building') {
    modal.setTitle('Set Building Count');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('buildingId').setLabel('Building ID').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Count').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return modal;
  }
  if (action === 'set_log_channel' || action === 'set_mod_role') {
    modal.setTitle(action === 'set_log_channel' ? 'Set Log Channel' : 'Set Mod Role');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('value')
        .setLabel(action === 'set_log_channel' ? 'Channel ID' : 'Role ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)),
    );
    return modal;
  }
  return null;
}

function modalForListItem() {
  return new ModalBuilder()
    .setCustomId('market_modal_list')
    .setTitle('List Item on Marketplace')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('itemId').setLabel('Item ID').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Price per unit').setStyle(TextInputStyle.Short).setRequired(true)),
    );
}

function modalForBakeryName() {
  return new ModalBuilder()
    .setCustomId('bakery_modal_name')
    .setTitle('Name Your Bakery')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Bakery name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('emoji').setLabel('Banner emoji').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(8),
      ),
    );
}

function setBakeryIdentity(guildId, userId, bakeryName, bakeryEmoji) {
  const data = readState();
  const guildState = getGuildState(data, guildId);
  const user = getUserState(guildState, userId);
  user.bakeryName = bakeryName;
  if (bakeryEmoji) user.bakeryEmoji = bakeryEmoji;
  evaluateAchievements(user);
  writeState(data);
}

function inspectItem(guildId, userId, itemId) {
  const snapshot = getUserSnapshot(guildId, userId);
  const stats = snapshot.guildState.itemStats[itemId];
  const item = ITEM_MAP.get(itemId);
  if (!item) return null;
  return { item, stats, quantity: snapshot.user.inventory[itemId] ?? 0 };
}

function buildItemInspectEmbed(guild, itemDetails) {
  const { item, stats, quantity } = itemDetails;
  const rarity = RARITY[item.rarity];
  const embed = new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(`${getItemEmoji(item, guild)} ${item.name}`)
    .setDescription(item.flavorText)
    .addFields(
      { name: 'Rarity', value: rarity.name, inline: true },
      { name: 'Base value', value: toCookieNumber(item.baseValue * rarity.valueMultiplier), inline: true },
      { name: 'Owned', value: toCookieNumber(quantity), inline: true },
      { name: 'Total in circulation', value: toCookieNumber(stats?.totalInCirculation ?? 0), inline: true },
      { name: 'First baked by', value: stats?.firstBakedBy ? `<@${stats.firstBakedBy}>` : 'Unknown', inline: true },
    )
    .setTimestamp();
  if (guild) embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined });
  return embed;
}

function getUserDataEmbed(guild, targetUserId) {
  const snapshot = getUserSnapshot(guild?.id, targetUserId);
  const user = snapshot.user;
  return buildDashboardEmbed(guild, user, 'stats');
}

function isBakeAdminAuthorized(member, guildId) {
  const roleId = getAdminModRoleId(guildId);
  return member.roles.cache.has(roleId);
}

module.exports = {
  MessageFlags,
  RARITY,
  RARITY_ORDER,
  BUILDINGS,
  UPGRADES,
  UPGRADE_MAP,
  ACHIEVEMENTS,
  ITEMS,
  ITEM_MAP,
  THEMES,
  TITLES,
  toCookieNumber,
  getUserSnapshot,
  saveUserSnapshot,
  buildDashboardEmbed,
  buildDashboardComponents,
  bake,
  claimGoldenCookie,
  getMarketplaceEmbed,
  getMarketplaceComponents,
  modalForListItem,
  listItemForSale,
  buyListing,
  cancelListing,
  buyBuilding,
  buyUpgrade,
  sellInventoryItem,
  consumeInventoryItem,
  inspectItem,
  buildItemInspectEmbed,
  modalForBakeryName,
  setBakeryIdentity,
  buildBakeAdminEmbed,
  buildBakeAdminComponents,
  modalForAdminAction,
  getAdminLogChannelId,
  setAdminLogChannel,
  setAdminModRoleId,
  adminGiveCookies,
  adminGiveItem,
  adminUnlockUpgrade,
  adminSetBuilding,
  adminGrantAchievement,
  adminForceGolden,
  adminResetUser,
  getUserDataEmbed,
  isBakeAdminAuthorized,
  computeCps,
  getBuildingPrice,
  getRarityEmoji,
  getItemEmoji,
};
