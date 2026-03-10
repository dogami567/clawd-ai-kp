const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("fs");
const { join } = require("path");
const {
  startSessionApi,
  addInvestigator,
  getState,
  submitAction,
  saveSessionApi,
  loadSessionApi,
  createCharacter,
  createInvestigatorFromTraditional,
  generateTraditionalAttributesDetailed,
  getOccupationTemplate,
  listOccupationTemplates,
  QUICK_FIRE_VALUES,
  processScenarioTurn,
  settleSessionApi,
  loadCampaignTemplate,
  attachCampaignMeta,
  formatCampaignSummary,
  getCurrentCampaign,
  transitionCampaignScene,
  listCampaignRuntimeNpcAftermath,
  listEligibleHooks,
  autoAdvanceCampaign,
  loadStoryPackTemplate,
  formatStoryPackSummary,
  routeScenarioAction,
  runCheck,
  calculateDerivedStats,
  validateInventoryForEra,
  buildConditionalAllowance
} = require("../../core/src/index");
const { resolveSkillDefault, SKILL_DEFAULTS } = require("../../core/src/skill-defaults");
const { loadNpcCard } = require("../../core/src/npc-cards");
const { rollFormula } = require("../../core/src/combat-rules");
const {
  ensureSummaryState,
  appendChatLog,
  appendOperationLog,
  appendPlayerOperationLogs,
  writeStateSnapshot,
  writeContextSnapshot,
  buildContextPacket,
  maybeRollupSummaries,
  safeReadJsonLines
} = require("./log-store");

const KP_RUNTIME_PROMPT = [
  "你现在是 AI 跑团的 KP，名字叫麦麦。",
  "语气可爱、口语化、轻一点，会自然带一点颜文字，但不要说教，也别端着像模板回复。",
  "单次回复尽量控制在 200 字内；优先短句、轻度演绎，不要长段介绍，不要堆一串推荐。",
  "请使用自然、精简的日常口语与我对话，直接提供核心信息。绝对禁止使用以下词汇和句式：首先/其次/最后、综上所述、值得注意的是、深入探讨、赋能、释放潜力、画卷、至关重要、“这不仅是...更是...”。不要生成任何开头寒暄和结尾总结。可以给用户建议、拓展对话，但拓展不能带剧透内容。",
  "玩家描述动作时，不要直接脑补他们内心想法，也不要替他们先拍板技能。若动作可能对应多项技能，先用一句话给 1-2 个候选，比如“这步过侦查还是心理学？”也可以顺手提醒哪项更高。",
  "只有当玩家明确说“你决定”“默认”“自动分配”“你来选”时，你才替玩家选技能并继续落骰。",
  "如果玩家直接说“我要过个侦查/心理学/图书馆”，你要帮他用 1-2 句简短演绎补足动作，再结算成功或失败。",
  "如果这局更看重 RP，就先让玩家自己演；如果玩家是萌新、不会演，或明确不想演，再给简短选项，并用 1-2 句带画面的轻度演绎来承接结果。",
  "你要优先理解玩家自然语言意图，能自动帮他们触发车卡、检定、推进场景，不要求玩家背指令。",
  "公开骰一定给玩家看清楚点数、目标值和结果；暗骰不要把点数直接抖给玩家。"
].join("\n");

const OCCUPATION_ALIASES = Object.freeze([
  ["journalist", "journalist"],
  ["reporter", "journalist"],
  ["记者", "journalist"],
  ["detective", "detective"],
  ["private detective", "detective"],
  ["私家侦探", "detective"],
  ["侦探", "detective"],
  ["doctor", "doctor"],
  ["physician", "doctor"],
  ["医生", "doctor"],
  ["professor", "professor"],
  ["学者", "professor"],
  ["教授", "professor"],
  ["artist", "artist"],
  ["singer", "artist"],
  ["艺术家", "artist"],
  ["歌手", "artist"],
  ["veteran", "veteran"],
  ["soldier", "veteran"],
  ["退伍军人", "veteran"],
  ["老兵", "veteran"],
  ["军人", "veteran"],
  ["dilettante", "dilettante"],
  ["socialite", "dilettante"],
  ["富家子", "dilettante"],
  ["社交名流", "dilettante"],
  ["名流", "dilettante"]
]);

const STORY_PACK_FILE_SUFFIX = ".story-pack.json";
const STORY_PACKS_DIR = join(__dirname, "..", "..", "core", "data", "story-packs");
const STORY_PACK_REQUIRED_COMMANDS = new Set([
  "start",
  "state",
  "campaign",
  "hooks",
  "storypack",
  "goto",
  "advance",
  "scene",
  "recap",
  "clues",
  "npcs",
  "settle"
]);

const TRADITIONAL_DRAFT_STAGES = new Set(["occupation", "skills", "profile", "gear", "lock"]);
const SOCIAL_SCENE_METHOD_OPTIONS = Object.freeze([
  {
    id: "psychology",
    displayLabel: "心理学",
    skillKey: "Psychology",
    interactionStyle: "empathy",
    riskLevel: "low",
    initialHints: ["心理学", "看他表情", "看他反应", "观察反应", "摸底", "试探", "察言观色", "是不是在撒谎", "有没有撒谎"],
    replyHints: ["心理学", "走心理", "心理", "看表情", "看反应", "观察反应", "摸底", "试探", "察言观色"],
    playerHint: "先盯他的表情和反应，摸清他到底在怕什么、藏什么。"
  },
  {
    id: "persuade",
    displayLabel: "说服",
    skillKey: "Persuade",
    interactionStyle: "persuade",
    riskLevel: "low",
    initialHints: ["说服", "讲道理", "摆事实", "劝他", "好好劝"],
    replyHints: ["说服", "走说服", "讲道理", "劝他", "安抚", "慢慢聊", "好好聊"],
    playerHint: "顺着话往下讲，给他一个愿意松口的台阶。"
  },
  {
    id: "intimidate",
    displayLabel: "恐吓",
    skillKey: "Intimidate",
    interactionStyle: "intimidate",
    riskLevel: "medium",
    initialHints: ["恐吓", "威胁", "吓他", "逼问", "施压"],
    replyHints: ["恐吓", "走恐吓", "威胁", "吓他", "逼问", "施压"],
    playerHint: "直接把压力顶上去，逼他现在就吐口。"
  },
  {
    id: "bribery",
    displayLabel: "信用评级",
    skillKey: "Credit Rating",
    interactionStyle: "bribery",
    riskLevel: "medium",
    initialHints: ["信用评级", "拿钱", "塞钱", "给好处", "贿赂", "收买", "用身份", "用面子", "砸资源"],
    replyHints: ["信用", "信用评级", "走信用", "拿钱", "塞钱", "给好处", "贿赂", "收买", "用身份", "砸资源"],
    playerHint: "拿身份、面子或实打实的好处去撬。"
  },
  {
    id: "charm",
    displayLabel: "魅惑",
    skillKey: "Charm",
    interactionStyle: "charm",
    riskLevel: "low",
    initialHints: ["魅惑", "套近乎", "哄他", "讨好", "卖乖"],
    replyHints: ["魅惑", "走魅惑", "套近乎", "哄他", "讨好", "卖乖"],
    playerHint: "先把气氛放软，贴近一点再慢慢套话。"
  }
]);

const EVASION_SCENE_METHOD_OPTIONS = Object.freeze([
  {
    id: "dodge",
    displayLabel: "闪避",
    skillKey: "Dodge",
    interactionStyle: "dodge",
    riskLevel: "medium",
    initialHints: ["闪避", "躲开", "躲一下", "避开", "侧身", "闪身"],
    replyHints: ["闪避", "走闪避", "躲开", "避开", "闪身"],
    playerHint: "靠反应和走位先把这一下让过去。"
  },
  {
    id: "stealth",
    displayLabel: "潜行",
    skillKey: "Stealth",
    interactionStyle: "stealth",
    riskLevel: "low",
    initialHints: ["潜行", "溜走", "绕开", "藏起来", "先躲", "压低脚步"],
    replyHints: ["潜行", "走潜行", "绕开", "溜走", "藏起来"],
    playerHint: "别硬顶，先藏住动静找空子脱身。"
  },
  {
    id: "fighting",
    displayLabel: "斗殴",
    skillKey: "Fighting",
    interactionStyle: "force",
    riskLevel: "high",
    initialHints: ["斗殴", "撞开", "硬闯", "推开", "狠狠干", "狠狠干过去"],
    replyHints: ["斗殴", "走斗殴", "撞开", "硬闯", "推开"],
    playerHint: "直接硬顶出一条路，但动静和风险都会高。"
  }
]);

const SKILL_ALIASES = Object.freeze([
  ["会计", "Accounting"],
  ["估价", "Appraise"],
  ["考古", "Archaeology"],
  ["艺术", "Art/Craft"],
  ["手艺", "Art/Craft"],
  ["摄影", "Art/Craft (Photography)"],
  ["魅惑", "Charm"],
  ["攀爬", "Climb"],
  ["信用评级", "Credit Rating"],
  ["信用", "Credit Rating"],
  ["伪装", "Disguise"],
  ["闪避", "Dodge"],
  ["汽车驾驶", "Drive Auto"],
  ["驾驶", "Drive Auto"],
  ["话术", "Fast Talk"],
  ["斗殴", "Fighting"],
  ["格斗", "Fighting"],
  ["手枪", "Firearms"],
  ["射击", "Firearms"],
  ["急救", "First Aid"],
  ["历史", "History"],
  ["恐吓", "Intimidate"],
  ["外语", "Language (Other)"],
  ["法律", "Law"],
  ["图书馆", "Library Use"],
  ["图书馆使用", "Library Use"],
  ["聆听", "Listen"],
  ["开锁", "Locksmith"],
  ["医学", "Medicine"],
  ["博物", "Natural World"],
  ["自然学", "Natural World"],
  ["母语", "Own Language"],
  ["说服", "Persuade"],
  ["心理学", "Psychology"],
  ["科学", "Science"],
  ["生物学", "Science (Biology)"],
  ["药学", "Science (Pharmacy)"],
  ["侦查", "Spot Hidden"],
  ["观察", "Spot Hidden"],
  ["潜行", "Stealth"],
  ["生存", "Survival"],
  ["游泳", "Swim"],
  ["投掷", "Throw"]
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getKpRuntimePrompt() {
  return KP_RUNTIME_PROMPT;
}

function listStoryPackTemplates() {
  if (!existsSync(STORY_PACKS_DIR)) return [];
  return readdirSync(STORY_PACKS_DIR)
    .filter((fileName) => fileName.endsWith(STORY_PACK_FILE_SUFFIX))
    .map((fileName) => fileName.slice(0, -STORY_PACK_FILE_SUFFIX.length))
    .sort()
    .map((storyPackId) => loadStoryPackTemplate(storyPackId));
}

function listStoryPackEntries() {
  return listStoryPackTemplates().map((storyPack, index) => {
    const campaign = loadCampaignTemplate(storyPack.campaignId);
    return {
      index: index + 1,
      storyPack,
      campaign,
      startSceneId: campaign.startSceneId || storyPack.sceneIds?.[0] || "old-church-night"
    };
  });
}

function getSelectedStoryPackEntry(meta = {}) {
  const storyPackId = typeof meta.storyPackId === "string" ? meta.storyPackId.trim() : "";
  if (!storyPackId) return null;
  return listStoryPackEntries().find((entry) => entry.storyPack.id === storyPackId) || null;
}

function normalizeStoryPackSelectorText(text = "") {
  return normalizeIntentText(text)
    .replace(/\s+/g, "")
    .replace(/^(那就|就|我选|选|跑|开|来跑|来个|玩|想跑|想开)+/g, "")
    .replace(/(那个|这个|这条|那条|这一条|那一条|这个本|那个本|这个剧本|那个剧本|这个模组|那个模组|故事包)/g, "")
    .replace(/(就行|就好|可以了|好了|行了|可以|行吧|吧|呀|啊|啦|呢|嘛)+$/g, "")
    .trim();
}

function resolveStoryPackSelection(text = "") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;

  if (includesAny(normalized, ["看看剧本", "剧本列表", "模组列表", "故事包列表", "story pack", "storypack", "packs"])) {
    return { kind: "list" };
  }

  const entries = listStoryPackEntries();
  const trimmed = normalized.trim();
  const looseTrimmed = normalizeStoryPackSelectorText(text);
  if (/^\d+$/.test(trimmed)) {
    const byIndex = entries.find((entry) => String(entry.index) === trimmed);
    if (byIndex) return { kind: "select", storyPackId: byIndex.storyPack.id };
  }

  for (const entry of entries) {
    const aliases = [
      entry.storyPack.id,
      entry.storyPack.title,
      String(entry.storyPack.title || "").replace(/\s*story pack\s*/ig, ""),
      entry.campaign.id,
      entry.campaign.title
    ]
      .map((value) => normalizeIntentText(value))
      .filter(Boolean);
    const looseAliases = aliases
      .map((alias) => normalizeStoryPackSelectorText(alias))
      .filter(Boolean);

    if (
      aliases.some((alias) => trimmed === alias || trimmed.includes(alias) || alias.includes(trimmed)) ||
      (looseTrimmed && looseAliases.some(
        (alias) => looseTrimmed === alias || looseTrimmed.includes(alias) || alias.includes(looseTrimmed)
      ))
    ) {
      return { kind: "select", storyPackId: entry.storyPack.id };
    }
  }

  return null;
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getMessageText(event = {}) {
  return String(event.message ?? event.raw_message ?? event.text ?? "").trim();
}

function getSenderName(event = {}) {
  return String(event.sender?.card || event.sender?.nickname || event.user_name || `玩家${event.user_id || "unknown"}`);
}

function normalizeIntentText(text = "") {
  return String(text).trim().toLowerCase();
}

function includesAny(text, keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildDefaultInventory() {
  return [
    { name: "手电", category: "tool", quantity: 1 },
    { name: "笔记本", category: "tool", quantity: 1 }
  ];
}

function inferInventoryCategory(name = "") {
  const normalized = String(name).toLowerCase();
  if (includesAny(normalized, ["枪", "手枪", "左轮", "shotgun", "rifle", "knife", "刀", "匕首", "棍", "斧"])) return "weapon";
  if (includesAny(normalized, ["手电", "笔记本", "相机", "开锁", "绳", "地图", "指南针", "药", "急救", "怀表", "手套"])) return "tool";
  return "daily";
}

function normalizeInventoryItems(items = []) {
  return items
    .map((item) => {
      if (!item || !String(item.name || "").trim()) return null;
      return {
        name: String(item.name).trim(),
        category: item.category || inferInventoryCategory(item.name),
        quantity: Math.max(1, Number(item.quantity || 1))
      };
    })
    .filter(Boolean);
}

function formatInventorySummary(investigator) {
  const items = Array.isArray(investigator?.inventory) ? investigator.inventory : [];
  if (!items.length) return "暂时空手。";
  return items.map((item) => `${item.name}x${item.quantity || 1}`).join("、");
}

function ensureInventoryBaselineMap(meta) {
  meta.inventoryBaselineByActorId =
    meta.inventoryBaselineByActorId && typeof meta.inventoryBaselineByActorId === "object"
      ? meta.inventoryBaselineByActorId
      : {};
  return meta.inventoryBaselineByActorId;
}

function syncInventoryBaseline(meta, investigator, options = {}) {
  if (!meta || !investigator?.id) return;
  const baselineMap = ensureInventoryBaselineMap(meta);
  if (!options.force && Array.isArray(baselineMap[investigator.id])) return;
  baselineMap[investigator.id] = cloneJson(normalizeInventoryItems(investigator.inventory || []));
}

function toInventoryCountMap(items = []) {
  const map = new Map();
  for (const item of normalizeInventoryItems(items)) {
    const key = String(item.name || "").trim();
    if (!key) continue;
    map.set(key, Number(item.quantity || 1));
  }
  return map;
}

function formatInventoryDeltaSummary(meta, investigator) {
  const baselineMap = ensureInventoryBaselineMap(meta || {});
  const baselineItems = Array.isArray(baselineMap[investigator?.id]) ? baselineMap[investigator.id] : normalizeInventoryItems(investigator?.inventory || []);
  const currentItems = normalizeInventoryItems(investigator?.inventory || []);
  const beforeMap = toInventoryCountMap(baselineItems);
  const afterMap = toInventoryCountMap(currentItems);
  const changes = [];

  for (const [name, quantity] of afterMap.entries()) {
    const beforeQuantity = beforeMap.get(name);
    if (beforeQuantity == null) {
      changes.push(`+${name}x${quantity}`);
      continue;
    }
    if (beforeQuantity !== quantity) {
      changes.push(`${name} ${beforeQuantity}→${quantity}`);
    }
  }

  for (const [name, quantity] of beforeMap.entries()) {
    if (!afterMap.has(name)) {
      changes.push(`-${name}x${quantity}`);
    }
  }

  return changes.length ? changes.join("；") : null;
}

function formatInvestigatorConditionSummary(investigator) {
  const labels = [];
  const status = investigator?.status || {};
  const conditions = Array.isArray(status.conditions) ? status.conditions : [];

  if (status.majorWound) labels.push("重大伤");
  if (conditions.includes("dying")) labels.push("濒死");
  if (status.temporaryInsanity || conditions.includes("temporary_insanity")) labels.push("临时异常");
  if (status.indefiniteInsanity || conditions.includes("indefinite_insanity")) labels.push("长期异常");

  return labels.length ? [...new Set(labels)].join("、") : "正常";
}

function formatInvestigatorStateLine(investigator, meta = null, options = {}) {
  if (!investigator) return null;
  const bits = [
    `${investigator.name}`,
    `HP ${investigator.resources.hp}/${investigator.resources.hpMax}`,
    `SAN ${investigator.resources.san}/${investigator.resources.sanMax}`
  ];
  const conditionText = formatInvestigatorConditionSummary(investigator);
  if (conditionText !== "正常") {
    bits.push(`状态 ${conditionText}`);
  }
  const temporaryEffects = Array.isArray(investigator?.status?.temporaryEffects) && investigator.status.temporaryEffects.length
    ? investigator.status.temporaryEffects.join("、")
    : null;
  if (temporaryEffects && options.includeEffects !== false) {
    bits.push(`后效 ${temporaryEffects}`);
  }
  if (options.includeInventory === true) {
    bits.push(`携带 ${formatInventorySummary(investigator)}`);
    const inventoryDelta = meta ? formatInventoryDeltaSummary(meta, investigator) : null;
    if (inventoryDelta) {
      bits.push(`变动 ${inventoryDelta}`);
    }
  }
  return bits.join("｜");
}

function refreshInvestigatorComputedFields(investigator) {
  if (!investigator) return investigator;
  investigator.resources = calculateDerivedStats({
    ...investigator.attributes,
    Luck: investigator.resources?.luck ?? investigator.attributeChecks?.Luck?.value ?? 50
  }, {
    age: investigator.age
  });
  investigator.attributeChecks.Luck = {
    value: investigator.resources.luck,
    half: Math.floor(investigator.resources.luck / 2),
    fifth: Math.floor(investigator.resources.luck / 5)
  };
  investigator.inventory = normalizeInventoryItems(investigator.inventory || []);
  investigator.inventoryValidation = validateInventoryForEra(investigator.inventory, investigator.era);
  investigator.inventoryAllowance = buildConditionalAllowance(investigator.inventoryValidation);
  return investigator;
}

function splitNaturalPhrases(text = "") {
  return String(text)
    .split(/[，,；;。.\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractNamedValue(text = "", prefixes = []) {
  for (const prefix of prefixes) {
    const pattern = new RegExp(`${prefix}[:：]?\\s*([^，,；;。\\n]+)`);
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseProfileDraftUpdates(text = "", investigator) {
  const updates = {};
  const normalized = normalizeIntentText(text);
  if (includesAny(normalized, ["默认继续", "默认", "就这样", "先这样", "跳过", "不用改"])) {
    return { updates, recognized: true, skip: true };
  }

  const name = extractNamedValue(text, ["名字", "名叫", "叫"]);
  if (name) updates.name = name.replace(/^我/, "").trim();

  const ageMatch = String(text).match(/(\d{2})\s*岁/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    if (age >= 15 && age <= 89) updates.age = age;
  }

  const persona = extractNamedValue(text, ["外观", "样子", "看起来", "形象"]);
  if (persona) updates.persona = persona;
  const motivation = extractNamedValue(text, ["动机", "目的", "想要", "目标"]);
  if (motivation) updates.motivation = motivation;

  const parts = splitNaturalPhrases(text);
  for (const part of parts) {
    if (!updates.persona && !/岁/.test(part) && !includesAny(normalizeIntentText(part), ["带", "装备", "携带", "名字", "动机", "目的", "想要", "目标"])) {
      updates.persona = part;
      continue;
    }
    if (!updates.motivation && includesAny(normalizeIntentText(part), ["想", "为了", "打算", "要把", "要查", "想查"])) {
      updates.motivation = part;
    }
  }

  if (!updates.name && investigator?.name) updates.name = investigator.name;
  if (updates.age == null && investigator?.age != null) updates.age = investigator.age;
  if (!updates.persona && investigator?.persona) updates.persona = investigator.persona;
  if (!updates.motivation && investigator?.motivation) updates.motivation = investigator.motivation;

  return {
    updates,
    recognized: Boolean(name || ageMatch || persona || motivation || parts.length)
  };
}

function parseInventoryDraftItems(text = "", fallbackItems = []) {
  const normalized = normalizeIntentText(text);
  if (includesAny(normalized, ["默认继续", "默认装备", "默认", "就这样", "先这样", "跳过", "不用改"])) {
    return { items: normalizeInventoryItems(fallbackItems), recognized: true, skip: true };
  }

  const raw = extractNamedValue(text, ["带", "携带", "装备", "物品"]) || text;
  const items = raw
    .split(/[、，,\/\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => entry.length <= 12)
    .filter((entry) => !includesAny(normalizeIntentText(entry), ["我", "想", "要", "带上", "携带", "装备", "物品", "还有"]))
    .map((name) => ({ name, category: inferInventoryCategory(name), quantity: 1 }));

  return {
    items: normalizeInventoryItems(items),
    recognized: Boolean(items.length)
  };
}

function detectBriefingConsent(text = "") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  if (includesAny(normalized, ["看看剧本", "剧本列表", "模组列表", "规则", "边界"])) return "repeat";
  if (includesAny(normalized, ["开始建卡", "开始车卡", "继续", "开始", "好", "行", "没问题", "可以"])) return "confirm";
  if (includesAny(normalized, ["车卡", "建卡", "roll", "quickfire", "快速车卡"]) || extractOccupationKeyFromText(normalized)) return "confirm";
  return null;
}

function getOccupationAliasPairs() {
  const dynamicPairs = listOccupationTemplates().flatMap((occupation) => ([
    [occupation.key.toLowerCase(), occupation.key],
    [occupation.name.toLowerCase(), occupation.key],
    ...((occupation.aliases || []).map((alias) => [String(alias).toLowerCase(), occupation.key]))
  ]));
  return [...dynamicPairs, ...OCCUPATION_ALIASES];
}

function extractOccupationKeyFromText(text) {
  if (!text) return null;
  const normalized = normalizeIntentText(text);
  const aliasPairs = getOccupationAliasPairs()
    .map(([alias, key]) => [String(alias).toLowerCase(), key])
    .sort((left, right) => right[0].length - left[0].length);

  for (const [alias, key] of aliasPairs) {
    if (normalized.includes(alias)) {
      return key;
    }
  }

  return null;
}

function detectOccupationKeyFromText(text, fallback = "journalist") {
  return extractOccupationKeyFromText(text) || fallback;
}

function getSkillAliasPairs() {
  const canonicalPairs = Object.keys(SKILL_DEFAULTS).flatMap((skillKey) => ([
    [skillKey.toLowerCase(), skillKey],
    [skillKey.replace(/\s+/g, "").toLowerCase(), skillKey]
  ]));
  return [...canonicalPairs, ...SKILL_ALIASES];
}

function extractSkillKeysFromText(text) {
  if (!text) return [];
  const normalized = normalizeIntentText(text);
  const aliasPairs = getSkillAliasPairs()
    .map(([alias, key]) => [String(alias).toLowerCase(), key])
    .sort((left, right) => right[0].length - left[0].length);
  const found = [];
  for (const [alias, key] of aliasPairs) {
    if (normalized.includes(alias) && !found.includes(key)) {
      found.push(key);
    }
  }
  return found;
}

function extractCreditRatingChoice(text, occupation) {
  if (!text || !occupation) return null;
  const normalized = normalizeIntentText(text);
  const match = normalized.match(/(?:信用(?:评级)?|credit\s*rating|cr)\D{0,3}(\d{1,2})/i) || normalized.match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isInteger(value)) return null;
  const [min, max] = occupation.creditRatingRange || [0, 99];
  if (value < min || value > max) return null;
  return value;
}

function wantsAutoSkillAllocation(text = "") {
  const normalized = normalizeIntentText(text);
  return includesAny(normalized, ["自动分配", "自动吧", "你分吧", "你来分", "默认就行", "随你", "auto"]);
}

function findInvestigatorSkillEntry(investigator, skillKey) {
  return Array.isArray(investigator?.skills)
    ? investigator.skills.find((item) => item.key === skillKey) || null
    : null;
}

function tryLoadNpcCard(npcId) {
  if (!npcId) return null;
  try {
    return loadNpcCard(npcId);
  } catch {
    return null;
  }
}

function detectSocialMethodFromText(text = "", phase = "initial") {
  const normalized = normalizeIntentText(text);
  const hintKey = phase === "reply" ? "replyHints" : "initialHints";
  return SOCIAL_SCENE_METHOD_OPTIONS.find((option) => includesAny(normalized, option[hintKey])) || null;
}

function detectSceneMethodOptionFromText(text = "", options = [], phase = "initial") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  const hintKey = phase === "reply" ? "replyHints" : "initialHints";
  return options.find((option) =>
    includesAny(normalized, option?.[hintKey] || [])
    || includesAny(normalized, [option?.displayLabel, option?.skillKey].filter(Boolean))
  ) || null;
}

function scoreSceneMethodOption(option, investigator, action) {
  const skill = findInvestigatorSkillEntry(investigator, option.skillKey);
  if (!skill) return null;
  const npcCard = option.interactionStyle ? tryLoadNpcCard(action?.targetNpc) : null;
  const response = npcCard?.social?.respondsTo?.[option.interactionStyle] || "normal";
  const responseBonus = response === "strong" ? 10 : response === "weak" ? -10 : 0;
  const riskPenalty = option.riskLevel === "medium" ? 6 : option.riskLevel === "high" ? 12 : 0;
  return {
    ...option,
    skillValue: Number(skill.value || 0),
    recommendationScore: Number(skill.value || 0) + responseBonus - riskPenalty,
    targetNpcName: npcCard?.name || action?.targetNpc || null
  };
}

function buildRankedSceneMethodOptions(investigator, action, optionList) {
  return optionList
    .map((option) => scoreSceneMethodOption(option, investigator, action))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.recommendationScore !== left.recommendationScore) {
        return right.recommendationScore - left.recommendationScore;
      }
      return right.skillValue - left.skillValue;
    })
    .map((option, index, list) => ({
      ...option,
      recommended: index === 0 || option.recommendationScore >= (list[0]?.recommendationScore ?? 0) - 5,
    }));
}

function shouldOfferEscapeMethodChoice(action, originalText = "") {
  if (!["explore", "follow", "risky_action"].includes(action?.kind)) return false;
  return includesAny(normalizeIntentText(originalText), [
    "逃",
    "跑",
    "脱身",
    "甩开",
    "躲",
    "闪",
    "避开",
    "闪开",
    "绕开",
    "撤",
    "溜"
  ]);
}

function buildSceneMethodChoiceConfig(investigator, action, originalText = "") {
  if (action?.kind === "talk") {
    return {
      kind: "social_skill_choice",
      promptLine: `${action?.targetNpc || "对方"} 这边更像交涉场面，你先选这一下打算怎么落。`,
      optionLead: "我先给你几个走法：",
      replyHintLine: "直接回“走心理学 / 走说服 / 走恐吓 / 走信用 / 走魅惑”都行；也可以把动作改写一句，我按新的来。",
      options: buildRankedSceneMethodOptions(investigator, action, SOCIAL_SCENE_METHOD_OPTIONS)
    };
  }

  if (shouldOfferEscapeMethodChoice(action, originalText)) {
    return {
      kind: "action_skill_choice",
      promptLine: "这一下更像是在先想办法脱身，你先定这次要怎么落。",
      optionLead: "我先给你几个常见走法：",
      replyHintLine: "直接回“走闪避 / 走潜行 / 走斗殴”都行；也可以把动作改写一句，我按新的来。",
      options: buildRankedSceneMethodOptions(investigator, action, EVASION_SCENE_METHOD_OPTIONS)
    };
  }

  return null;
}

function formatSceneActionChoiceReply(pendingChoice, options = {}) {
  if (pendingChoice?.kind === "post_check_choice") {
    const introLine = options.repeat
      ? "我这边还在等你拍板这次检定后怎么走。"
      : "这一下我先停一下，把选择权给你。";
    const lines = [introLine];
    if (pendingChoice.failureLine) lines.push(pendingChoice.failureLine);
    if (pendingChoice.failForwardLine) lines.push(`失败推进：${pendingChoice.failForwardLine}`);
    if (pendingChoice.penaltyNote) lines.push(`惩罚提示：${pendingChoice.penaltyNote}`);
    if (pendingChoice.crisisNote) lines.push(`再硬顶的代价：${pendingChoice.crisisNote}`);
    lines.push("你现在可以这么选：");
    for (const option of pendingChoice.options || []) {
      lines.push(`- ${option.displayLabel}：${option.playerHint}`);
    }
    lines.push("直接回“接受 / 推骰 / 花幸运”都行。");
    return lines.join("\n");
  }

  const introLine = options.repeat
    ? "这一下我还在等你定走法。"
    : "这句我先不替你直接判。";
  const lines = [introLine];
  lines.push(pendingChoice?.promptLine || `${pendingChoice?.targetNpcName || "对方"} 这边更像交涉场面，你先选这一下打算怎么落。`);
  lines.push(pendingChoice?.optionLead || "我先给你几个走法：");

  for (const option of pendingChoice.options || []) {
    const recommendSuffix = option.recommended ? "｜更顺手" : "";
    lines.push(`- ${option.displayLabel}（${option.skillKey} ${option.skillValue}${recommendSuffix}）：${option.playerHint}`);
  }

  lines.push(pendingChoice?.replyHintLine || "直接回“走心理学 / 走说服 / 走恐吓 / 走信用 / 走魅惑”都行；也可以把动作改写一句，我按新的来。");
  return lines.join("\n");
}

function detectPostCheckChoice(text = "") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  if (includesAny(normalized, ["接受", "就这样", "按这个", "不推", "不花", "算了", "认了"])) return "accept";
  if (includesAny(normalized, ["推骰", "强推", "再试", "重掷", "重投"])) return "push";
  if (includesAny(normalized, ["花幸运", "用幸运", "烧幸运", "花点幸运"])) return "luck";
  return null;
}

function buildConversationKey(event = {}) {
  if (event.group_id) return `onebot-group-${sanitizeSegment(event.group_id)}`;
  if (event.user_id) return `onebot-dm-${sanitizeSegment(event.user_id)}`;
  return "onebot-unknown";
}

function buildStorageLayoutFromConversationKey(storageRoot, conversationKey) {
  const root = storageRoot || join(__dirname, "..", "..", "runtime", "onebot");
  const logsConversationDir = join(root, "logs", conversationKey);
  return {
    root,
    conversationKey,
    sessionsDir: join(root, "sessions"),
    metaDir: join(root, "meta"),
    archiveConversationDir: join(root, "archives", conversationKey),
    sessionFile: join(root, "sessions", `${conversationKey}.json`),
    metaFile: join(root, "meta", `${conversationKey}.json`),
    logsConversationDir,
    chatLogDir: join(logsConversationDir, "chat"),
    ledgerLogDir: join(logsConversationDir, "ledger"),
    playerLogDir: join(logsConversationDir, "players"),
    stateDir: join(logsConversationDir, "state"),
    summaryDir: join(logsConversationDir, "summaries"),
    contextDir: join(logsConversationDir, "context"),
    chatLogFile: join(logsConversationDir, "chat", "events.jsonl"),
    ledgerLogFile: join(logsConversationDir, "ledger", "operations.jsonl"),
    stateFile: join(logsConversationDir, "state", "latest.json"),
    contextFile: join(logsConversationDir, "context", "latest.json")
  };
}

function buildStorageLayout(storageRoot, event) {
  return buildStorageLayoutFromConversationKey(storageRoot, buildConversationKey(event));
}

function ensureStorageDirs(layout) {
  mkdirSync(layout.sessionsDir, { recursive: true });
  mkdirSync(layout.metaDir, { recursive: true });
  mkdirSync(layout.archiveConversationDir, { recursive: true });
}

function ensureConversationControlState(meta) {
  meta.actorsByUserId =
    meta.actorsByUserId && typeof meta.actorsByUserId === "object"
      ? meta.actorsByUserId
      : {};
  ensureInventoryBaselineMap(meta);
  meta.knownUsers = Array.isArray(meta.knownUsers) ? meta.knownUsers : [];
  meta.archiveHistory = Array.isArray(meta.archiveHistory) ? meta.archiveHistory : [];
  const normalizePendingDraft = (draft) => {
    if (!draft || typeof draft !== "object") return null;
    if (!TRADITIONAL_DRAFT_STAGES.has(String(draft.stage || ""))) return null;
    const ownerUserId =
      draft.ownerUserId != null && String(draft.ownerUserId).trim()
        ? String(draft.ownerUserId).trim()
        : null;
    const ownerUserName =
      typeof draft.ownerUserName === "string" && draft.ownerUserName.trim()
        ? draft.ownerUserName.trim()
        : null;
    return {
      ...draft,
      ownerUserId,
      ownerUserName,
    };
  };
  meta.pendingSessionBriefing = meta.pendingSessionBriefing && typeof meta.pendingSessionBriefing === "object"
    ? meta.pendingSessionBriefing
    : null;
  meta.pendingResumeChoice = meta.pendingResumeChoice && typeof meta.pendingResumeChoice === "object"
    ? meta.pendingResumeChoice
    : null;
  meta.pendingDeleteChoice = meta.pendingDeleteChoice && typeof meta.pendingDeleteChoice === "object"
    ? meta.pendingDeleteChoice
    : null;
  meta.pendingStoryPackChoice = meta.pendingStoryPackChoice && typeof meta.pendingStoryPackChoice === "object"
    ? meta.pendingStoryPackChoice
    : null;
  meta.pendingSceneActionChoice = meta.pendingSceneActionChoice && typeof meta.pendingSceneActionChoice === "object"
    ? meta.pendingSceneActionChoice
    : null;
  meta.pendingInvestigatorDraftsByUserId =
    meta.pendingInvestigatorDraftsByUserId && typeof meta.pendingInvestigatorDraftsByUserId === "object"
      ? meta.pendingInvestigatorDraftsByUserId
      : {};
  const normalizedDraftMap = {};
  for (const [userId, draft] of Object.entries(meta.pendingInvestigatorDraftsByUserId)) {
    const normalizedDraft = normalizePendingDraft(draft);
    if (!normalizedDraft) continue;
    const resolvedUserId = normalizedDraft.ownerUserId || String(userId || "").trim();
    if (!resolvedUserId) continue;
    normalizedDraftMap[resolvedUserId] = {
      ...normalizedDraft,
      ownerUserId: resolvedUserId,
    };
  }
  meta.pendingInvestigatorDraftsByUserId = normalizedDraftMap;
  const normalizedPendingDraft = normalizePendingDraft(meta.pendingInvestigatorDraft);
  if (normalizedPendingDraft?.ownerUserId) {
    meta.pendingInvestigatorDraftsByUserId[normalizedPendingDraft.ownerUserId] = normalizedPendingDraft;
  }
  meta.pendingInvestigatorDraft = normalizedPendingDraft || null;
  meta.partyRosterByUserId =
    meta.partyRosterByUserId && typeof meta.partyRosterByUserId === "object"
      ? meta.partyRosterByUserId
      : {};
  const normalizedPartyRoster = {};
  const knownUsersById = new Map(
    meta.knownUsers
      .map((item) => {
        const userId = item?.userId != null ? String(item.userId).trim() : "";
        if (!userId) return null;
        const userName =
          typeof item?.name === "string" && item.name.trim()
            ? item.name.trim()
            : `玩家${userId}`;
        return [userId, userName];
      })
      .filter(Boolean)
  );
  const normalizePartyMember = (member, fallbackUserId = "", fallbackInvestigatorId = "") => {
    if (!member || typeof member !== "object") return null;
    const userId =
      member.userId != null && String(member.userId).trim()
        ? String(member.userId).trim()
        : String(fallbackUserId || "").trim();
    if (!userId) return null;
    const investigatorId =
      member.investigatorId != null && String(member.investigatorId).trim()
        ? String(member.investigatorId).trim()
        : String(fallbackInvestigatorId || "").trim() || null;
    const status = investigatorId ? "ready" : "joined";
    const userName =
      typeof member.userName === "string" && member.userName.trim()
        ? member.userName.trim()
        : knownUsersById.get(userId) || `玩家${userId}`;
    return {
      userId,
      userName,
      status,
      investigatorId,
      joinedAt:
        typeof member.joinedAt === "string" && member.joinedAt.trim()
          ? member.joinedAt.trim()
          : null,
      readyAt:
        status === "ready"
          ? (typeof member.readyAt === "string" && member.readyAt.trim() ? member.readyAt.trim() : null)
          : null,
      lastActiveAt:
        typeof member.lastActiveAt === "string" && member.lastActiveAt.trim()
          ? member.lastActiveAt.trim()
          : null,
    };
  };
  for (const [userId, member] of Object.entries(meta.partyRosterByUserId)) {
    const actorId =
      meta.actorsByUserId?.[String(userId).trim()] != null
        ? String(meta.actorsByUserId[String(userId).trim()] || "").trim()
        : "";
    const normalizedMember = normalizePartyMember(member, userId, actorId);
    if (!normalizedMember) continue;
    normalizedPartyRoster[normalizedMember.userId] = normalizedMember;
  }
  if (!Object.keys(normalizedPartyRoster).length) {
    for (const [userId, actorId] of Object.entries(meta.actorsByUserId || {})) {
      const resolvedUserId = String(userId || "").trim();
      const resolvedActorId = String(actorId || "").trim();
      if (!resolvedUserId || !resolvedActorId) continue;
      const migrated = normalizePartyMember({
        userId: resolvedUserId,
        userName: knownUsersById.get(resolvedUserId) || `玩家${resolvedUserId}`,
        investigatorId: resolvedActorId,
      }, resolvedUserId, resolvedActorId);
      if (!migrated) continue;
      normalizedPartyRoster[resolvedUserId] = migrated;
    }
  }
  meta.partyRosterByUserId = normalizedPartyRoster;
  meta.partyLockedAt = typeof meta.partyLockedAt === "string" && meta.partyLockedAt.trim()
    ? meta.partyLockedAt.trim()
    : null;
  meta.storyPackId = typeof meta.storyPackId === "string" && meta.storyPackId.trim()
    ? meta.storyPackId.trim()
    : null;
  meta.briefingConfirmedAt = typeof meta.briefingConfirmedAt === "string" && meta.briefingConfirmedAt.trim()
    ? meta.briefingConfirmedAt.trim()
    : null;
  meta.sceneIntroDeliveredAt = typeof meta.sceneIntroDeliveredAt === "string" && meta.sceneIntroDeliveredAt.trim()
    ? meta.sceneIntroDeliveredAt.trim()
    : null;
  return meta;
}

function getPendingInvestigatorDraftForUser(meta = {}, userId = null) {
  ensureConversationControlState(meta);
  const draftMap =
    meta.pendingInvestigatorDraftsByUserId && typeof meta.pendingInvestigatorDraftsByUserId === "object"
      ? meta.pendingInvestigatorDraftsByUserId
      : {};
  const legacyDraft =
    meta.pendingInvestigatorDraft && typeof meta.pendingInvestigatorDraft === "object"
      ? meta.pendingInvestigatorDraft
      : null;
  const legacyOwnerUserId =
    legacyDraft?.ownerUserId != null && String(legacyDraft.ownerUserId).trim()
      ? String(legacyDraft.ownerUserId).trim()
      : "";
  if (userId != null) {
    const resolvedUserId = String(userId).trim();
    if (resolvedUserId && draftMap[resolvedUserId]) {
      return draftMap[resolvedUserId];
    }
    if (!resolvedUserId || !legacyDraft) return null;
    if (legacyOwnerUserId === resolvedUserId) return legacyDraft;
    if (!legacyOwnerUserId && Object.keys(draftMap).length === 0) return legacyDraft;
    return null;
  }
  return legacyDraft;
}

function syncPendingInvestigatorDraftForUser(meta = {}, userId = null) {
  ensureConversationControlState(meta);
  const resolvedUserId = userId != null ? String(userId).trim() : "";
  const draftMap =
    meta.pendingInvestigatorDraftsByUserId && typeof meta.pendingInvestigatorDraftsByUserId === "object"
      ? meta.pendingInvestigatorDraftsByUserId
      : {};
  const legacyDraft =
    meta.pendingInvestigatorDraft && typeof meta.pendingInvestigatorDraft === "object"
      ? meta.pendingInvestigatorDraft
      : null;
  const legacyOwnerUserId =
    legacyDraft?.ownerUserId != null && String(legacyDraft.ownerUserId).trim()
      ? String(legacyDraft.ownerUserId).trim()
      : "";
  const canMigrateLegacyDraft =
    resolvedUserId
    && !draftMap[resolvedUserId]
    && legacyDraft
    && !legacyOwnerUserId
    && Object.keys(draftMap).length === 0;
  if (canMigrateLegacyDraft) {
    const legacyDraft = {
      ...meta.pendingInvestigatorDraft,
      ownerUserId: resolvedUserId,
      ownerUserName: meta.pendingInvestigatorDraft.ownerUserName || null,
    };
    meta.pendingInvestigatorDraftsByUserId[resolvedUserId] = legacyDraft;
  }
  meta.pendingInvestigatorDraft = getPendingInvestigatorDraftForUser(meta, resolvedUserId || null);
  return meta.pendingInvestigatorDraft;
}

function listPartyMembers(meta = {}) {
  ensureConversationControlState(meta);
  return Object.values(meta.partyRosterByUserId || {})
    .filter((member) => member && typeof member === "object" && member.userId)
    .sort((left, right) => {
      const leftTime = typeof left.joinedAt === "string" ? left.joinedAt : "";
      const rightTime = typeof right.joinedAt === "string" ? right.joinedAt : "";
      if (leftTime && rightTime && leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
      return String(left.userId).localeCompare(String(right.userId));
    });
}

function getPartyMember(meta = {}, userId = null) {
  ensureConversationControlState(meta);
  const resolvedUserId = userId != null ? String(userId).trim() : "";
  if (!resolvedUserId) return null;
  return meta.partyRosterByUserId?.[resolvedUserId] || null;
}

function inferPartyMode(meta = {}, sessionState = null) {
  ensureConversationControlState(meta);
  const readyCount = listPartyMembers(meta).filter((member) => {
    const actorId = member?.investigatorId != null ? String(member.investigatorId).trim() : "";
    return actorId && (!sessionState || sessionState.investigators?.[actorId]);
  }).length;
  return readyCount >= 2 ? "group" : "solo";
}

function isPartyLocked(meta = {}) {
  ensureConversationControlState(meta);
  return Boolean(meta.partyLockedAt);
}

function pruneTurnStateToParty(stateBundle, options = {}) {
  ensureConversationControlState(stateBundle.meta);
  const turnState = ensureTurnState(stateBundle.meta);
  const activeActorIds = listPartyMembers(stateBundle.meta)
    .map((member) => member?.investigatorId != null ? String(member.investigatorId).trim() : "")
    .filter((actorId) => actorId && stateBundle.sessionState.investigators?.[actorId]);
  const activeSet = new Set(activeActorIds);
  turnState.actorOrder = turnState.actorOrder.filter((actorId) => activeSet.has(actorId));
  turnState.actorSyncById = Object.fromEntries(
    activeActorIds
      .map((actorId) => {
        const syncEntry = turnState.actorSyncById?.[actorId];
        return syncEntry ? [actorId, syncEntry] : null;
      })
      .filter(Boolean)
  );
  for (const actorId of activeActorIds) {
    if (!turnState.actorOrder.includes(actorId)) {
      turnState.actorOrder.push(actorId);
    }
  }
  if (!turnState.actorOrder.length) {
    turnState.currentActorId = null;
  } else if (!turnState.currentActorId || !activeSet.has(turnState.currentActorId)) {
    turnState.currentActorId = turnState.actorOrder[0];
  }
  if (options.save !== false) {
    stateBundle.meta.updatedAt = new Date().toISOString();
    saveMeta(stateBundle.layout, stateBundle.meta);
  }
  return turnState;
}

function upsertPartyMember(stateBundle, event, options = {}) {
  ensureConversationControlState(stateBundle.meta);
  const userId = event?.user_id != null ? String(event.user_id).trim() : "";
  if (!userId) {
    return { ok: false, blocked: true, reply: "这边没拿到你的 QQ 号，我先没法把你记进本团。" };
  }
  const existing = getPartyMember(stateBundle.meta, userId);
  const mappedActorId =
    stateBundle.meta.actorsByUserId?.[userId] && stateBundle.sessionState.investigators?.[stateBundle.meta.actorsByUserId[userId]]
      ? stateBundle.meta.actorsByUserId[userId]
      : null;
  if (!existing && event?.group_id && isPartyLocked(stateBundle.meta) && !mappedActorId) {
    return {
      ok: false,
      blocked: true,
      reply: [
        "这轮名单已经先锁住了，我先不把新玩家直接塞进场里。",
        "要加人也行，先让场内玩家回一句“解锁队伍”或用 `/aikp unlock-party`。"
      ].join("\n")
    };
  }
  const now = new Date().toISOString();
  const resolvedInvestigatorId = options.investigatorId || existing?.investigatorId || mappedActorId || null;
  const next = {
    userId,
    userName: getSenderName(event),
    status: resolvedInvestigatorId ? "ready" : (existing?.status || "joined"),
    investigatorId: resolvedInvestigatorId,
    joinedAt: existing?.joinedAt || now,
    readyAt: resolvedInvestigatorId ? (existing?.readyAt || now) : (existing?.readyAt || null),
    lastActiveAt: now
  };
  stateBundle.meta.partyRosterByUserId[userId] = next;
  stateBundle.meta.updatedAt = now;
  if (options.save !== false) {
    saveMeta(stateBundle.layout, stateBundle.meta);
  }
  return {
    ok: true,
    member: next,
    created: !existing,
    restoredExistingActor: Boolean(!existing && mappedActorId),
    promotedToReady: Boolean(options.investigatorId && existing?.status !== "ready")
  };
}

function removePartyMember(stateBundle, userId, options = {}) {
  ensureConversationControlState(stateBundle.meta);
  const resolvedUserId = userId != null ? String(userId).trim() : "";
  if (!resolvedUserId) return { removed: null };
  const existing = getPartyMember(stateBundle.meta, resolvedUserId);
  if (!existing) return { removed: null };
  delete stateBundle.meta.partyRosterByUserId[resolvedUserId];
  pruneTurnStateToParty(stateBundle, { save: false });
  stateBundle.meta.updatedAt = new Date().toISOString();
  if (options.save !== false) {
    saveMeta(stateBundle.layout, stateBundle.meta);
  }
  return { removed: existing };
}

function hasProtectedGroupState(stateBundle) {
  if (!stateBundle?.layout?.conversationKey?.startsWith("onebot-group-")) return false;
  if (listPartyMembers(stateBundle.meta).length) return true;
  if (Object.keys(stateBundle.sessionState?.investigators || {}).length) return true;
  if (Object.keys(stateBundle.meta?.actorsByUserId || {}).length) return true;
  return false;
}

function hasGroupControlPrivilege(stateBundle, userId) {
  if (!hasProtectedGroupState(stateBundle)) return true;
  const resolvedUserId = userId != null ? String(userId).trim() : "";
  if (!resolvedUserId) return false;
  if (getPartyMember(stateBundle.meta, resolvedUserId)) return true;
  const actorId = stateBundle.meta?.actorsByUserId?.[resolvedUserId];
  return Boolean(actorId && stateBundle.sessionState?.investigators?.[actorId]);
}

function requireGroupControlPrivilege(stateBundle, event, options = {}) {
  if (!hasProtectedGroupState(stateBundle)) return null;
  if (hasGroupControlPrivilege(stateBundle, event?.user_id)) return null;
  const actionLabel = options.actionLabel || "改这轮共享状态";
  return {
    reply: `这步先让场内玩家来定。你现在还不在本轮名单里，先别直接${actionLabel}。要参团的话，先说“开始建卡”或发 \`/aikp join\`。`
  };
}

function setPartyLocked(stateBundle, locked) {
  ensureConversationControlState(stateBundle.meta);
  stateBundle.meta.partyLockedAt = locked ? new Date().toISOString() : null;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return stateBundle.meta.partyLockedAt;
}

function maybeAutoLockPartyForScene(stateBundle) {
  if (!stateBundle?.layout?.conversationKey?.startsWith("onebot-group-")) return false;
  if (isPartyLocked(stateBundle.meta)) return false;
  if (inferPartyMode(stateBundle.meta, stateBundle.sessionState) !== "group") return false;
  setPartyLocked(stateBundle, true);
  return true;
}

function loadMeta(layout) {
  ensureStorageDirs(layout);
  if (!existsSync(layout.metaFile)) return null;
  const meta = JSON.parse(readFileSync(layout.metaFile, "utf8"));
  ensureConversationControlState(meta);
  ensureSummaryState(meta);
  return meta;
}

function saveMeta(layout, meta) {
  ensureStorageDirs(layout);
  ensureConversationControlState(meta);
  ensureSummaryState(meta);
  writeFileSync(layout.metaFile, JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

function isAiKpCommand(text = "") {
  return String(text).trim().startsWith("/aikp");
}

function normalizeWhitelist(values = []) {
  return new Set((values || []).map((value) => String(value)));
}

function isConversationWhitelisted(event, options = {}) {
  if (!event.group_id) return true;
  if (!Array.isArray(options.groupWhitelist) || !options.groupWhitelist.length) return true;
  return normalizeWhitelist(options.groupWhitelist).has(String(event.group_id));
}

function readConversationMetaSnapshot(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  return {
    layout,
    meta: loadMeta(layout)
  };
}

function getConversationRuntimeState(event, options = {}) {
  const { layout, meta } = readConversationMetaSnapshot(event, options);
  return {
    conversationKey: layout.conversationKey,
    sessionMode: meta?.sessionMode || "idle",
    runtimeProfileId: meta?.runtimeProfileId || "maimai-kp-v1",
    summaryState: cloneJson(meta?.summaryState || {}),
    knownUsers: cloneJson(meta?.knownUsers || []),
    contextRef: layout.contextFile,
    hasContext: existsSync(layout.contextFile),
    hasSession: existsSync(layout.sessionFile)
  };
}

function rememberUser(meta, event) {
  ensureConversationControlState(meta);
  meta.knownUsers = Array.isArray(meta.knownUsers) ? meta.knownUsers : [];
  if (!event.user_id) return meta;
  const userId = String(event.user_id);
  const existing = meta.knownUsers.find((item) => item.userId === userId);
  if (existing) {
    existing.name = getSenderName(event);
  } else {
    meta.knownUsers.push({ userId, name: getSenderName(event) });
  }
  if (meta.partyRosterByUserId?.[userId]) {
    meta.partyRosterByUserId[userId].userName = getSenderName(event);
    meta.partyRosterByUserId[userId].lastActiveAt = new Date().toISOString();
  }
  return meta;
}

function ensureTurnState(meta) {
  meta.turnState = meta.turnState || {
    actorOrder: [],
    currentActorId: null,
    round: 1,
    actorSyncById: {}
  };
  meta.turnState.actorOrder = Array.isArray(meta.turnState.actorOrder) ? meta.turnState.actorOrder : [];
  if (meta.turnState.round == null) meta.turnState.round = 1;
  meta.turnState.actorSyncById =
    meta.turnState.actorSyncById && typeof meta.turnState.actorSyncById === "object"
      ? Object.fromEntries(
        Object.entries(meta.turnState.actorSyncById)
          .map(([actorId, entry]) => {
            const resolvedActorId = String(actorId || "").trim();
            if (!resolvedActorId || !entry || typeof entry !== "object") return null;
            const normalizeMinute = (value, fallback = 0) => {
              const numeric = Number(value);
              return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            };
            const normalizeText = (value) => (
              typeof value === "string" && value.trim()
                ? value.trim()
                : null
            );
            return [resolvedActorId, {
              acknowledgedTimelineMinute: normalizeMinute(entry.acknowledgedTimelineMinute, 0),
              lastActionTimelineMinute: normalizeMinute(entry.lastActionTimelineMinute, 0),
              lastActionSummary: normalizeText(entry.lastActionSummary),
              pendingFromActorId: normalizeText(entry.pendingFromActorId),
              pendingFromActorName: normalizeText(entry.pendingFromActorName),
              pendingActionSummary: normalizeText(entry.pendingActionSummary),
              pendingTimelineMinute: normalizeMinute(entry.pendingTimelineMinute, 0),
            }];
          })
          .filter(Boolean)
      )
      : {};
  return meta.turnState;
}

function getSceneTimelineMinute(sessionState) {
  const minute = Number(sessionState?.scene?.timeState?.timelineMinute || 0);
  return Number.isFinite(minute) && minute >= 0 ? minute : 0;
}

function ensureActorSoftTimeState(stateBundle, actorId, options = {}) {
  const resolvedActorId = actorId != null ? String(actorId).trim() : "";
  if (!resolvedActorId) return null;
  const turnState = ensureTurnState(stateBundle.meta);
  const currentMinute = getSceneTimelineMinute(stateBundle.sessionState);
  const existing = turnState.actorSyncById[resolvedActorId];
  const next = {
    acknowledgedTimelineMinute: Number.isFinite(Number(existing?.acknowledgedTimelineMinute))
      ? Math.max(0, Number(existing.acknowledgedTimelineMinute))
      : currentMinute,
    lastActionTimelineMinute: Number.isFinite(Number(existing?.lastActionTimelineMinute))
      ? Math.max(0, Number(existing.lastActionTimelineMinute))
      : currentMinute,
    lastActionSummary: typeof existing?.lastActionSummary === "string" && existing.lastActionSummary.trim()
      ? existing.lastActionSummary.trim()
      : null,
    pendingFromActorId: typeof existing?.pendingFromActorId === "string" && existing.pendingFromActorId.trim()
      ? existing.pendingFromActorId.trim()
      : null,
    pendingFromActorName: typeof existing?.pendingFromActorName === "string" && existing.pendingFromActorName.trim()
      ? existing.pendingFromActorName.trim()
      : null,
    pendingActionSummary: typeof existing?.pendingActionSummary === "string" && existing.pendingActionSummary.trim()
      ? existing.pendingActionSummary.trim()
      : null,
    pendingTimelineMinute: Number.isFinite(Number(existing?.pendingTimelineMinute))
      ? Math.max(0, Number(existing.pendingTimelineMinute))
      : currentMinute,
  };
  if (options.acknowledgeCurrent === true) {
    next.acknowledgedTimelineMinute = currentMinute;
    next.pendingFromActorId = null;
    next.pendingFromActorName = null;
    next.pendingActionSummary = null;
    next.pendingTimelineMinute = currentMinute;
  }
  turnState.actorSyncById[resolvedActorId] = next;
  return next;
}

function getActorSoftTimeStatus(stateBundle, actorId) {
  const resolvedActorId = actorId != null ? String(actorId).trim() : "";
  if (!resolvedActorId) return null;
  if (inferPartyMode(stateBundle.meta, stateBundle.sessionState) !== "group") return null;
  if (stateBundle.sessionState?.scene?.sceneType === "combat") return null;
  const entry = ensureActorSoftTimeState(stateBundle, resolvedActorId);
  if (!entry) return null;
  const currentMinute = getSceneTimelineMinute(stateBundle.sessionState);
  return {
    actorId: resolvedActorId,
    acknowledgedTimelineMinute: Math.min(currentMinute, Number(entry.acknowledgedTimelineMinute || 0)),
    currentMinute,
    owedMinutes: Math.max(0, currentMinute - Number(entry.acknowledgedTimelineMinute || 0)),
    lastActionSummary: entry.lastActionSummary || null,
    pendingFromActorId: entry.pendingFromActorId || null,
    pendingFromActorName: entry.pendingFromActorName || null,
    pendingActionSummary: entry.pendingActionSummary || null,
    pendingTimelineMinute: Number(entry.pendingTimelineMinute || currentMinute),
  };
}

function formatSoftTimeLagTag(stateBundle, actorId) {
  const status = getActorSoftTimeStatus(stateBundle, actorId);
  if (!status?.owedMinutes) return null;
  return `待同步 +${status.owedMinutes} 分钟`;
}

function formatActorSoftTimeCue(stateBundle, actorId) {
  const status = getActorSoftTimeStatus(stateBundle, actorId);
  if (!status?.owedMinutes) return null;
  const actor = stateBundle.sessionState.investigators?.[status.actorId];
  const actorName = actor?.name || "这位调查员";
  const causeLine =
    status.pendingFromActorName && status.pendingFromActorName !== actorName
      ? `刚才主要是 ${status.pendingFromActorName} 在处理 ${status.pendingActionSummary || "那步行动"}`
      : (status.pendingActionSummary ? `刚才场里主要落的是 ${status.pendingActionSummary}` : null);
  return causeLine
    ? `${actorName} 这边也一起过去了 ${status.owedMinutes} 分钟；${causeLine}，现在直接按眼下时间线接就行。`
    : `${actorName} 这边也一起过去了 ${status.owedMinutes} 分钟，现在直接按眼下时间线接就行。`;
}

function consumeActorSoftTimeCue(stateBundle, actorId) {
  const cue = formatActorSoftTimeCue(stateBundle, actorId);
  if (!cue) return null;
  ensureActorSoftTimeState(stateBundle, actorId, { acknowledgeCurrent: true });
  return cue;
}

function recordResolvedTurnSoftTime(stateBundle, actorId, options = {}) {
  const resolvedActorId = actorId != null ? String(actorId).trim() : "";
  if (!resolvedActorId) return null;
  if (inferPartyMode(stateBundle.meta, stateBundle.sessionState) !== "group") return null;
  if (stateBundle.sessionState?.scene?.sceneType === "combat") return null;

  const beforeMinute = getSceneTimelineMinute(options.beforeSessionState);
  const afterMinute = getSceneTimelineMinute(stateBundle.sessionState);
  const minuteDelta = Math.max(0, afterMinute - beforeMinute);
  const turnState = ensureTurnState(stateBundle.meta);
  pruneTurnStateToParty(stateBundle, { save: false });
  const activeActorIds = turnState.actorOrder.filter((candidateActorId) => stateBundle.sessionState.investigators?.[candidateActorId]);
  if (!activeActorIds.length || !activeActorIds.includes(resolvedActorId)) return null;

  const resolvedActor = stateBundle.sessionState.investigators?.[resolvedActorId];
  const actionSummary =
    typeof options.actionSummary === "string" && options.actionSummary.trim()
      ? options.actionSummary.trim()
      : null;
  const resolvedEntry = ensureActorSoftTimeState(stateBundle, resolvedActorId, { acknowledgeCurrent: true });
  resolvedEntry.lastActionTimelineMinute = afterMinute;
  resolvedEntry.lastActionSummary = actionSummary;

  if (!minuteDelta) {
    return {
      minuteDelta,
      currentMinute: afterMinute,
      actorIds: activeActorIds
    };
  }

  for (const candidateActorId of activeActorIds) {
    if (candidateActorId === resolvedActorId) continue;
    const entry = ensureActorSoftTimeState(stateBundle, candidateActorId);
    entry.pendingFromActorId = resolvedActorId;
    entry.pendingFromActorName = resolvedActor?.name || null;
    entry.pendingActionSummary = actionSummary;
    entry.pendingTimelineMinute = afterMinute;
  }

  return {
    minuteDelta,
    currentMinute: afterMinute,
    actorIds: activeActorIds
  };
}

function buildInitialMeta(event, layout, scenarioId, options = {}) {
  const meta = {
    conversationKey: layout.conversationKey,
    sessionFile: layout.sessionFile,
    scenarioId,
    storyPackId: options.storyPackId || null,
    briefingConfirmedAt: null,
    sceneIntroDeliveredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actorsByUserId: {},
    knownUsers: [],
    messageCount: 0,
    sessionMode: "idle",
    runtimeProfileId: "maimai-kp-v1",
    turnState: {
      actorOrder: [],
      currentActorId: null,
      round: 1,
      actorSyncById: {}
    }
  };
  ensureConversationControlState(meta);
  ensureSummaryState(meta);
  rememberUser(meta, event);
  return meta;
}

function ensureConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  const campaignId = options.campaignId || "old-church-arc";
  const storyPackId = options.storyPackId || null;
  let meta = loadMeta(layout);
  let sessionState;

  if (meta && existsSync(layout.sessionFile)) {
    sessionState = loadSessionApi(layout.sessionFile);
    ensureSummaryState(meta);
    ensureConversationControlState(meta);
    if (!meta.sessionMode) meta.sessionMode = "idle";
    if (!meta.runtimeProfileId) meta.runtimeProfileId = "maimai-kp-v1";
    rememberUser(meta, event);
    syncPendingInvestigatorDraftForUser(meta, event?.user_id);
    saveMeta(layout, meta);
    return { layout, meta, sessionState, created: false };
  }

  sessionState = startSessionApi({
    sessionId: `onebot-${layout.conversationKey}`,
    scenarioId
  });
  attachCampaignMeta(sessionState, loadCampaignTemplate(campaignId));
  saveSessionApi(sessionState, layout.sessionFile, { meta: { conversationKey: layout.conversationKey } });
  meta = buildInitialMeta(event, layout, scenarioId, { storyPackId });
  meta.campaignId = campaignId;
  saveMeta(layout, meta);
  return { layout, meta, sessionState, created: true };
}

function rebuildConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  const campaignId = options.campaignId || "old-church-arc";
  const storyPackId = options.storyPackId || null;
  const sessionState = startSessionApi({ sessionId: `onebot-${layout.conversationKey}`, scenarioId });
  attachCampaignMeta(sessionState, loadCampaignTemplate(campaignId));
  const meta = buildInitialMeta(event, layout, scenarioId, { storyPackId });
  meta.campaignId = campaignId;
  syncPendingInvestigatorDraftForUser(meta, event?.user_id);
  saveSessionApi(sessionState, layout.sessionFile, { meta: { conversationKey: layout.conversationKey } });
  saveMeta(layout, meta);
  return { layout, meta, sessionState, created: true };
}

function maybeResetSession(event, options = {}) {
  if (!options.reset) return ensureConversationSession(event, options);
  return rebuildConversationSession(event, options);
}

function calculateOccupationBudget(attributes, formula) {
  if (formula === "EDUx4") return attributes.EDU * 4;
  if (formula === "EDUx2+DEXx2") return (attributes.EDU * 2) + (attributes.DEX * 2);
  if (formula === "EDUx2+APPx2") return (attributes.EDU * 2) + (attributes.APP * 2);
  if (formula === "EDUx2+STRx2") return (attributes.EDU * 2) + (attributes.STR * 2);
  return attributes.EDU * 4;
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function guessSkillTag(skillKey = "") {
  if (["Spot Hidden", "Listen", "Psychology", "Library Use", "History", "Law", "Science", "Science (Biology)", "Science (Pharmacy)", "Own Language", "Language (Other)", "Medicine", "First Aid"].includes(skillKey)) {
    return "investigation";
  }
  if (["Persuade", "Fast Talk", "Charm", "Intimidate", "Credit Rating", "Psychology"].includes(skillKey)) {
    return "social";
  }
  if (["Fighting", "Firearms", "Stealth", "Dodge", "Climb", "Throw", "Survival", "Disguise", "Locksmith"].includes(skillKey)) {
    return "action";
  }
  return "other";
}

function normalizeSuggestedSkills(skills = []) {
  return uniqueList(skills.map((skill) => {
    if (skill === "Any Interpersonal") return "Persuade";
    return skill;
  }));
}

function allocatePool(skillMap, keys, field, budget, capMap = {}) {
  let remaining = budget;
  let safety = 0;

  while (remaining >= 5 && safety < 2000) {
    safety += 1;
    let progressed = false;

    for (const key of keys) {
      if (remaining < 5) break;
      const skill = skillMap.get(key);
      if (!skill) continue;
      const current = skill.baseValue + skill.occupationPointsSpent + skill.interestPointsSpent;
      const cap = capMap[key] ?? 75;
      if (current >= cap) continue;
      skill[field] += 5;
      remaining -= 5;
      progressed = true;
    }

    if (!progressed) break;
  }

  return remaining;
}

function buildStarterSkills(attributes, occupation, creditRating, options = {}) {
  const occupationSkills = uniqueList([
    ...normalizeSuggestedSkills(occupation.suggestedSkills || []),
    "Credit Rating"
  ]);
  const defaultInterestSkills = uniqueList([
    ...occupationSkills,
    "Spot Hidden",
    "Listen",
    "Psychology",
    "Persuade",
    "Stealth",
    "Fighting",
    "Library Use",
    "First Aid"
  ]);
  const preferredSkills = uniqueList(options.preferredSkills || []);
  const preferredOccupationSkills = preferredSkills.filter((skillKey) => occupationSkills.includes(skillKey) && skillKey !== "Credit Rating");
  const preferredInterestSkills = uniqueList((options.preferredInterestSkills || preferredSkills).filter((skillKey) => skillKey !== "Credit Rating"));
  const interestSkills = uniqueList([
    ...preferredInterestSkills,
    ...defaultInterestSkills
  ]);

  const skillMap = new Map();
  const ensureSkill = (key) => {
    if (!skillMap.has(key)) {
      skillMap.set(key, {
        key,
        tag: guessSkillTag(key),
        baseValue: resolveSkillDefault(key, { attributes }),
        occupationPointsSpent: 0,
        interestPointsSpent: 0
      });
    }
    return skillMap.get(key);
  };

  occupationSkills.forEach(ensureSkill);
  interestSkills.forEach(ensureSkill);

  const occupationBudget = calculateOccupationBudget(attributes, occupation.occupationSkillFormula);
  const interestBudget = attributes.INT * 2;

  let remainingOccupation = occupationBudget;
  if (skillMap.has("Credit Rating")) {
    const creditSkill = skillMap.get("Credit Rating");
    const needed = Math.max(0, creditRating - creditSkill.baseValue);
    const allocated = Math.min(needed, remainingOccupation);
    creditSkill.occupationPointsSpent += allocated;
    remainingOccupation -= allocated;
  }

  remainingOccupation = allocatePool(skillMap, uniqueList([
    ...preferredOccupationSkills,
    ...occupationSkills
  ]), "occupationPointsSpent", remainingOccupation, {
    "Credit Rating": Math.max(creditRating, 75),
    "Own Language": 90
  });
  if (remainingOccupation >= 5) {
    allocatePool(skillMap, occupationSkills, "occupationPointsSpent", remainingOccupation, {
      "Credit Rating": Math.max(creditRating, 75),
      "Own Language": 90
    });
  }

  let remainingInterest = allocatePool(
    skillMap,
    preferredInterestSkills.length ? preferredInterestSkills : defaultInterestSkills,
    "interestPointsSpent",
    interestBudget,
    {
      "Own Language": 90
    },
  );
  if (remainingInterest >= 5) {
    allocatePool(skillMap, interestSkills, "interestPointsSpent", remainingInterest, {
      "Own Language": 90
    });
  }

  return Array.from(skillMap.values()).map((skill) => ({
    ...skill,
    value: Math.min(99, skill.baseValue + skill.occupationPointsSpent + skill.interestPointsSpent)
  }));
}

function formatSkillPreferenceList(skills = []) {
  if (!skills.length) return "（当前职业没有预设技能）";
  return skills.join("、");
}

function createTraditionalDraft(event, occupationKey = null, randomInt = defaultRandomInt) {
  const generated = generateTraditionalAttributesDetailed(randomInt);
  return {
    stage: occupationKey ? "skills" : "occupation",
    mode: "traditional",
    ownerUserId: event?.user_id != null ? String(event.user_id) : null,
    ownerUserName: getSenderName(event),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    occupationKey: occupationKey || null,
    creditRating: occupationKey ? pickCreditRating(getOccupationTemplate(occupationKey)) : null,
    attributes: { ...generated.attributes },
    breakdown: generated.breakdown
  };
}

function setPendingInvestigatorDraft(stateBundle, draft) {
  ensureConversationControlState(stateBundle.meta);
  const resolvedUserId = findDraftOwnerUserId(stateBundle, draft)
    || (stateBundle.meta.pendingInvestigatorDraft?.ownerUserId != null
      ? String(stateBundle.meta.pendingInvestigatorDraft.ownerUserId).trim()
      : "");
  const ownerUser = findKnownUserById(stateBundle.meta, resolvedUserId);
  const normalizedDraft = draft
    ? {
      ...draft,
      ownerUserId: resolvedUserId || null,
      ownerUserName:
        typeof draft.ownerUserName === "string" && draft.ownerUserName.trim()
          ? draft.ownerUserName.trim()
          : ownerUser?.name || stateBundle.meta.pendingInvestigatorDraft?.ownerUserName || null,
    }
    : null;
  if (resolvedUserId && normalizedDraft) {
    stateBundle.meta.pendingInvestigatorDraftsByUserId[resolvedUserId] = normalizedDraft;
  }
  stateBundle.meta.pendingInvestigatorDraft = normalizedDraft;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return stateBundle.meta.pendingInvestigatorDraft;
}

function clearPendingInvestigatorDraft(stateBundle) {
  ensureConversationControlState(stateBundle.meta);
  const resolvedUserId =
    stateBundle.meta.pendingInvestigatorDraft?.ownerUserId != null
      ? String(stateBundle.meta.pendingInvestigatorDraft.ownerUserId).trim()
      : "";
  if (resolvedUserId) {
    delete stateBundle.meta.pendingInvestigatorDraftsByUserId[resolvedUserId];
  }
  stateBundle.meta.pendingInvestigatorDraft = null;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
}

function setPendingSceneActionChoice(stateBundle, pendingChoice) {
  stateBundle.meta.pendingSceneActionChoice = pendingChoice;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return stateBundle.meta.pendingSceneActionChoice;
}

function clearPendingSceneActionChoice(stateBundle) {
  stateBundle.meta.pendingSceneActionChoice = null;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
}

function applySceneMethodChoice(action, option) {
  return {
    ...cloneJson(action),
    skillKey: option.skillKey,
    interactionStyle: option.interactionStyle,
    riskLevel: option.riskLevel || action.riskLevel,
  };
}

function resolveSceneActionChoice(stateBundle, actorId, originalText, action) {
  if (!action) {
    return { action };
  }

  const investigator = stateBundle.sessionState.investigators?.[actorId];
  if (!investigator) {
    return { action };
  }

  const config = buildSceneMethodChoiceConfig(investigator, action, originalText);
  if (!config) {
    return { action };
  }

  const options = config.options || [];
  const explicitChoice = detectSceneMethodOptionFromText(originalText, options, "initial");
  if (explicitChoice) {
    const explicitOption = options.find((option) => option.id === explicitChoice.id);
    if (explicitOption) {
      return { action: applySceneMethodChoice(action, explicitOption) };
    }
  }

  if (options.length <= 1) {
    return {
      action: options.length === 1 ? applySceneMethodChoice(action, options[0]) : action
    };
  }

  const pendingChoice = bindPendingSceneChoiceOwner(stateBundle, {
    kind: config.kind,
    actorId,
    originalText,
    action: cloneJson(action),
    targetNpcName: options[0]?.targetNpcName || action.targetNpc || "对方",
    promptLine: config.promptLine || null,
    optionLead: config.optionLead || null,
    replyHintLine: config.replyHintLine || null,
    options: options.map((option) => ({
      id: option.id,
      displayLabel: option.displayLabel,
      skillKey: option.skillKey,
      skillValue: option.skillValue,
      interactionStyle: option.interactionStyle,
      riskLevel: option.riskLevel,
      playerHint: option.playerHint,
      recommended: option.recommended,
      initialHints: option.initialHints || [],
      replyHints: option.replyHints || [],
    })),
    askedAt: new Date().toISOString()
  });
  setPendingSceneActionChoice(stateBundle, pendingChoice);
  return {
    reply: formatSceneActionChoiceReply(pendingChoice),
    pendingChoice
  };
}

function handlePendingSceneActionChoice(text, stateBundle) {
  return handlePendingSceneActionChoiceWithOptions(text, stateBundle, {});
}

function buildForcedSuccessRandomInt(targetValue) {
  let firstRoll = true;
  return (min, max) => {
    if (firstRoll && min === 1 && max === 100) {
      firstRoll = false;
      return Math.max(min, Math.min(max, Number(targetValue || min)));
    }
    return Math.max(min, Math.min(max, Math.floor((min + max) / 2)));
  };
}

function buildPostCheckChoice(stateBundle, action, turnResult, beforeSessionState, investigator) {
  const event = turnResult?.event;
  if (!event?.result || event.result.success || event.mode === "hidden") return null;
  if (event.result.successLevel === "fumble") return null;
  const ruleGuidance = turnResult?.ruleGuidance || event?.ruleGuidance || event?.adjudication?.ruleGuidance || null;
  const luckCost = Math.max(0, Number(event.roll || 0) - Number(event.targetValue || 0));
  const canSpendLuck = luckCost > 0 && Number(investigator?.resources?.luck || 0) >= luckCost;
  const canPush = ["explore", "talk", "use_item", "risky_action", "steal", "follow"].includes(action?.kind) && action?.pushed !== true;
  if (!canSpendLuck && !canPush) return null;

  const pendingChoice = bindPendingSceneChoiceOwner(stateBundle, {
    kind: "post_check_choice",
    askedAt: new Date().toISOString(),
    actorId: action.actorId,
    action: cloneJson(action),
    beforeSessionState: cloneJson(beforeSessionState),
    result: cloneJson(turnResult),
    originalRoll: Number(event.roll || 0),
    targetValue: Number(event.targetValue || 0),
    luckCost,
    targetNpcName: action.targetNpc || null,
    failureLine: formatCheckResultLine(event),
    failForwardLine: ruleGuidance?.failurePreview || null,
    penaltyNote: ruleGuidance?.penaltyNote || null,
    crisisNote: ruleGuidance?.crisisNote || null,
    options: [
      {
        id: "accept",
        displayLabel: "接受当前结果",
        playerHint: ruleGuidance?.acceptLine || "按现在这个失败后果继续往下走。"
      },
      ...(canPush ? [{
        id: "push",
        displayLabel: "推骰再试",
        playerHint: [ruleGuidance?.pushLine || "再赌一次；要是还没过，后果会更难看。", ruleGuidance?.crisisNote].filter(Boolean).join(" ")
      }] : []),
      ...(canSpendLuck ? [{
        id: "luck",
        displayLabel: `花幸运 ${luckCost}`,
        playerHint: `直接把这次失败拽到成功，但会扣掉 ${luckCost} 点幸运。${ruleGuidance?.penaltyNote ? " 眼下环境本身没变，后面的压力照样在。" : ""}`
      }] : [])
    ]
  });
  setPendingSceneActionChoice(stateBundle, pendingChoice);
  return pendingChoice;
}

function handlePendingSceneActionChoiceWithOptions(text, stateBundle, options = {}) {
  const normalizedPendingChoice = bindPendingSceneChoiceOwner(stateBundle, stateBundle.meta.pendingSceneActionChoice);
  if (
    normalizedPendingChoice
    && normalizedPendingChoice !== stateBundle.meta.pendingSceneActionChoice
  ) {
    setPendingSceneActionChoice(stateBundle, normalizedPendingChoice);
  }
  const pendingChoice = normalizedPendingChoice;
  if (!pendingChoice || !text || isAiKpCommand(text)) return null;
  const currentUserId = options.event?.user_id != null ? String(options.event.user_id).trim() : "";
  const owner = resolvePendingSceneChoiceOwner(stateBundle, pendingChoice);
  if (owner.userId && currentUserId && owner.userId !== currentUserId) {
    return {
      reply: formatPendingSceneChoiceOwnerReply(stateBundle, pendingChoice)
    };
  }

  if (pendingChoice.kind === "post_check_choice") {
    const selected = detectPostCheckChoice(text);
    if (selected === "accept") {
      clearPendingSceneActionChoice(stateBundle);
      return {
        action: cloneJson(pendingChoice.action),
        result: cloneJson(pendingChoice.result),
        beforeSessionState: cloneJson(pendingChoice.beforeSessionState),
        selectedOption: { displayLabel: "接受当前结果" },
        skipPostCheckChoice: true
      };
    }

    if ((selected === "push" || selected === "luck") && pendingChoice.beforeSessionState && pendingChoice.action) {
      clearPendingSceneActionChoice(stateBundle);
      stateBundle.sessionState = cloneJson(pendingChoice.beforeSessionState);
      const investigator = stateBundle.sessionState.investigators?.[pendingChoice.actorId];
      const action = cloneJson(pendingChoice.action);
      let rerollRandomInt = options.randomInt || defaultRandomInt;

      if (selected === "push") {
        action.pushed = true;
      }

      if (selected === "luck") {
        rerollRandomInt = buildForcedSuccessRandomInt(pendingChoice.targetValue || 1);
      }

      const result = (options.submitAction || require("../../core/src/api").submitAction)(
        stateBundle.sessionState,
        action,
        rerollRandomInt
      );
      if (selected === "luck" && investigator) {
        investigator.resources.luck = Math.max(0, Number(investigator.resources.luck || 0) - Number(pendingChoice.luckCost || 0));
        investigator.attributeChecks.Luck = {
          value: investigator.resources.luck,
          half: Math.floor(investigator.resources.luck / 2),
          fifth: Math.floor(investigator.resources.luck / 5)
        };
      }
      return {
        action,
        selectedOption: { displayLabel: selected === "push" ? "推骰再试" : "花幸运" },
        result
      };
    }

    return {
      reply: formatSceneActionChoiceReply(pendingChoice, { repeat: true })
    };
  }

  const selected = detectSceneMethodOptionFromText(text, pendingChoice.options || [], "reply")
    || detectSocialMethodFromText(text, "reply");
  if (selected) {
    const selectedOption = (pendingChoice.options || []).find((option) => option.id === selected.id);
    if (selectedOption) {
      clearPendingSceneActionChoice(stateBundle);
      return {
        action: applySceneMethodChoice(pendingChoice.action, selectedOption),
        selectedOption
      };
    }
  }

  const normalized = normalizeIntentText(text);
  const looksLikeFreshAction =
    normalized.length >= 6 &&
    !includesAny(normalized, ["好", "行", "嗯", "哦", "啊", "推荐哪个", "哪个好", "你觉得"]);
  if (looksLikeFreshAction) {
    clearPendingSceneActionChoice(stateBundle);
    return { passThrough: true };
  }

  return {
    reply: formatSceneActionChoiceReply(pendingChoice, { repeat: true })
  };
}

function formatTraditionalDraftIntroLines(draft) {
  return [
    "先把这张调查员的属性掷出来啦：",
    ...formatTraditionalBreakdownLines(draft.breakdown || [])
  ];
}

function formatOccupationChoiceReply(draft) {
  const lines = [
    ...formatTraditionalDraftIntroLines(draft),
    "",
    "下一步先定职业。你可以直接回职业名，比如：记者、图书管理员、神职人员、警探、护士。",
    `当前可选职业：${listOccupationTemplates().map((occupation) => `${occupation.name}(${occupation.key})`).join("、")}`
  ];
  return lines.join("\n");
}

function formatSkillAllocationPrompt(draft) {
  const occupation = getOccupationTemplate(draft.occupationKey);
  const occupationBudget = calculateOccupationBudget(draft.attributes, occupation.occupationSkillFormula);
  const interestBudget = draft.attributes.INT * 2;
  const lines = [
    ...formatTraditionalDraftIntroLines(draft),
    "",
    `职业先定成 ${occupation.name}。`,
    `职业技能点：${occupation.occupationSkillFormula} = ${occupationBudget} 点｜兴趣点：INTx2 = ${interestBudget} 点。`,
    `信用评级范围：${occupation.creditRatingRange?.[0] ?? 0}-${occupation.creditRatingRange?.[1] ?? 99}（默认会取中间值 ${pickCreditRating(occupation)}）。`,
    `这个职业常用技能：${formatSkillPreferenceList(normalizeSuggestedSkills(occupation.suggestedSkills || []))}。`,
    "你现在可以直接说想重点拉高哪些技能，也可以顺手给信用评级，比如：",
    "“信用20，侦查、图书馆、心理学、说服”",
    "“我想主走斗殴、射击、潜行，再带一点急救”",
    "不想细配的话，回“自动分配”也行。"
  ];
  return lines.join("\n");
}

function buildTraditionalSkillsFromDraft(draft, text = "") {
  const occupation = getOccupationTemplate(draft.occupationKey);
  const preferredSkills = extractSkillKeysFromText(text);
  const creditRating = extractCreditRatingChoice(text, occupation) || draft.creditRating || pickCreditRating(occupation);
  return {
    creditRating,
    preferredSkills,
    skills: buildStarterSkills(draft.attributes, occupation, creditRating, {
      preferredSkills
    })
  };
}

function formatFinalizedTraditionalReply(bundle, preferences = {}) {
  const lines = [formatGeneratedInvestigatorReply(bundle)];
  if (preferences.creditRating != null) {
    lines.push(`这次我按信用评级 ${preferences.creditRating} 来配职业面。`);
  }
  if (Array.isArray(preferences.preferredSkills) && preferences.preferredSkills.length) {
    lines.push(`偏重点我按这些技能先拉了一版：${preferences.preferredSkills.join("、")}。`);
  }
  return lines.join("\n");
}

function beginTraditionalDraft(event, stateBundle, occupationKey = null, randomInt = defaultRandomInt) {
  const draft = createTraditionalDraft(event, occupationKey, randomInt);
  setPendingInvestigatorDraft(stateBundle, draft);
  return {
    draft,
    reply: occupationKey ? formatSkillAllocationPrompt(draft) : formatOccupationChoiceReply(draft)
  };
}

function applyTraditionalDraftOccupation(stateBundle, occupationKey) {
  const draft = stateBundle.meta.pendingInvestigatorDraft;
  if (!draft) return null;
  draft.occupationKey = occupationKey;
  draft.creditRating = pickCreditRating(getOccupationTemplate(occupationKey));
  draft.stage = "skills";
  draft.updatedAt = new Date().toISOString();
  setPendingInvestigatorDraft(stateBundle, draft);
  return {
    draft,
    reply: formatSkillAllocationPrompt(draft)
  };
}

function getPendingDraftInvestigator(stateBundle, draft = null) {
  const currentDraft = draft || stateBundle.meta.pendingInvestigatorDraft;
  const investigatorId = currentDraft?.investigatorId;
  if (!investigatorId) return null;
  return stateBundle.sessionState.investigators?.[investigatorId] || null;
}

function beginInvestigatorReviewFlow(stateBundle, bundle, options = {}) {
  refreshInvestigatorComputedFields(bundle.investigator);
  const draft = {
    stage: "profile",
    mode: bundle.mode,
    investigatorId: bundle.investigator.id,
    occupationKey: bundle.occupationKey,
    createdAt: stateBundle.meta.pendingInvestigatorDraft?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    creditRating: bundle.investigator.identity?.creditRating ?? null,
    generation: cloneJson(bundle.generation || {}),
    preferences: cloneJson(options.preferences || {})
  };
  setPendingInvestigatorDraft(stateBundle, draft);
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  return {
    draft,
    suppressSceneStart: true,
    reply: [
      options.baseReply || formatGeneratedInvestigatorReply(bundle),
      "",
      formatDraftProfilePrompt(bundle.investigator)
    ].join("\n")
  };
}

function applyInvestigatorProfileDraft(text, stateBundle) {
  const draft = stateBundle.meta.pendingInvestigatorDraft;
  const investigator = getPendingDraftInvestigator(stateBundle, draft);
  if (!draft || !investigator) return null;
  const parsed = parseProfileDraftUpdates(text, investigator);
  if (!parsed.recognized) {
    return { reply: formatDraftProfilePrompt(investigator) };
  }

  investigator.name = parsed.updates.name || investigator.name;
  investigator.age = parsed.updates.age ?? investigator.age;
  investigator.persona = parsed.updates.persona || investigator.persona;
  investigator.motivation = parsed.updates.motivation || investigator.motivation;
  refreshInvestigatorComputedFields(investigator);
  draft.stage = "gear";
  draft.updatedAt = new Date().toISOString();
  setPendingInvestigatorDraft(stateBundle, draft);
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  return {
    draft,
    reply: [
      `收到，我先把人物这边调成：${investigator.name}，${investigator.age} 岁。`,
      formatDraftGearPrompt(investigator)
    ].join("\n")
  };
}

function applyInvestigatorGearDraft(text, stateBundle) {
  const draft = stateBundle.meta.pendingInvestigatorDraft;
  const investigator = getPendingDraftInvestigator(stateBundle, draft);
  if (!draft || !investigator) return null;
  const parsed = parseInventoryDraftItems(text, investigator.inventory || buildDefaultInventory());
  if (!parsed.recognized) {
    return { reply: formatDraftGearPrompt(investigator) };
  }

  investigator.inventory = parsed.items;
  refreshInvestigatorComputedFields(investigator);
  draft.stage = "lock";
  draft.updatedAt = new Date().toISOString();
  setPendingInvestigatorDraft(stateBundle, draft);
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  return {
    draft,
    reply: formatDraftLockPrompt(investigator)
  };
}

function finalizeInvestigatorDraftLock(stateBundle) {
  const draft = stateBundle.meta.pendingInvestigatorDraft;
  const investigator = getPendingDraftInvestigator(stateBundle, draft);
  if (!draft || !investigator) return null;
  clearPendingInvestigatorDraft(stateBundle);
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  return {
    investigator,
    deliverStartReply: true,
    reply: `好，这张卡锁住了。\n当前绑定调查员：${investigator.name}。`
  };
}

function finalizeTraditionalDraft(event, stateBundle, text = "", randomInt = defaultRandomInt) {
  const draft = stateBundle.meta.pendingInvestigatorDraft;
  if (!draft?.occupationKey) return null;
  const autoAllocate = wantsAutoSkillAllocation(text);
  const parsed = buildTraditionalSkillsFromDraft(draft, autoAllocate ? "" : text);
  if (!autoAllocate && !parsed.preferredSkills.length) {
    return {
      reply: `我先知道你想偏哪些技能，才能把这张卡配得更像 CoC 7 版那种手感喔。\n${formatSkillAllocationPrompt(draft)}`
    };
  }

  const bundle = {
    generation: {
      breakdown: draft.breakdown
    },
    mode: "traditional",
    occupationKey: draft.occupationKey,
    investigator: createInvestigatorFromTraditional({
      ...buildGeneratedBase(event, draft.occupationKey),
      creditRating: parsed.creditRating,
      luck: draft.attributes.Luck,
      attributeAssignments: {
        STR: draft.attributes.STR,
        CON: draft.attributes.CON,
        DEX: draft.attributes.DEX,
        APP: draft.attributes.APP,
        POW: draft.attributes.POW,
        SIZ: draft.attributes.SIZ,
        INT: draft.attributes.INT,
        EDU: draft.attributes.EDU
      },
      skills: parsed.skills,
      inventory: buildDefaultInventory()
    }, randomInt)
  };
  upsertInvestigatorForUser(event, stateBundle, bundle.investigator);
  return {
    bundle,
    preferences: {
      creditRating: parsed.creditRating,
      preferredSkills: parsed.preferredSkills
    },
    ...beginInvestigatorReviewFlow(stateBundle, bundle, {
      preferences: {
        creditRating: parsed.creditRating,
        preferredSkills: parsed.preferredSkills
      },
      baseReply: formatFinalizedTraditionalReply(bundle, {
        creditRating: parsed.creditRating,
        preferredSkills: parsed.preferredSkills
      })
    })
  };
}

function handlePendingInvestigatorDraft(text, event, stateBundle, options = {}) {
  const draft = stateBundle.meta.pendingInvestigatorDraft;
  if (!draft || !text || isAiKpCommand(text)) return null;
  const randomInt = options.randomInt || defaultRandomInt;
  const normalized = normalizeIntentText(text);
  const currentInvestigator = getPendingDraftInvestigator(stateBundle, draft);
  const naturalIntent = detectNaturalIntent(text, {
    actorId: currentInvestigator?.id || null,
    investigator: currentInvestigator || null
  });

  if (naturalIntent && ["exit", "resume", "new", "start", "state", "recap", "party"].includes(naturalIntent.kind)) {
    return { passThrough: true };
  }

  if (includesAny(normalized, ["quickfire", "快速车卡", "快速建卡", "快车卡", "快速卡"])) {
    const occupationKey = extractOccupationKeyFromText(text) || draft.occupationKey || "journalist";
    const bundle = createInvestigatorForMode(event, "quickfire", occupationKey, randomInt);
    upsertInvestigatorForUser(event, stateBundle, bundle.investigator);
    return {
      bundle,
      ...beginInvestigatorReviewFlow(stateBundle, bundle, {
        baseReply: formatGeneratedInvestigatorReply(bundle)
      })
    };
  }

  if (draft.stage === "occupation") {
    const occupationKey = extractOccupationKeyFromText(text);
    if (!occupationKey) {
      return { reply: formatOccupationChoiceReply(draft) };
    }
    const applied = applyTraditionalDraftOccupation(stateBundle, occupationKey);
    const occupation = getOccupationTemplate(occupationKey);
    const hasSkillReply = wantsAutoSkillAllocation(text)
      || extractSkillKeysFromText(text).length > 0
      || extractCreditRatingChoice(text, occupation) != null;
    if (hasSkillReply) {
      return finalizeTraditionalDraft(event, stateBundle, text, randomInt);
    }
    return applied;
  }

  if (draft.stage === "skills") {
    return finalizeTraditionalDraft(event, stateBundle, text, randomInt);
  }

  if (draft.stage === "profile") {
    return applyInvestigatorProfileDraft(text, stateBundle);
  }

  if (draft.stage === "gear") {
    return applyInvestigatorGearDraft(text, stateBundle);
  }

  if (draft.stage === "lock") {
    if (includesAny(normalized, ["改资料", "改人物", "改角色", "改一下设定"])) {
      draft.stage = "profile";
      draft.updatedAt = new Date().toISOString();
      setPendingInvestigatorDraft(stateBundle, draft);
      return { reply: formatDraftProfilePrompt(getPendingDraftInvestigator(stateBundle, draft)) };
    }
    if (includesAny(normalized, ["改装备", "改物品", "改携带", "重配装备", "带"])) {
      draft.stage = "gear";
      draft.updatedAt = new Date().toISOString();
      setPendingInvestigatorDraft(stateBundle, draft);
      return { reply: formatDraftGearPrompt(getPendingDraftInvestigator(stateBundle, draft)) };
    }
    if (includesAny(normalized, ["锁卡", "确认", "开场", "继续", "开始", "就这样", "没问题"])) {
      return finalizeInvestigatorDraftLock(stateBundle);
    }
    return { reply: formatDraftLockPrompt(getPendingDraftInvestigator(stateBundle, draft)) };
  }

  return null;
}

function pickCreditRating(occupation) {
  const [min, max] = occupation.creditRatingRange || [0, 20];
  return Math.floor((min + max) / 2);
}

function shuffleQuickFireAssignments(randomInt = defaultRandomInt) {
  const pool = [...QUICK_FIRE_VALUES];
  const keys = ["STR", "CON", "DEX", "APP", "POW", "INT", "SIZ", "EDU"];
  const assignments = {};

  for (const key of keys) {
    const index = randomInt(0, pool.length - 1);
    assignments[key] = pool.splice(index, 1)[0];
  }

  return assignments;
}

function buildGeneratedBase(event, occupationKey) {
  const name = getSenderName(event);
  return {
    id: `pc-onebot-${sanitizeSegment(event.user_id || "guest")}`,
    name,
    age: 26,
    occupationKey,
    persona: "眼睛尖，脑子转得快，遇到怪事不会轻易撒手。",
    motivation: "想把眼前这摊怪事查出个真相。",
    era: "depression_era_1920s",
    residence: "Arkham",
    birthplace: "Boston"
  };
}

function buildTraditionalInvestigatorBundle(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  const occupation = getOccupationTemplate(occupationKey);
  const generated = generateTraditionalAttributesDetailed(randomInt);
  const rolled = generated.attributes;
  const attributes = {
    STR: rolled.STR,
    CON: rolled.CON,
    DEX: rolled.DEX,
    APP: rolled.APP,
    POW: rolled.POW,
    SIZ: rolled.SIZ,
    INT: rolled.INT,
    EDU: rolled.EDU,
    Luck: rolled.Luck
  };
  const creditRating = pickCreditRating(occupation);
  const skills = buildStarterSkills(attributes, occupation, creditRating);

  return {
    generated,
    investigator: createInvestigatorFromTraditional({
      ...buildGeneratedBase(event, occupationKey),
      creditRating,
      luck: rolled.Luck,
      attributeAssignments: {
        STR: rolled.STR,
        CON: rolled.CON,
        DEX: rolled.DEX,
        APP: rolled.APP,
        POW: rolled.POW,
        SIZ: rolled.SIZ,
        INT: rolled.INT,
        EDU: rolled.EDU
      },
      skills,
      inventory: [
        { name: "手电", category: "tool", quantity: 1 },
        { name: "笔记本", category: "tool", quantity: 1 }
      ]
    }, randomInt)
  };
}

function createRolledInvestigator(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  return buildTraditionalInvestigatorBundle(event, occupationKey, randomInt).investigator;
}

function createQuickfireInvestigator(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  const occupation = getOccupationTemplate(occupationKey);
  const attributeAssignments = shuffleQuickFireAssignments(randomInt);
  const luck = 55;
  const creditRating = pickCreditRating(occupation);
  const skills = buildStarterSkills({ ...attributeAssignments, Luck: luck }, occupation, creditRating);

  return createCharacter({
    ...buildGeneratedBase(event, occupationKey),
    creditRating,
    luck,
    attributeAssignments,
    skills,
    inventory: [
      { name: "手电", category: "tool", quantity: 1 },
      { name: "笔记本", category: "tool", quantity: 1 }
    ]
  });
}

function buildInvestigatorBundleForMode(event, mode, occupationKey, randomInt) {
  if (mode === "quickfire") {
    const investigator = createQuickfireInvestigator(event, occupationKey, randomInt);
    return {
      mode,
      occupationKey,
      investigator,
      generation: {
        mode,
        quickfireAssignments: { ...investigator.attributes, Luck: investigator.resources.luck }
      }
    };
  }

  const bundle = buildTraditionalInvestigatorBundle(event, occupationKey, randomInt);
  return {
    mode,
    occupationKey,
    investigator: bundle.investigator,
    generation: {
      mode,
      breakdown: bundle.generated.breakdown
    }
  };
}

function getActorForUser(stateBundle, userId) {
  const actorId = stateBundle.meta.actorsByUserId[String(userId)];
  return actorId ? stateBundle.sessionState.investigators[actorId] : null;
}

function findKnownUserById(meta, userId) {
  const resolvedUserId = userId != null ? String(userId).trim() : "";
  if (!resolvedUserId) return null;
  const knownUsers = Array.isArray(meta?.knownUsers) ? meta.knownUsers : [];
  return knownUsers.find((item) => String(item?.userId || "").trim() === resolvedUserId) || null;
}

function findUserIdByActorId(stateBundle, actorId) {
  const resolvedActorId = actorId != null ? String(actorId).trim() : "";
  if (!resolvedActorId) return "";
  const mapping = stateBundle?.meta?.actorsByUserId || {};
  const foundEntry = Object.entries(mapping).find(([, mappedActorId]) => String(mappedActorId || "").trim() === resolvedActorId);
  return foundEntry ? String(foundEntry[0]).trim() : "";
}

function resolvePendingSceneChoiceOwner(stateBundle, pendingChoice) {
  const userId =
    pendingChoice?.ownerUserId != null && String(pendingChoice.ownerUserId).trim()
      ? String(pendingChoice.ownerUserId).trim()
      : findUserIdByActorId(stateBundle, pendingChoice?.actorId);
  if (!userId) {
    return {
      userId: "",
      userName: ""
    };
  }
  const knownUser = findKnownUserById(stateBundle?.meta, userId);
  return {
    userId,
    userName:
      typeof pendingChoice?.ownerUserName === "string" && pendingChoice.ownerUserName.trim()
        ? pendingChoice.ownerUserName.trim()
        : knownUser?.name || `玩家${userId}`
  };
}

function bindPendingSceneChoiceOwner(stateBundle, pendingChoice) {
  if (!pendingChoice || typeof pendingChoice !== "object") return pendingChoice;
  const owner = resolvePendingSceneChoiceOwner(stateBundle, pendingChoice);
  if (
    (owner.userId || null) === (pendingChoice.ownerUserId || null)
    && (owner.userName || null) === (pendingChoice.ownerUserName || null)
  ) {
    return pendingChoice;
  }
  return {
    ...pendingChoice,
    ownerUserId: owner.userId || null,
    ownerUserName: owner.userName || null
  };
}

function formatPendingSceneChoiceOwnerReply(stateBundle, pendingChoice) {
  const owner = resolvePendingSceneChoiceOwner(stateBundle, pendingChoice);
  const ownerLabel = owner.userName || "刚刚那位玩家";
  if (pendingChoice?.kind === "post_check_choice") {
    return `这一下我先等 ${ownerLabel} 决定这次检定怎么收：接受 / 推骰 / 花幸运。等他拍板完，你再接下一句。`;
  }
  return `这一下我先等 ${ownerLabel} 选走法。等他把这步收掉后，你再接下一句动作。`;
}

function resolvePendingOwner(stateBundle, pendingState) {
  const userId =
    pendingState?.ownerUserId != null && String(pendingState.ownerUserId).trim()
      ? String(pendingState.ownerUserId).trim()
      : "";
  if (!userId) {
    return {
      userId: "",
      userName: ""
    };
  }
  const knownUser = findKnownUserById(stateBundle?.meta, userId);
  return {
    userId,
    userName:
      typeof pendingState?.ownerUserName === "string" && pendingState.ownerUserName.trim()
        ? pendingState.ownerUserName.trim()
        : knownUser?.name || `玩家${userId}`
  };
}

function findDraftOwnerUserId(stateBundle, draft) {
  const directUserId =
    draft?.ownerUserId != null && String(draft.ownerUserId).trim()
      ? String(draft.ownerUserId).trim()
      : "";
  if (directUserId) return directUserId;
  const investigatorId =
    draft?.investigatorId != null && String(draft.investigatorId).trim()
      ? String(draft.investigatorId).trim()
      : "";
  if (!investigatorId) return "";
  const mapping = stateBundle.meta.actorsByUserId || {};
  const foundEntry = Object.entries(mapping).find(([, actorId]) => String(actorId || "").trim() === investigatorId);
  return foundEntry ? String(foundEntry[0]).trim() : "";
}

function syncActorIntoTurnState(meta, actorId) {
  const turnState = ensureTurnState(meta);
  if (!turnState.actorOrder.includes(actorId)) {
    turnState.actorOrder.push(actorId);
  }
  if (!turnState.currentActorId) {
    turnState.currentActorId = actorId;
  }
  return turnState;
}

function buildPartyEntries(stateBundle) {
  const members = listPartyMembers(stateBundle.meta);
  const turnState = ensureTurnState(stateBundle.meta);
  const entries = members.map((member) => {
    const actorId =
      member?.investigatorId != null && String(member.investigatorId).trim()
        ? String(member.investigatorId).trim()
        : stateBundle.meta.actorsByUserId[String(member.userId)] || null;
    const investigator = actorId ? stateBundle.sessionState.investigators[actorId] : null;
    return {
      userId: String(member.userId),
      userName: member.userName,
      actorId,
      investigator,
      status: member.status || (investigator ? "ready" : "joined"),
      isCurrent: Boolean(actorId && turnState.currentActorId === actorId),
      softTimeLagMinutes: actorId ? (getActorSoftTimeStatus(stateBundle, actorId)?.owedMinutes || 0) : 0,
      lastActionSummary: actorId ? (ensureActorSoftTimeState(stateBundle, actorId)?.lastActionSummary || null) : null
    };
  });
  if (stateBundle.sessionState?.scene?.sceneType !== "combat") {
    return entries;
  }
  const orderMap = new Map(turnState.actorOrder.map((actorId, index) => [actorId, index]));
  return entries.sort((left, right) => {
    const leftIndex = left.actorId && orderMap.has(left.actorId) ? orderMap.get(left.actorId) : Number.MAX_SAFE_INTEGER;
    const rightIndex = right.actorId && orderMap.has(right.actorId) ? orderMap.get(right.actorId) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return String(left.userName || left.actorId || "")
      .localeCompare(String(right.userName || right.actorId || ""), "zh-Hans-CN");
  });
}

function getCombatInitiativeScore(investigator) {
  return Number.isFinite(Number(investigator?.attributes?.DEX))
    ? Number(investigator.attributes.DEX)
    : 0;
}

function listReadyCombatParticipants(stateBundle) {
  return listPartyMembers(stateBundle.meta)
    .map((member) => {
      const actorId =
        member?.investigatorId != null && String(member.investigatorId).trim()
          ? String(member.investigatorId).trim()
          : stateBundle.meta.actorsByUserId[String(member.userId)] || null;
      const investigator = actorId ? stateBundle.sessionState.investigators?.[actorId] : null;
      return {
        userId: String(member.userId),
        userName: member.userName,
        actorId,
        investigator
      };
    })
    .filter((entry) => entry.actorId && entry.investigator);
}

function formatCombatInitiativeOrder(stateBundle) {
  const turnState = ensureTurnState(stateBundle.meta);
  const orderedActors = turnState.actorOrder
    .map((actorId) => stateBundle.sessionState.investigators?.[actorId])
    .filter(Boolean);
  if (!orderedActors.length) return null;
  return `战斗顺序：${orderedActors.map((investigator, index) => `${index + 1}.${investigator.name}(DEX ${getCombatInitiativeScore(investigator)})`).join(" → ")}`;
}

function syncCombatTurnOrder(stateBundle, options = {}) {
  if (stateBundle.sessionState?.scene?.sceneType !== "combat") return null;
  if (inferPartyMode(stateBundle.meta, stateBundle.sessionState) !== "group") return null;

  const turnState = ensureTurnState(stateBundle.meta);
  const originalOrder = new Map(turnState.actorOrder.map((actorId, index) => [actorId, index]));
  const sortedActorIds = listReadyCombatParticipants(stateBundle)
    .sort((left, right) => {
      const leftDex = getCombatInitiativeScore(left.investigator);
      const rightDex = getCombatInitiativeScore(right.investigator);
      if (leftDex !== rightDex) return rightDex - leftDex;
      const leftOriginal = originalOrder.has(left.actorId) ? originalOrder.get(left.actorId) : Number.MAX_SAFE_INTEGER;
      const rightOriginal = originalOrder.has(right.actorId) ? originalOrder.get(right.actorId) : Number.MAX_SAFE_INTEGER;
      if (leftOriginal !== rightOriginal) return leftOriginal - rightOriginal;
      return String(left.userName || left.actorId || "")
        .localeCompare(String(right.userName || right.actorId || ""), "zh-Hans-CN");
    })
    .map((entry) => entry.actorId);

  if (!sortedActorIds.length) return null;
  turnState.actorOrder = sortedActorIds;
  if (options.resetRound === true) {
    turnState.round = 1;
  }
  const preferredCurrentActorId =
    options.currentActorId && sortedActorIds.includes(options.currentActorId)
      ? options.currentActorId
      : (options.keepCurrent === true && sortedActorIds.includes(turnState.currentActorId)
        ? turnState.currentActorId
        : sortedActorIds[0]);
  turnState.currentActorId = preferredCurrentActorId;
  return {
    actorOrder: [...sortedActorIds],
    currentActorId: preferredCurrentActorId,
    orderLine: formatCombatInitiativeOrder(stateBundle)
  };
}

function maybeAdvanceCombatTurn(stateBundle, resolvedActorId) {
  if (stateBundle.sessionState?.scene?.sceneType !== "combat") return null;
  const synced = syncCombatTurnOrder(stateBundle, { keepCurrent: true });
  if (!synced || synced.actorOrder.length < 2) return synced;

  const turnState = ensureTurnState(stateBundle.meta);
  if (resolvedActorId && synced.actorOrder.includes(resolvedActorId)) {
    turnState.currentActorId = resolvedActorId;
  }
  const advanced = advanceCurrentActor(stateBundle);
  return {
    actorOrder: [...advanced.actorOrder],
    currentActorId: advanced.currentActorId,
    round: advanced.round,
    orderLine: formatCombatInitiativeOrder(stateBundle)
  };
}

function resolveActorSelection(stateBundle, selector = "") {
  const normalized = String(selector || "").trim().toLowerCase();
  if (!normalized) return null;
  const entries = buildPartyEntries(stateBundle);
  return entries.find((entry) => {
    const fields = [
      entry.userId,
      entry.userName,
      entry.actorId,
      entry.investigator?.id,
      entry.investigator?.name
    ].filter(Boolean).map((value) => String(value).toLowerCase());
    return fields.some((value) => value === normalized || value.includes(normalized));
  }) || null;
}

function setCurrentActor(stateBundle, actorId) {
  const turnState = ensureTurnState(stateBundle.meta);
  syncActorIntoTurnState(stateBundle.meta, actorId);
  pruneTurnStateToParty(stateBundle, { save: false });
  turnState.currentActorId = actorId;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return turnState;
}

function advanceCurrentActor(stateBundle) {
  const turnState = ensureTurnState(stateBundle.meta);
  pruneTurnStateToParty(stateBundle, { save: false });
  const available = turnState.actorOrder.filter((actorId) => stateBundle.sessionState.investigators[actorId]);
  if (!available.length) return turnState;
  const currentIndex = Math.max(available.indexOf(turnState.currentActorId), 0);
  const nextIndex = (currentIndex + 1) % available.length;
  turnState.currentActorId = available[nextIndex];
  if (nextIndex === 0) turnState.round += 1;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return turnState;
}

function maybeAdvanceSpotlightAfterResolvedTurn(stateBundle, actorId) {
  const resolvedActorId = actorId != null ? String(actorId).trim() : "";
  if (!resolvedActorId) return null;
  if (inferPartyMode(stateBundle.meta, stateBundle.sessionState) !== "group") return null;

  const turnState = ensureTurnState(stateBundle.meta);
  pruneTurnStateToParty(stateBundle, { save: false });
  const available = turnState.actorOrder.filter((candidateActorId) => stateBundle.sessionState.investigators[candidateActorId]);
  if (available.length < 2 || !available.includes(resolvedActorId)) return null;

  if (turnState.currentActorId !== resolvedActorId) {
    turnState.currentActorId = resolvedActorId;
  }

  const advanced = advanceCurrentActor(stateBundle);
  const nextActor = advanced.currentActorId ? stateBundle.sessionState.investigators[advanced.currentActorId] : null;
  if (!nextActor || nextActor.id === resolvedActorId) return null;
  return {
    currentActor: nextActor,
    round: advanced.round,
    operationEvent: buildOperationEvent("turn.advance", `系统把 spotlight 轮到了 ${nextActor.name}`, {
      actorId: nextActor.id,
      round: advanced.round,
      mode: "auto"
    })
  };
}

function extractSpotlightOverrideActionText(text = "") {
  const source = String(text || "").trim();
  if (!source) return "";
  return source.replace(/^(切我(?:这边)?|切到我(?:这边)?|轮到我(?:了)?|到我(?:了)?|我打断一下|我插一句|我这边接一下|先看我这边)[，,。!！:：\s-]*/i, "").trim();
}

function maybeHandleSpotlightConflict(text, event, stateBundle, actorResult) {
  if (!event?.group_id || !actorResult?.actorId) return null;
  if (inferPartyMode(stateBundle.meta, stateBundle.sessionState) !== "group") return null;

  const turnState = ensureTurnState(stateBundle.meta);
  const currentActorId = turnState.currentActorId;
  if (!currentActorId || currentActorId === actorResult.actorId) return null;

  const currentActor = stateBundle.sessionState.investigators?.[currentActorId];
  const requestedActor = stateBundle.sessionState.investigators?.[actorResult.actorId];
  if (!currentActor || !requestedActor) return null;

  const cleanedText = extractSpotlightOverrideActionText(text);
  if (!cleanedText || cleanedText === String(text || "").trim()) {
    return {
      blocked: true,
      reply: `当前 spotlight 还在 ${currentActor.name} 这边。你要接这步的话，先回“切我”/“我打断一下”，或者用 \`/aikp focus ${requestedActor.name}\`。`
    };
  }

  setCurrentActor(stateBundle, actorResult.actorId);
  const softTimeCue = consumeActorSoftTimeCue(stateBundle, actorResult.actorId);
  return {
    text: cleanedText,
    focusLine: [`好，我先把 spotlight 切到 ${requestedActor.name}。`, softTimeCue].filter(Boolean).join("\n"),
    operationEvents: [buildOperationEvent("turn.focus", `${getSenderName(event)} 抢先接手行动，spotlight 切到了 ${requestedActor.name}`, {
      actorId: actorResult.actorId,
      round: ensureTurnState(stateBundle.meta).round,
      mode: "implicit"
    })]
  };
}

function upsertInvestigatorForUser(event, stateBundle, investigator) {
  addInvestigator(stateBundle.sessionState, investigator);
  syncInventoryBaseline(stateBundle.meta, investigator);
  stateBundle.meta.actorsByUserId[String(event.user_id || "guest")] = investigator.id;
  upsertPartyMember(stateBundle, event, {
    investigatorId: investigator.id,
    save: false
  });
  syncActorIntoTurnState(stateBundle.meta, investigator.id);
  pruneTurnStateToParty(stateBundle, { save: false });
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);
  return investigator;
}

function createDefaultInvestigator(event, overrides = {}) {
  return createQuickfireInvestigator(event, overrides.occupationKey || "journalist", overrides.randomInt || defaultRandomInt);
}

function ensureActorForUser(event, stateBundle, options = {}) {
  const userId = String(event.user_id || "guest");
  const mappedActorId = stateBundle.meta.actorsByUserId[userId];
  if (mappedActorId && stateBundle.sessionState.investigators[mappedActorId]) {
    syncInventoryBaseline(stateBundle.meta, stateBundle.sessionState.investigators[mappedActorId]);
    return { actorId: mappedActorId, created: false, investigator: stateBundle.sessionState.investigators[mappedActorId] };
  }

  if (!options.autoCreateInvestigator) {
    return { actorId: null, created: false, investigator: null };
  }

  const investigator = createDefaultInvestigator(event, options.investigatorOverrides || {});
  upsertInvestigatorForUser(event, stateBundle, investigator);
  return { actorId: investigator.id, created: true, investigator };
}

function formatStateSummary(sessionState, meta = {}) {
  const state = getState(sessionState);
  const revealedClues = state.scene.clues.filter((item) => item.revealed).map((item) => item.title);
  const npcBits = (state.scene.participants.npcs || []).map((npc) => `${npc.name}(${npc.attitude})`);
  const turnState = ensureTurnState(meta);
  const currentActor = turnState.currentActorId ? sessionState.investigators[turnState.currentActorId] : null;
  const currentActorLag = currentActor ? formatSoftTimeLagTag({ meta, sessionState }, turnState.currentActorId) : null;
  const partyCount = listPartyMembers(meta).length;
  const partyMode = inferPartyMode(meta, sessionState) === "group" ? "多人" : "单人";
  const investigatorBits = Object.values(sessionState.investigators || {})
    .map((investigator) => formatInvestigatorStateLine(investigator, meta, { includeInventory: true }))
    .filter(Boolean);
  const lines = [
    `场景：${state.scene.summary || state.scene.location}`,
    `地点：${state.scene.location}`,
    `时间：${state.scene.timeState.timelineMinute} 分钟`,
    `危险：${state.scene.threats.dangerLevel}（暴露 ${state.scene.threats.exposure} / 压力 ${state.scene.threats.pressure}）`,
    sessionState.scene?.sceneType === "combat"
      ? `战斗：进行中｜第 ${state.scene.timeState.combatRound} 轮`
      : `战斗：未进入`,
    `当前轮次：第 ${turnState.round} 轮｜当前聚焦：${currentActor ? `${currentActor.name}${currentActorLag ? `（${currentActorLag}）` : ""}` : "未指定"}`,
    `队伍：${partyMode}｜成员 ${partyCount}｜${isPartyLocked(meta) ? "名单已锁" : "名单开放"}`,
    `线索：${revealedClues.length ? revealedClues.join("、") : "还没翻到明线索"}`,
    `在场 NPC：${npcBits.length ? npcBits.join("、") : "暂无"}`,
    `调查员：${investigatorBits.length ? investigatorBits.join("；") : "暂无"}`
  ];
  return lines.join("\n");
}

function formatPartySummary(stateBundle) {
  const entries = buildPartyEntries(stateBundle);
  const turnState = ensureTurnState(stateBundle.meta);
  const isGroupConversation = stateBundle.layout?.conversationKey?.startsWith("onebot-group-");
  const partyMode = inferPartyMode(stateBundle.meta, stateBundle.sessionState) === "group" ? "多人" : "单人";
  const combatOrderLine = stateBundle.sessionState?.scene?.sceneType === "combat"
    ? formatCombatInitiativeOrder(stateBundle)
    : null;
  const lines = [
    `队伍面板｜${partyMode}｜${isPartyLocked(stateBundle.meta) ? "名单已锁" : "名单开放"}｜第 ${turnState.round} 轮`
  ];
  if (combatOrderLine) {
    lines.push(combatOrderLine);
  }
  if (!entries.length) {
    lines.push("- 当前还没人入团。直接 @我 说“开始建卡”“记者吧”或“给我快速医生卡”就会按 QQ 记进名单。");
    if (isGroupConversation) {
      lines.push("- 人齐后回“就这些人”或用 `/aikp lock-party`，我就按这份名单跑。");
    }
    return lines.join("\n");
  }

  for (const entry of entries) {
    if (!entry.investigator) {
      lines.push(`- ${entry.userName}：已入团，待建卡`);
      continue;
    }
    const marker = entry.isCurrent ? "👉" : "-";
    const extraBits = [];
    if (entry.softTimeLagMinutes > 0) extraBits.push(`待同步 +${entry.softTimeLagMinutes} 分钟`);
    if (entry.lastActionSummary) extraBits.push(`上次：${entry.lastActionSummary}`);
    const conditionText = formatInvestigatorConditionSummary(entry.investigator);
    if (conditionText !== "正常") extraBits.push(`状态 ${conditionText}`);
    const inventoryDelta = formatInventoryDeltaSummary(stateBundle.meta, entry.investigator);
    if (inventoryDelta) extraBits.push(`变动 ${inventoryDelta}`);
    const temporaryEffects = Array.isArray(entry.investigator?.status?.temporaryEffects) && entry.investigator.status.temporaryEffects.length
      ? entry.investigator.status.temporaryEffects.join("、")
      : null;
    if (temporaryEffects) extraBits.push(`后效 ${temporaryEffects}`);
    lines.push(`${marker} ${entry.userName}｜${entry.investigator.name}｜${entry.investigator.occupation}｜HP ${entry.investigator.resources.hp}｜SAN ${entry.investigator.resources.san}｜携带 ${formatInventorySummary(entry.investigator)}${extraBits.length ? `｜${extraBits.join("｜")}` : ""}`);
  }
  if (isGroupConversation) {
    lines.push(`软时间：多人分头时我只在后台记时间，提醒到了你们给个合理解释就能继续，不会硬卡死。`);
    if (!isPartyLocked(stateBundle.meta)) {
      lines.push("要参团的人继续 @我 报职业/开始建卡就会自动入团；人齐后回“就这些人”或用 `/aikp lock-party`。");
    }
  }
  return lines.join("\n");
}

function formatScenePanel(sessionState) {
  const meta = sessionState.scene?.meta || {};
  const lines = [
    `场景环境：${meta.scenarioTitle || sessionState.scene?.summary || "未知场景"}`
  ];

  if (meta.atmosphere?.tone) lines.push(`- 气氛：${meta.atmosphere.tone}`);
  if (meta.atmosphere?.light) lines.push(`- 光线：${meta.atmosphere.light}`);
  if (Array.isArray(meta.atmosphere?.smell) && meta.atmosphere.smell.length) {
    lines.push(`- 气味：${meta.atmosphere.smell.join("、")}`);
  }
  if (Array.isArray(meta.atmosphere?.sound) && meta.atmosphere.sound.length) {
    lines.push(`- 声音：${meta.atmosphere.sound.join("、")}`);
  }
  if (Array.isArray(meta.areas) && meta.areas.length) {
    lines.push("- 区域：");
    for (const area of meta.areas) {
      lines.push(`  - ${area.name}：${area.description}`);
    }
  }
  return lines.join("\n");
}

function formatRecapReply(sessionState) {
  const revealedClues = (sessionState.scene?.clues || []).filter((item) => item.revealed).map((item) => item.title);
  const triggeredEvents = (sessionState.scene?.events || []).filter((item) => item.triggered).map((item) => item.label);
  const endingHooks = sessionState.scene?.meta?.endingHooks || [];
  const lines = ["阶段总结："];
  lines.push(`- 已推进到 ${sessionState.scene?.timeState?.timelineMinute || 0} 分钟，危险等级 ${sessionState.scene?.threats?.dangerLevel || "low"}`);
  lines.push(`- 已得线索：${revealedClues.length ? revealedClues.join("、") : "暂时还少关键明线"}`);
  lines.push(`- 已触发事件：${triggeredEvents.length ? triggeredEvents.join("、") : "目前还没炸出大事"}`);
  if (endingHooks.length) {
    lines.push(`- 这幕后面最可能走向：${endingHooks.join(" / ")}`);
  }
  return lines.join("\n");
}

function formatCluePanel(sessionState) {
  const clues = Array.isArray(sessionState.scene?.clues) ? sessionState.scene.clues : [];
  const revealed = clues.filter((item) => item.revealed);
  const hiddenCore = clues.filter((item) => !item.revealed && item.kind === "core");
  const hiddenOther = clues.filter((item) => !item.revealed && item.kind !== "core");
  const lines = ["线索面板："];

  if (revealed.length) {
    lines.push(...revealed.map((item) => `- 已得：${item.title}（${item.kind}/${item.quality || "unknown"}）`));
  } else {
    lines.push("- 已得：暂无");
  }

  if (hiddenCore.length) {
    lines.push(`- 未出的核心线索：${hiddenCore.length} 条`);
  }
  if (hiddenOther.length) {
    lines.push(`- 其他未显线索：${hiddenOther.length} 条`);
  }

  return lines.join("\n");
}

function formatNpcPanel(sessionState) {
  const npcs = Array.isArray(sessionState.scene?.participants?.npcs) ? sessionState.scene.participants.npcs : [];
  const lines = ["NPC 面板："];
  if (!npcs.length) {
    lines.push("- 当前场里没有可见 NPC。");
    return lines.join("\n");
  }

  for (const npc of npcs) {
    const socialBits = [];
    if (npc.socialState?.suspicion) socialBits.push(`戒心 ${npc.socialState.suspicion}`);
    if (npc.socialState?.fear) socialBits.push(`恐惧 ${npc.socialState.fear}`);
    if (npc.socialState?.affinity) socialBits.push(`亲近 ${npc.socialState.affinity}`);
    if (npc.socialState?.obligation) socialBits.push(`亏欠 ${npc.socialState.obligation}`);
    const itemBits = Array.isArray(npc.items) && npc.items.length
      ? `｜物品 ${npc.items.slice(0, 4).join("、")}`
      : "";
    lines.push(`- ${npc.name}｜态度 ${npc.attitude}｜trust ${npc.trust ?? 0}${socialBits.length ? `｜${socialBits.join(" / ")}` : ""}${itemBits}`);
  }
  return lines.join("\n");
}

function collectNpcStateMap(sessionState) {
  const npcs = Array.isArray(sessionState.scene?.participants?.npcs) ? sessionState.scene.participants.npcs : [];
  return new Map(npcs.map((npc) => [npc.id, cloneJson(npc)]));
}

function formatStateDelta(beforeSessionState, afterSessionState) {
  if (!beforeSessionState || !afterSessionState) return null;
  const lines = [];
  const beforeTime = Number(beforeSessionState.scene?.timeState?.timelineMinute || 0);
  const afterTime = Number(afterSessionState.scene?.timeState?.timelineMinute || 0);
  const beforeExposure = Number(beforeSessionState.scene?.threats?.exposure || 0);
  const afterExposure = Number(afterSessionState.scene?.threats?.exposure || 0);
  const beforePressure = Number(beforeSessionState.scene?.threats?.pressure || 0);
  const afterPressure = Number(afterSessionState.scene?.threats?.pressure || 0);

  if (afterTime !== beforeTime) lines.push(`时间 +${afterTime - beforeTime}`);
  if (afterExposure !== beforeExposure) lines.push(`暴露 ${beforeExposure}→${afterExposure}`);
  if (afterPressure !== beforePressure) lines.push(`压力 ${beforePressure}→${afterPressure}`);

  const beforeClues = new Set((beforeSessionState.scene?.clues || []).filter((item) => item.revealed).map((item) => item.id));
  const newClues = (afterSessionState.scene?.clues || []).filter((item) => item.revealed && !beforeClues.has(item.id));
  if (newClues.length) {
    lines.push(`新线索：${newClues.map((item) => item.title).join("、")}`);
  }

  const beforeEvents = new Set((beforeSessionState.scene?.events || []).filter((item) => item.triggered).map((item) => item.id));
  const newEvents = (afterSessionState.scene?.events || []).filter((item) => item.triggered && !beforeEvents.has(item.id));
  if (newEvents.length) {
    lines.push(`新事件：${newEvents.map((item) => item.label).join("、")}`);
  }

  const beforeNpcMap = collectNpcStateMap(beforeSessionState);
  for (const npc of (afterSessionState.scene?.participants?.npcs || [])) {
    const beforeNpc = beforeNpcMap.get(npc.id);
    if (!beforeNpc) continue;
    const npcChanges = [];
    if (beforeNpc.attitude !== npc.attitude) npcChanges.push(`态度 ${beforeNpc.attitude}→${npc.attitude}`);
    if ((beforeNpc.trust ?? 0) !== (npc.trust ?? 0)) npcChanges.push(`trust ${(beforeNpc.trust ?? 0)}→${(npc.trust ?? 0)}`);
    if ((beforeNpc.socialState?.suspicion ?? 0) !== (npc.socialState?.suspicion ?? 0)) npcChanges.push(`戒心 ${(beforeNpc.socialState?.suspicion ?? 0)}→${(npc.socialState?.suspicion ?? 0)}`);
    if ((beforeNpc.socialState?.fear ?? 0) !== (npc.socialState?.fear ?? 0)) npcChanges.push(`恐惧 ${(beforeNpc.socialState?.fear ?? 0)}→${(npc.socialState?.fear ?? 0)}`);
    if ((beforeNpc.socialState?.affinity ?? 0) !== (npc.socialState?.affinity ?? 0)) npcChanges.push(`亲近 ${(beforeNpc.socialState?.affinity ?? 0)}→${(npc.socialState?.affinity ?? 0)}`);
    if ((beforeNpc.socialState?.obligation ?? 0) !== (npc.socialState?.obligation ?? 0)) npcChanges.push(`亏欠 ${(beforeNpc.socialState?.obligation ?? 0)}→${(npc.socialState?.obligation ?? 0)}`);
    if (npcChanges.length) {
      lines.push(`${npc.name}：${npcChanges.join("，")}`);
    }
  }

  if (!lines.length) return null;
  return `状态变化：\n- ${lines.join("\n- ")}`;
}

function formatCheckResultLine(event) {
  if (!event?.result) return null;
  if (event.mode === "hidden") {
    return `暗骰：${event.skillKey}`;
  }
  return `投掷：${event.roll}（目标 ${event.targetValue}，${event.result.successLevel}）`;
}

function persistSessionStateBundle(stateBundle) {
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, {
    meta: { conversationKey: stateBundle.layout.conversationKey }
  });
  saveMeta(stateBundle.layout, stateBundle.meta);
}

function formatMissingInvestigatorReply(stateBundle, event) {
  const currentPartyMember = getPartyMember(stateBundle.meta, event?.user_id);
  return !currentPartyMember && event?.group_id && isPartyLocked(stateBundle.meta)
    ? "这轮名单已经锁了，你现在不在这轮里。我先不把你直接塞进场中；要补人就让场内玩家先说“解锁队伍”或用 `/aikp unlock-party`。"
    : "你还没车卡喔。传统建卡可以直接说“先roll属性”或“记者吧，信用20，侦查图书馆心理学说服”；想省事就说“给我快速车卡，职业医生”。要继续用指令也行：`/aikp roll`、`/aikp roll journalist`、`/aikp quickfire doctor`。";
}

function normalizeCombatNpcProfile(npc = {}) {
  const profile = npc.combatProfile && typeof npc.combatProfile === "object" ? npc.combatProfile : {};
  return {
    dodge: Number.isFinite(Number(profile.dodge)) ? Number(profile.dodge) : 25,
    fighting: Number.isFinite(Number(profile.fighting)) ? Number(profile.fighting) : 35,
    damage: typeof profile.damage === "string" && profile.damage.trim() ? profile.damage.trim() : "1D3"
  };
}

function cloneCombatNpc(npc = {}) {
  return {
    ...cloneJson(npc),
    status: typeof npc.status === "string" && npc.status.trim() ? npc.status : "active",
    attitude: typeof npc.attitude === "string" && npc.attitude.trim() ? npc.attitude : "hostile",
    combatProfile: normalizeCombatNpcProfile(npc)
  };
}

function resolveCombatNpc(sessionState, selector = "") {
  const npcs = Array.isArray(sessionState?.scene?.participants?.npcs)
    ? sessionState.scene.participants.npcs.filter(Boolean)
    : [];
  if (!npcs.length) return null;
  const normalized = String(selector || "").trim().toLowerCase();
  if (!normalized) return npcs[0];
  return npcs.find((npc) => {
    const values = [npc.id, npc.name].filter(Boolean).map((value) => String(value).toLowerCase());
    return values.some((value) => value === normalized || value.includes(normalized));
  }) || null;
}

function resolveCombatDefenseMode(tokens = []) {
  let defenseMode = "dodge";
  const selectorParts = [];
  for (const token of tokens) {
    const normalized = normalizeIntentText(token);
    if (["fight_back", "fightback", "counter", "反击", "还手"].includes(normalized)) {
      defenseMode = "fight_back";
      continue;
    }
    if (["dodge", "闪避", "躲避", "躲开"].includes(normalized)) {
      defenseMode = "dodge";
      continue;
    }
    selectorParts.push(token);
  }
  return {
    defenseMode,
    selector: selectorParts.join(" ").trim()
  };
}

function resolveLossSpec(rawValue, randomInt) {
  const text = String(rawValue || "").trim();
  if (!text) return null;
  if (!/^(\d+|\d+d\d+(?:[+-]\d+)?)$/i.test(text)) return null;
  const rolled = rollFormula(text, randomInt);
  const total = Number(rolled.total);
  return Number.isFinite(total) ? total : null;
}

function formatResolvedActionResult(result) {
  if (!result) return null;

  if (result.kind === "start_combat") {
    const enemyNames = Array.isArray(result.enemies) && result.enemies.length
      ? result.enemies.map((enemy) => enemy.name).filter(Boolean).join("、")
      : "眼前这波威胁";
    return `好，先把场面收进战斗态。现在是战斗第 ${result.round} 轮，对上的有：${enemyNames}。`;
  }

  if (result.kind === "combat_round" && result.event) {
    const event = result.event;
    const defenseLabel = event.defenseMode === "fight_back" ? "反击" : "闪避";
    const lines = [
      `战斗第 ${event.round} 轮：${event.summary}`,
      `你这边 ${event.actorRoll}（${event.actorLevel}）｜对手${defenseLabel} ${event.defendRoll}（${event.defendLevel}）`
    ];
    if (event.damage != null) {
      lines.push(`伤害：${event.damageFormula} → ${event.damage}`);
    }
    if (event.damageApplied?.hpNow != null && event.winner === "opponent") {
      lines.push(`你当前 HP：${event.damageApplied.hpNow}`);
    }
    return lines.join("\n");
  }

  if (result.kind === "san_check" && result.event) {
    const event = result.event;
    const lines = [
      event.mode === "hidden"
        ? "SAN 暗骰：这下我先替你记结果了。"
        : `SAN 检定：${event.roll}/${event.sanBefore}（${event.successLevel}）`,
      `SAN ${event.sanBefore}→${event.sanNow}（损失 ${event.sanLoss}）`,
      `今日累计损失 ${event.daySanLoss}/${event.daySanThreshold}`
    ];
    if (event.temporaryInsanityTriggered) {
      lines.push("这一下已经踩到临时疯狂阈值了。");
    }
    if (event.indefiniteInsanityTriggered) {
      lines.push("今天累计 SAN 损失也过五分之一了，得记长期异常风险。");
    }
    return lines.join("\n");
  }

  return null;
}

function executeSceneActionCommand(event, stateBundle, actorResult, action, options = {}) {
  const spotlightControl = maybeHandleSpotlightConflict(
    options.originalText || action.kind,
    event,
    stateBundle,
    actorResult
  );
  if (spotlightControl?.blocked) {
    return { reply: spotlightControl.reply };
  }

  const beforeSessionState = cloneJson(stateBundle.sessionState);

  try {
    const result = (options.submitAction || submitAction)(
      stateBundle.sessionState,
      action,
      options.randomInt || defaultRandomInt
    );
    let combatTurnState = null;
    if (action.kind === "start_combat") {
      combatTurnState = syncCombatTurnOrder(stateBundle, { resetRound: true });
    } else if (action.kind === "combat_round") {
      combatTurnState = maybeAdvanceCombatTurn(stateBundle, actorResult.actorId);
    }
    persistSessionStateBundle(stateBundle);
    const deltaSummary = formatStateDelta(beforeSessionState, stateBundle.sessionState);
    const sceneBeat = formatSceneBeat(stateBundle.sessionState);
    const optionCue = formatOptionCue(stateBundle.sessionState);
    const spotlightCue = formatSpotlightCue(stateBundle);
    const combatOrderLine = combatTurnState?.orderLine || null;
    const investigator = stateBundle.sessionState.investigators?.[actorResult.actorId];
    const outcome = result.event || result;
    const operationSummary = describeOperationOutcome(outcome) || action.kind;

    return {
      reply: [
        spotlightControl?.focusLine,
        formatTurnReply(result, { deltaSummary, combatOrderLine, sceneBeat, optionCue, spotlightCue })
      ].filter(Boolean).join("\n"),
      operationEvents: [
        ...(spotlightControl?.operationEvents || []),
        buildOperationEvent("scene.action", `${investigator?.name || getSenderName(event)} 执行了 ${action.kind}：${operationSummary}`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          actorId: actorResult.actorId || null,
          action: cloneJson(action),
          result: cloneJson(outcome || null),
          deltaSummary
        })
      ]
    };
  } catch {
    return {
      reply: "这步我先没稳稳落下去。你换个更短的说法，或者先看 `/aikp state` / `/aikp npcs` 确认一下场上信息。"
    };
  }
}

function handleCombatCommand(event, stateBundle, actorResult, args, options = {}) {
  if (!actorResult?.actorId) {
    return { reply: formatMissingInvestigatorReply(stateBundle, event) };
  }

  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    return { reply: formatStoryPackChoicePrompt() };
  }

  const verb = String(args[0] || "").trim().toLowerCase();
  if (!verb || ["help", "?", "帮助"].includes(verb)) {
    return {
      reply: [
        "战斗最小指令这样用：",
        "- `/aikp combat start [NPC名]`：把当前场面切进战斗态",
        "- `/aikp combat attack [dodge|fight_back] [NPC名]`：结一轮近战，默认先按徒手处理",
        "如果你只是想看场上是谁，先发 `/aikp npcs`。"
      ].join("\n")
    };
  }

  if (verb === "start") {
    const selector = args.slice(1).join(" ").trim();
    const currentNpcs = Array.isArray(stateBundle.sessionState.scene?.participants?.npcs)
      ? stateBundle.sessionState.scene.participants.npcs.filter(Boolean)
      : [];
    const chosenNpc = resolveCombatNpc(stateBundle.sessionState, selector);
    if (!currentNpcs.length) {
      return {
        reply: "场上这会儿还没有可直接接战的目标。你先用 `/aikp npcs` 看看，或者先把场景推进到有人顶上来的那一步。"
      };
    }
    if (selector && !chosenNpc) {
      return {
        reply: "我没在当前场景里对上这个目标。你先用 `/aikp npcs` 看一下场上名字，再点一个开战。"
      };
    }
    const enemies = selector && chosenNpc
      ? [cloneCombatNpc(chosenNpc)]
      : currentNpcs.map((npc) => cloneCombatNpc(npc));
    return executeSceneActionCommand(event, stateBundle, actorResult, {
      kind: "start_combat",
      actorId: actorResult.actorId,
      enemies
    }, options);
  }

  if (verb === "attack") {
    if (stateBundle.sessionState.scene?.sceneType !== "combat") {
      return { reply: "现在还没进战斗态。先发 `/aikp combat start`，我再帮你结这一轮。" };
    }

    const { defenseMode, selector } = resolveCombatDefenseMode(args.slice(1));
    const chosenNpc = resolveCombatNpc(stateBundle.sessionState, selector);
    if (!chosenNpc) {
      return {
        reply: "我没找到这轮要接你动作的对手。先看 `/aikp npcs`，或者直接 `/aikp combat attack fight_back` 先对当前目标结一轮。"
      };
    }

    const investigator = stateBundle.sessionState.investigators?.[actorResult.actorId];
    const attackSkill = findInvestigatorSkillEntry(investigator, "Fighting");
    if (!attackSkill) {
      return { reply: "你这张卡上还没有 Fighting，我这边先不硬结近战。可以换人，或者之后补更完整的战斗技能。" };
    }

    const npcProfile = normalizeCombatNpcProfile(chosenNpc);
    return executeSceneActionCommand(event, stateBundle, actorResult, {
      kind: "combat_round",
      actorId: actorResult.actorId,
      attackSkill: "Fighting",
      attackValue: Number(attackSkill.value || 0),
      defendSkill: defenseMode === "fight_back" ? "Fighting" : "Dodge",
      defendValue: defenseMode === "fight_back" ? npcProfile.fighting : npcProfile.dodge,
      defenseMode,
      baseDamage: "1D3",
      counterBaseDamage: npcProfile.damage
    }, options);
  }

  return {
    reply: "这条战斗指令我先没对上。现在先支持 `/aikp combat start` 和 `/aikp combat attack [dodge|fight_back]`。"
  };
}

function handleSanCommand(event, stateBundle, actorResult, args, options = {}) {
  if (!actorResult?.actorId) {
    return { reply: formatMissingInvestigatorReply(stateBundle, event) };
  }

  const randomInt = options.randomInt || defaultRandomInt;
  let successSpec = args[0] || "";
  let failSpec = args[1] || "";
  if (!failSpec && String(successSpec).includes("/")) {
    [successSpec, failSpec] = String(successSpec).split("/", 2);
  }

  const successLoss = resolveLossSpec(successSpec, randomInt);
  const failLoss = resolveLossSpec(failSpec, randomInt);
  if (successLoss == null || failLoss == null) {
    return {
      reply: "SAN 这条要给我成功/失败两档损失，比如 `/aikp san 0 1` 或 `/aikp san 1/1d4`。"
    };
  }

  const modeToken = String(args[2] || "").trim().toLowerCase();
  const mode = ["hidden", "暗骰"].includes(modeToken) ? "hidden" : "open";
  return executeSceneActionCommand(event, stateBundle, actorResult, {
    kind: "san_check",
    actorId: actorResult.actorId,
    onSuccessLoss: successLoss,
    onFailLoss: failLoss,
    mode
  }, options);
}

function runGroupLuckRollCommand(stateBundle, randomInt = defaultRandomInt) {
  const entries = buildPartyEntries(stateBundle)
    .filter((entry) => entry.investigator && Number.isFinite(Number(entry.investigator.resources?.luck)));

  if (!entries.length) {
    return {
      ok: false,
      reply: "现在名单里还没有能拿来过幸运的调查员。先让要参团的人建卡，或把现有人物卡接进来。"
    };
  }

  const sortedEntries = [...entries].sort((left, right) => {
    const leftLuck = Number(left.investigator?.resources?.luck || 0);
    const rightLuck = Number(right.investigator?.resources?.luck || 0);
    if (leftLuck !== rightLuck) return leftLuck - rightLuck;
    return String(left.investigator?.name || left.userName || left.userId)
      .localeCompare(String(right.investigator?.name || right.userName || right.userId), "zh-Hans-CN");
  });
  const lowestLuck = Number(sortedEntries[0].investigator.resources.luck || 0);
  const lowestEntries = sortedEntries.filter((entry) => Number(entry.investigator?.resources?.luck || 0) === lowestLuck);
  const chosenEntry = lowestEntries.find((entry) => entry.isCurrent) || lowestEntries[0];
  const check = runCheck(
    {
      checkType: "luck",
      mode: "open",
      skillKey: "Luck",
      targetValue: lowestLuck,
      difficulty: "regular"
    },
    randomInt
  );
  const lowestNames = lowestEntries.map((entry) => entry.investigator?.name || entry.userName || entry.userId);
  const lines = [
    entries.length >= 2
      ? "这次按 CoC7 的 group Luck 走，吃在场里最低的 Luck。"
      : "现在就你一个人在场，这次就直接按你的 Luck 来判。"
  ];

  if (lowestEntries.length >= 2) {
    lines.push(`当前最低 Luck 是 ${lowestLuck}：${lowestNames.join("、")} 并列。这里先按 ${chosenEntry.investigator.name} 这条来判全队。`);
  } else {
    lines.push(`当前最低 Luck 是 ${chosenEntry.investigator.name} 的 ${lowestLuck}。`);
  }

  lines.push(formatCheckResultLine(check));
  lines.push(check.result.success ? "这次幸运检定过了。" : "这次幸运检定没过。");

  return {
    ok: true,
    reply: lines.join("\n"),
    roll: check.roll,
    targetValue: check.targetValue,
    successLevel: check.result.successLevel,
    success: check.result.success,
    chosenEntry,
    lowestNames,
    lowestLuck,
    memberCount: entries.length
  };
}

function formatSceneBeat(sessionState) {
  const dangerLevel = sessionState.scene?.threats?.dangerLevel || "low";
  const npcs = Array.isArray(sessionState.scene?.participants?.npcs) ? sessionState.scene.participants.npcs : [];
  const guardedNpcs = npcs.filter((npc) => ["guarded", "hostile"].includes(npc.attitude)).map((npc) => npc.name);
  const recentTriggeredEvent = [...(sessionState.scene?.events || [])].reverse().find((item) => item.triggered);
  const lines = [];

  if (dangerLevel === "low") lines.push("场上此刻还没彻底炸开，但空气已经有点绷住了。");
  if (dangerLevel === "medium") lines.push("场上已经开始起刺了，再多碰几下，后果会往外翻。");
  if (dangerLevel === "high") lines.push("场面已经很紧，谁再往前硬顶，教堂这口气就要变脸了。");
  if (dangerLevel === "extreme") lines.push("现在这地方已经快绷断了，下一步很可能直接出大动静。");

  if (guardedNpcs.length) {
    lines.push(`现在明显绷着的人有：${guardedNpcs.join("、")}。`);
  }

  if (recentTriggeredEvent?.label) {
    lines.push(`刚刚场里最新冒出来的是：${recentTriggeredEvent.label}。`);
  }

  return lines.join("\n");
}

function formatOptionCue(sessionState) {
  const options = Array.isArray(sessionState.scene?.nextOptions) ? sessionState.scene.nextOptions : [];
  if (!options.length) return null;
  return `你们眼下最顺手的路有：${options.slice(0, 3).map((item) => item.label).join("、")}。`;
}

function formatSpotlightCue(stateBundle) {
  const turnState = ensureTurnState(stateBundle.meta);
  const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
  if (!currentActor) return null;
  return `当前 spotlight 还在 ${currentActor.name} 这边；想切人就用 "/aikp next" 或 "/aikp focus <名字>"。`;
}

function formatTurnReply(result, extras = {}) {
  if (!result) return "这下我没接住，怪。";
  const parts = [];
  const resolvedActionLine = formatResolvedActionResult(result);
  if (resolvedActionLine) parts.push(resolvedActionLine);
  if (result.warningLine) parts.push(result.warningLine);
  if (result.adjudicationBonusLine) parts.push(result.adjudicationBonusLine);
  if (result.preRollLine) parts.push(result.preRollLine);
  if (result.postRollLine) parts.push(result.postRollLine);
  if (result.narrativeLine) parts.push(result.narrativeLine);
  const checkResultLine = formatCheckResultLine(result.event);
  if (checkResultLine) parts.push(checkResultLine);
  if (extras.deltaSummary) parts.push(extras.deltaSummary);
  if (extras.combatOrderLine) parts.push(extras.combatOrderLine);
  if (extras.sceneBeat) parts.push(extras.sceneBeat);
  if (result.event?.outcome?.nextPrompt) parts.push(result.event.outcome.nextPrompt);
  if (extras.optionCue) parts.push(extras.optionCue);
  if (extras.spotlightCue) parts.push(extras.spotlightCue);
  return parts.filter(Boolean).join("\n");
}

function formatInvestigatorSummary(investigator) {
  if (!investigator) return "你现在还没有调查员卡。";
  const skillBits = investigator.skills
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
    .map((skill) => `${skill.key} ${skill.value}`)
    .join("、");
  return [
    `${investigator.name}｜${investigator.occupation}`,
    `年龄：${investigator.age}｜信用评级：${investigator.identity.creditRating}`,
    `属性：STR ${investigator.attributes.STR} / CON ${investigator.attributes.CON} / DEX ${investigator.attributes.DEX} / POW ${investigator.attributes.POW} / INT ${investigator.attributes.INT} / EDU ${investigator.attributes.EDU}`,
    `资源：HP ${investigator.resources.hp} / SAN ${investigator.resources.san} / MOV ${investigator.resources.moveRate}`,
    `擅长：${skillBits}`
  ].join("\n");
}

function formatTraditionalBreakdownLines(breakdown = []) {
  if (!breakdown.length) return [];
  const lines = ["属性骰："];
  for (const entry of breakdown) {
    const diceText = entry.dice.join("+");
    const modifierText = entry.modifier ? `+${entry.modifier}` : "";
    lines.push(`- ${entry.key}：${entry.formula}（${diceText}${modifierText ? `${modifierText}` : ""}=${entry.rawTotal}）→ ${entry.value}`);
  }
  return lines;
}

function formatQuickfireBreakdownLines(investigator) {
  const orderedKeys = ["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU"];
  return [
    "快速分配：",
    `- ${orderedKeys.map((key) => `${key} ${investigator.attributes[key]}`).join(" / ")}`,
    `- Luck ${investigator.resources.luck}`
  ];
}

function formatGeneratedInvestigatorReply(bundle) {
  const modeText = bundle.mode === "quickfire" ? "快速车卡" : "传统随机车卡";
  const lines = [
    `${modeText} 已经给你落好了：`,
    formatInvestigatorSummary(bundle.investigator)
  ];

  if (bundle.mode === "quickfire") {
    lines.push(...formatQuickfireBreakdownLines(bundle.investigator));
  } else {
    lines.push(...formatTraditionalBreakdownLines(bundle.generation.breakdown));
  }

  return lines.join("\n");
}

function formatStoryPackChoicePrompt() {
  const entries = listStoryPackEntries();
  const lines = [
    "先别急着进场，我们先定这次跑哪条线。",
    "当前可选剧本："
  ];

  if (!entries.length) {
    lines.push("- 现在还没有可用 story pack。先补剧本数据吧。");
    return lines.join("\n");
  }

  for (const entry of entries) {
    lines.push(`- ${entry.index}. ${entry.storyPack.title}｜ID ${entry.storyPack.id}｜故事弧 ${entry.campaign.title}｜${(entry.storyPack.sceneIds || []).length} 幕`);
  }

  lines.push("群里继续和我说话时记得带 `@麦麦`。");
  lines.push("回复序号、剧本名，或 `/aikp pack <storyPackId>` 来选择。");
  return lines.join("\n");
}

function formatStoryPackDisplayTitle(storyPack) {
  return String(storyPack?.title || "未命名剧本").replace(/\s*story pack\s*$/i, "").trim();
}

function getStoryPackBriefing(entry) {
  return entry?.storyPack?.sessionBriefing || {};
}

function setPendingSessionBriefing(stateBundle, entry) {
  stateBundle.meta.pendingSessionBriefing = {
    askedAt: new Date().toISOString(),
    storyPackId: entry?.storyPack?.id || stateBundle.meta.storyPackId || null
  };
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
}

function clearPendingSessionBriefing(stateBundle) {
  stateBundle.meta.pendingSessionBriefing = null;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
}

function confirmSessionBriefing(stateBundle) {
  stateBundle.meta.pendingSessionBriefing = null;
  stateBundle.meta.briefingConfirmedAt = new Date().toISOString();
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
}

function formatSessionBriefingReply(stateBundle) {
  const entry = getSelectedStoryPackEntry(stateBundle.meta);
  const briefing = getStoryPackBriefing(entry);
  const isGroupConversation = stateBundle.layout?.conversationKey?.startsWith("onebot-group-");
  const partyMembers = listPartyMembers(stateBundle.meta);
  const lines = [
    `这次先跑《${formatStoryPackDisplayTitle(entry?.storyPack)}》。`,
    "开团前先对一下边界：",
    `- 时代：${briefing.era || "1920 年代调查向"}`,
    `- 地点：${briefing.location || entry?.campaign?.title || "未知地点"}`,
    `- 基调：${briefing.tone || "悬疑、压抑、慢热"}`,
    `- 预计时长：${briefing.estimatedLength || "单幕 1-2 小时"}`,
    `- 人数建议：${briefing.playerCount || "单人到小队都能跑"}`,
  ];
  if (Array.isArray(briefing.contentBoundaries) && briefing.contentBoundaries.length) {
    lines.push(`- 边界：${briefing.contentBoundaries.join("；")}`);
  }
  if (Array.isArray(briefing.houseRules) && briefing.houseRules.length) {
    lines.push(`- 家规：${briefing.houseRules.join("；")}`);
  }
  if (isGroupConversation) {
    if (partyMembers.length) {
      lines.push(`- 当前名单：${partyMembers.map((member) => member.userName).join("、")}`);
    }
    lines.push("- 群里谁要参团，直接 @我 说“开始建卡”、报职业或走 quickfire，我会按 QQ 自动记人。");
    lines.push(`- 多人节奏：默认按 spotlight 轮切；分头行动只做后台软计时，解释合理就过。`);
    lines.push(`- 锁名单：人齐后回“就这些人”或用 \`/aikp lock-party\`。${isPartyLocked(stateBundle.meta) ? "这轮现在已经锁了。" : "现在还是开放加入。"} `);
  }
  lines.push("没问题就回“开始建卡”或直接报职业，我就往下走。");
  return lines.join("\n");
}

function formatAwaitingInvestigatorReply(stateBundle) {
  const entry = getSelectedStoryPackEntry(stateBundle.meta);
  const title = formatStoryPackDisplayTitle(entry?.storyPack);
  const isGroupConversation = stateBundle.layout?.conversationKey?.startsWith("onebot-group-");
  const lines = [
    `这次先跑《${title}》。`,
    "你现在还没车卡，先把调查员卡定下来，我再给你正式开场。",
    "群里继续操作时记得带 `@麦麦`。",
    "传统建卡现在会先掷属性，再定职业和擅长技能；想省事也可以直接走 quickfire。",
    "可以直接说“先roll属性”“记者吧，信用20，侦查图书馆心理学说服”或“给我快速车卡，职业医生”。",
    "继续用指令也行：`/aikp roll`、`/aikp roll journalist`、`/aikp quickfire artist`。"
  ];
  if (isGroupConversation) {
    lines.push(isPartyLocked(stateBundle.meta)
      ? "这轮名单已经锁了；如果你本来就在名单里，直接开始建卡就行。要临时加人就先解锁队伍。"
      : "群里要参团的人都可以直接这么说，我会按 QQ 自动记进这轮名单。");
  }
  return lines.join("\n");
}

function handlePendingSessionBriefing(text, stateBundle) {
  const pending = stateBundle.meta.pendingSessionBriefing;
  if (!pending) return null;
  const normalized = normalizeIntentText(text);
  const choice = detectBriefingConsent(text);
  if (choice === "repeat") {
    return { reply: formatSessionBriefingReply(stateBundle) };
  }
  const wantsChargenNow =
    choice === "confirm"
    || Boolean(extractOccupationKeyFromText(text))
    || includesAny(normalized, ["建卡", "车卡", "roll", "quickfire", "快速车卡", "快速建卡", "算我一个", "我也玩", "我也参加", "我加入", "俺也去", "我也来"]);
  if (wantsChargenNow) {
    confirmSessionBriefing(stateBundle);
    return { passThrough: true };
  }
  const hasInvestigator = Object.keys(stateBundle.sessionState?.investigators || {}).length > 0;
  return {
    blocked: true,
    reply: [
      formatSessionBriefingReply(stateBundle),
      hasInvestigator
        ? "这句先别急着往场景里落，先把开团信息确认掉。"
        : "你这句我先不往场景里落。你还没车卡，先把调查员卡定下来，我再正式开场。"
    ].join("\n\n")
  };
}

function formatDraftProfilePrompt(investigator) {
  return [
    formatInvestigatorSummary(investigator),
    `先别急着开场，这张卡还没锁。现在你还能改：名字 / 年龄 / 外观一句话 / 动机。`,
    `比如可以直接回：“名字林秋，31岁，瘦高戴眼镜，总想把怪事追到底，动机是查清朋友失踪”。`,
    `不想细改就回“默认继续”。`
  ].join("\n");
}

function formatDraftGearPrompt(investigator) {
  const allowanceNotes = Array.isArray(investigator?.inventoryAllowance?.notes)
    ? investigator.inventoryAllowance.notes.join("；")
    : "当前没有额外限制。";
  return [
    `再看下初始携带物：${formatInventorySummary(investigator)}`,
    "你可以直接补想带的东西，我会按时代和配额帮你拦一下。",
    "比如：“带手电、笔记本、小刀、急救包”。不想改就回“默认继续”。",
    `当前裁定：${allowanceNotes}`
  ].join("\n");
}

function formatDraftLockPrompt(investigator) {
  const notes = Array.isArray(investigator?.inventoryAllowance?.notes) ? investigator.inventoryAllowance.notes : [];
  const lines = [
    "卡我先收成这样：",
    formatInvestigatorSummary(investigator),
    `动机：${investigator.motivation || "暂时没补"}`,
    `携带物：${formatInventorySummary(investigator)}`,
  ];
  if (notes.length) {
    lines.push(`携带裁定：${notes.join("；")}`);
  }
  lines.push("确认就回“锁卡”或“开场”；想改资料回“改资料”，想改装备回“改装备”。");
  return lines.join("\n");
}

function normalizePlayerIntroLines(value) {
  if (Array.isArray(value)) {
    return value.map((line) => String(line || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

function findCurrentCampaignSceneMeta(stateBundle, entry) {
  const currentSceneId = stateBundle.sessionState.scene?.meta?.campaign?.currentSceneId
    || stateBundle.sessionState.scene?.meta?.scenarioId
    || stateBundle.sessionState.scene?.sceneId
    || entry?.startSceneId
    || null;
  if (!currentSceneId || !Array.isArray(entry?.campaign?.scenes)) return null;
  return entry.campaign.scenes.find((scene) => scene.sceneId === currentSceneId) || null;
}

function formatPlayerFacingIntro(stateBundle, entry) {
  if (!entry) return null;
  const currentScene = findCurrentCampaignSceneMeta(stateBundle, entry);
  // 这里只吃作者明确标成玩家可见的前情，避免把 purpose/truthLayers 这类幕后信息提前抖出去。
  const candidateLines = [
    ...normalizePlayerIntroLines(currentScene?.playerIntro),
    ...normalizePlayerIntroLines(entry.storyPack?.playerIntro),
    ...normalizePlayerIntroLines(entry.campaign?.playerIntro)
  ];
  return candidateLines.length ? candidateLines.join("\n") : null;
}

function formatSceneStartReply(stateBundle, actorResult) {
  const entry = getSelectedStoryPackEntry(stateBundle.meta);
  const playerIntro = formatPlayerFacingIntro(stateBundle, entry);
  const opening = stateBundle.sessionState.scene.meta?.opening || "场景已经起好了。";
  const prompts = stateBundle.sessionState.scene.meta?.starterPrompts || [];
  const packLine = entry?.storyPack?.title ? `这次跑《${formatStoryPackDisplayTitle(entry.storyPack)}》。` : null;
  const joinLine = actorResult?.investigator ? `当前绑定调查员：${actorResult.investigator.name}。` : null;
  const partyLine = stateBundle.layout?.conversationKey?.startsWith("onebot-group-")
    ? `当前队伍：${inferPartyMode(stateBundle.meta, stateBundle.sessionState) === "group" ? "多人" : "单人"}｜${isPartyLocked(stateBundle.meta) ? "名单已锁" : "名单开放"}。`
    : null;
  const promptLine = prompts.length ? `场景里可以直接试这些：\n- ${prompts.join("\n- ")}` : "你现在可以直接说行动。";
  const helpLine = "群里继续操作时记得带 `@麦麦`。自然语言就行：比如“我想一次全车完卡，角色选记者”“给我快速车卡，职业医生”“我借着手电去看祭坛背后的刮痕”；继续用指令也行：`/aikp roll journalist`、`/aikp quickfire artist`。";
  return [packLine, playerIntro, joinLine, partyLine, opening, promptLine, helpLine].filter(Boolean).join("\n");
}

function formatStartReply(stateBundle, actorResult) {
  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    return formatStoryPackChoicePrompt();
  }
  const pendingDraft = stateBundle.meta.pendingInvestigatorDraft;
  if (pendingDraft?.stage === "profile") {
    return formatDraftProfilePrompt(getPendingDraftInvestigator(stateBundle, pendingDraft));
  }
  if (pendingDraft?.stage === "gear") {
    return formatDraftGearPrompt(getPendingDraftInvestigator(stateBundle, pendingDraft));
  }
  if (pendingDraft?.stage === "lock") {
    return formatDraftLockPrompt(getPendingDraftInvestigator(stateBundle, pendingDraft));
  }
  if (!actorResult?.investigator) {
    if (!stateBundle.meta.briefingConfirmedAt) {
      if (!stateBundle.meta.pendingSessionBriefing) {
        setPendingSessionBriefing(stateBundle, getSelectedStoryPackEntry(stateBundle.meta));
      }
      return formatSessionBriefingReply(stateBundle);
    }
    return formatAwaitingInvestigatorReply(stateBundle);
  }
  if (!stateBundle.meta.sceneIntroDeliveredAt) {
    stateBundle.meta.sceneIntroDeliveredAt = new Date().toISOString();
  }
  return formatSceneStartReply(stateBundle, actorResult);
}

function appendSceneStartReplyIfNeeded(stateBundle, actorResult, replyText) {
  if (!getSelectedStoryPackEntry(stateBundle.meta) || !actorResult?.investigator) {
    return replyText;
  }
  if (stateBundle.meta.sceneIntroDeliveredAt) {
    return replyText;
  }
  return `${replyText}\n\n${formatStartReply(stateBundle, actorResult)}`;
}

function formatHelpReply() {
  return [
    "AI-KP 可用指令：",
    "- 群聊里和我继续交互时，统一带 `@麦麦`，避免误吃到旁边人的讨论",
    "- 平时直接说自然语言也行，例如：先roll属性、记者吧，信用20，侦查图书馆心理学说服、给我快速医生卡",
    "- /aikp start 开始跑团；如果有旧档会先问你续上还是新开，没有旧档就先选剧本",
    "- /aikp packs 查看当前可选剧本",
    "- /aikp pack <storyPackId> 选择这条要跑的剧本",
    "- /aikp roll [occupationKey] 单人传统车卡；会先掷属性，再等你补职业/信用/技能偏好",
    "- /aikp quickfire <occupationKey> 单人快速车卡",
    "- /aikp join 把当前 QQ 记进本轮名单；直接开始建卡也会自动入团",
    "- /aikp leave 把自己先移出本轮名单",
    "- /aikp party-roll <occupationKey> 为当前名单里的玩家批量传统随机车卡",
    "- /aikp party-quickfire <occupationKey> 为当前名单里的玩家批量快速车卡",
    "- /aikp lock-party 锁定本轮名单，防止中途误加人",
    "- /aikp unlock-party 解锁名单，允许补人",
    "- /aikp saves 查看当前线和历史归档",
    "- /aikp resume [saveId] 恢复当前线或某个归档",
    "- /aikp delete <saveId> 删除某个历史归档（会先二次确认）",
    "- /aikp new 把当前线归档后新开一条",
    "- /aikp sheet 查看自己的调查员卡",
    "- /aikp state 查看当前场景状态",
    "- /aikp campaign 查看当前故事弧与预留钩子",
    "- /aikp hooks 查看当前可用推进钩子",
    "- /aikp advance [hookId] 按钩子推进到下一幕",
    "- /aikp storypack 查看当前故事包摘要",
    "- /aikp goto <sceneId> 切到下一幕骨架场景",
    "- /aikp scene 查看场景环境面板",
    "- /aikp recap 看当前阶段总结",
    "- /aikp party 查看队伍面板",
    "- /aikp members / /aikp lobby 也会显示当前名单与状态",
    "- /aikp clues 查看线索面板",
    "- /aikp npcs 查看 NPC 面板",
    "- /aikp who 查看当前轮到谁",
    "- /aikp combat start [NPC名] 把当前场景切进最小战斗态",
    "- /aikp combat attack [dodge|fight_back] [NPC名] 结一轮近战",
    "- /aikp san <成功损失> <失败损失> [hidden] 过一次 SAN 检定",
    "- /aikp group-luck 按 CoC7 group Luck 规则，用当前在场最低 Luck 给全队过一次幸运",
    "- /aikp focus <玩家名> 手动切到某位玩家",
    "- /aikp next 切到下一位玩家",
    "- /aikp settle 生成本轮结团摘要",
    "- /aikp reset 重开当前场景",
    `职业 key 可先用：${listOccupationTemplates().map((occupation) => occupation.key).join(" ")}`
  ].join("\n");
}

function formatSettlementReply(settlement, stateBundle = null) {
  const lines = ["这轮先帮你收一下："];
  if (settlement?.timelineSummary?.combatRound > 0) {
    lines.push(`战斗轮次：第 ${settlement.timelineSummary.combatRound} 轮收口。`);
  }
  if (Array.isArray(settlement.summaryLines)) lines.push(...settlement.summaryLines);
  if (stateBundle) {
    const runtimeNpcAftermath = listCampaignRuntimeNpcAftermath(stateBundle.sessionState)
      .filter((npc) => npc.attitude !== "neutral" || npc.suspicion || npc.fear || npc.affinity || npc.obligation || npc.flags.length)
      .filter((npc, index, collection) => collection.findIndex((entry) => entry.id === npc.id) === index)
      .filter((npc) => !Array.isArray(settlement?.npcAftermath) || !settlement.npcAftermath.some((entry) => entry.id === npc.id));
    if (runtimeNpcAftermath.length) {
      lines.push(`跨幕 NPC 后效：${runtimeNpcAftermath.map((npc) => `${npc.name}[${npc.attitude}]`).join("、")}`);
    }
    const investigatorLines = Object.values(stateBundle.sessionState?.investigators || {})
      .map((investigator) => formatInvestigatorStateLine(investigator, stateBundle.meta, { includeInventory: true }))
      .filter(Boolean);
    if (investigatorLines.length) {
      lines.push("持续状态：");
      lines.push(...investigatorLines.map((line) => `- ${line}`));
    }
  }
  lines.push(`事件数：${settlement.eventCount}`);
  return lines.join("\n");
}

function buildSessionEnterOperationEvent(event, actionText = "进入了本群 AI-KP") {
  return buildOperationEvent("session.enter", `${getSenderName(event)} ${actionText}`, {
    userId: event.user_id != null ? String(event.user_id) : null
  });
}

function buildStartPanelResponse(event, stateBundle, actorResult, operationEvents = []) {
  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    const prompt = maybePromptForStoryPackChoice(event, stateBundle) || {
      reply: formatStoryPackChoicePrompt(),
      operationEvents: []
    };
    return {
      stateBundle: prompt.stateBundle || stateBundle,
      reply: prompt.reply,
      operationEvents: [...operationEvents, ...(prompt.operationEvents || [])]
    };
  }

  return {
    stateBundle,
    reply: formatStartReply(stateBundle, actorResult),
    operationEvents
  };
}

function parseCommand(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return {
    command: tokens[0] || "",
    args: tokens.slice(1)
  };
}

function resolveOccupationKey(rawValue, fallback = "journalist") {
  if (!rawValue) return fallback;
  const detected = detectOccupationKeyFromText(rawValue, fallback);
  try {
    getOccupationTemplate(detected);
    return detected;
  } catch {
    return fallback;
  }
}

function createInvestigatorForMode(event, mode, occupationKey, randomInt) {
  return buildInvestigatorBundleForMode(event, mode, occupationKey, randomInt);
}

function formatPartyRollReply(createdBundles, mode) {
  const modeText = mode === "quickfire" ? "快速车卡" : "传统随机车卡";
  const lines = [`这轮我已经帮当前这批玩家批量做了 ${modeText}：`];
  for (const bundle of createdBundles) {
    const investigator = bundle.investigator;
    lines.push(`- ${investigator.name}｜${investigator.occupation}｜HP ${investigator.resources.hp}｜SAN ${investigator.resources.san}`);
    if (bundle.mode === "quickfire") {
      lines.push(`  ${formatQuickfireBreakdownLines(investigator).slice(1).join("｜")}`);
      continue;
    }

    const highlight = (bundle.generation.breakdown || [])
      .map((entry) => `${entry.key} ${entry.rawTotal}->${entry.value}`)
      .join(" / ");
    lines.push(`  ${highlight}`);
  }
  lines.push("现在可以用 `/aikp party` 看队伍面板，用 `/aikp next` 往下一位切。\n");
  return lines.join("\n");
}

function runSingleRollCommand(event, stateBundle, mode, occupationKey, randomInt) {
  const joinResult = upsertPartyMember(stateBundle, event, { save: false });
  if (!joinResult.ok) {
    return {
      reply: joinResult.reply,
      suppressSceneStart: true
    };
  }
  if (mode === "traditional") {
    return beginTraditionalDraft(event, stateBundle, occupationKey || null, randomInt);
  }
  const bundle = createInvestigatorForMode(event, mode, occupationKey, randomInt);
  upsertInvestigatorForUser(event, stateBundle, bundle.investigator);
  return {
    bundle,
    ...beginInvestigatorReviewFlow(stateBundle, bundle, {
      baseReply: formatGeneratedInvestigatorReply(bundle)
    })
  };
}

function runPartyRollCommand(event, stateBundle, mode, occupationKey, randomInt) {
  const createdBundles = [];
  let members = listPartyMembers(stateBundle.meta);
  if (!members.length) {
    const joinResult = upsertPartyMember(stateBundle, event, { save: false });
    members = listPartyMembers(stateBundle.meta);
    return {
      reply: joinResult.ok
        ? "我先把你记进这轮名单了。其他要参团的人也直接 @我 报职业、开始建卡，或先 `/aikp join`；等人齐了再批量车卡会更准。"
        : joinResult.reply,
      bundles: [],
      suppressSceneStart: true
    };
  }

  for (const user of members) {
    const fakeEvent = {
      user_id: user.userId,
      sender: { nickname: user.userName }
    };
    const existing = getActorForUser(stateBundle, user.userId);
    const resolvedOccupation = occupationKey || existing?.occupationKey || "journalist";
    const bundle = createInvestigatorForMode(fakeEvent, mode, resolvedOccupation, randomInt);
    addInvestigator(stateBundle.sessionState, bundle.investigator);
    syncInventoryBaseline(stateBundle.meta, bundle.investigator);
    stateBundle.meta.actorsByUserId[String(user.userId)] = bundle.investigator.id;
    stateBundle.meta.partyRosterByUserId[String(user.userId)] = {
      ...stateBundle.meta.partyRosterByUserId[String(user.userId)],
      userId: String(user.userId),
      userName: user.userName,
      status: "ready",
      investigatorId: bundle.investigator.id,
      joinedAt: stateBundle.meta.partyRosterByUserId[String(user.userId)]?.joinedAt || new Date().toISOString(),
      readyAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };
    syncActorIntoTurnState(stateBundle.meta, bundle.investigator.id);
    createdBundles.push({
      ...bundle,
      sourceUserId: String(user.userId),
      sourceUserName: user.userName
    });
  }

  pruneTurnStateToParty(stateBundle, { save: false });
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatPartyRollReply(createdBundles, mode),
    bundles: createdBundles
  };
}

function buildOperationEvent(kind, summary, payload = {}) {
  return {
    timestamp: new Date().toISOString(),
    kind,
    summary,
    ...payload
  };
}

function setSessionMode(stateBundle, sessionMode) {
  stateBundle.meta.sessionMode = sessionMode;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return sessionMode;
}

function buildChatLogEntry(event, direction, message) {
  return {
    timestamp: new Date().toISOString(),
    conversationKey: buildConversationKey(event),
    direction,
    message,
    messageId: event.message_id || null,
    messageType: event.message_type || (event.group_id ? "group" : "private"),
    userId: event.user_id != null ? String(event.user_id) : null,
    senderName: getSenderName(event)
  };
}

function buildStateSnapshot(stateBundle, userId = null) {
  const turnState = ensureTurnState(stateBundle.meta);
  const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
  const partyEntries = buildPartyEntries(stateBundle);
  const pendingSessionBriefing =
    stateBundle.meta.pendingSessionBriefing &&
    typeof stateBundle.meta.pendingSessionBriefing === "object"
      ? {
        storyPackId: stateBundle.meta.pendingSessionBriefing.storyPackId || stateBundle.meta.storyPackId || null
      }
      : null;
  const activePendingDraft = getPendingInvestigatorDraftForUser(stateBundle.meta, userId);
  const pendingDraft = activePendingDraft
    && TRADITIONAL_DRAFT_STAGES.has(String(activePendingDraft.stage || ""))
      ? {
      stage: activePendingDraft.stage,
      occupationKey: activePendingDraft.occupationKey || null,
      occupationName: activePendingDraft.occupationKey
        ? getOccupationTemplate(activePendingDraft.occupationKey).name
        : null
      }
    : null;
  const pendingSceneActionChoice =
    stateBundle.meta.pendingSceneActionChoice &&
    typeof stateBundle.meta.pendingSceneActionChoice === "object"
      ? {
        kind: stateBundle.meta.pendingSceneActionChoice.kind || null,
        targetNpcName: stateBundle.meta.pendingSceneActionChoice.targetNpcName || null,
        options: Array.isArray(stateBundle.meta.pendingSceneActionChoice.options)
          ? stateBundle.meta.pendingSceneActionChoice.options
            .map((option) => option?.displayLabel)
            .filter(Boolean)
            .slice(0, 4)
          : []
      }
      : null;
  return {
    updatedAt: new Date().toISOString(),
    conversationKey: stateBundle.layout.conversationKey,
    sessionMode: stateBundle.meta.sessionMode || "idle",
    runtimeProfileId: stateBundle.meta.runtimeProfileId || "maimai-kp-v1",
    summaryState: cloneJson(stateBundle.meta.summaryState || {}),
    knownUsers: cloneJson(stateBundle.meta.knownUsers || []),
    party: {
      mode: inferPartyMode(stateBundle.meta, stateBundle.sessionState),
      locked: isPartyLocked(stateBundle.meta),
      lockedAt: stateBundle.meta.partyLockedAt || null,
      memberCount: partyEntries.length,
      members: partyEntries.map((entry) => ({
        userId: entry.userId,
        userName: entry.userName,
        status: entry.status || (entry.investigator ? "ready" : "joined"),
        actorId: entry.actorId || null,
        investigatorName: entry.investigator?.name || null,
        occupation: entry.investigator?.occupation || null,
        isCurrent: entry.isCurrent === true,
        softTimeLagMinutes: entry.softTimeLagMinutes || 0,
        lastActionSummary: entry.lastActionSummary || null
      }))
    },
    turnState: {
      actorOrder: [...turnState.actorOrder],
      currentActorId: turnState.currentActorId,
      currentActorName: currentActor?.name || null,
      round: turnState.round,
      actorSyncById: cloneJson(turnState.actorSyncById || {})
    },
    pendingSessionBriefing,
    briefingConfirmedAt: stateBundle.meta.briefingConfirmedAt || null,
    pendingInvestigatorDraft: pendingDraft,
    pendingSceneActionChoice,
    revealedClues: (stateBundle.sessionState.scene?.clues || [])
      .filter((item) => item.revealed)
      .map((item) => item.title),
    scene: {
      summary: stateBundle.sessionState.scene?.summary || null,
      location: stateBundle.sessionState.scene?.location || null,
      dangerLevel: stateBundle.sessionState.scene?.threats?.dangerLevel || null,
      exposure: stateBundle.sessionState.scene?.threats?.exposure ?? 0,
      pressure: stateBundle.sessionState.scene?.threats?.pressure ?? 0,
      timelineMinute: stateBundle.sessionState.scene?.timeState?.timelineMinute ?? 0,
      combatRound: stateBundle.sessionState.scene?.timeState?.combatRound ?? 0
    },
    investigators: Object.values(stateBundle.sessionState.investigators || {}).map((investigator) => ({
      id: investigator.id,
      name: investigator.name,
      occupation: investigator.occupation,
      occupationKey: investigator.occupationKey,
      hp: investigator.resources?.hp ?? null,
      san: investigator.resources?.san ?? null,
      luck: investigator.resources?.luck ?? null
    })),
    sessionState: cloneJson(stateBundle.sessionState)
  };
}

function createArchiveSaveId(meta = {}) {
  const nextIndex = (Array.isArray(meta.archiveHistory) ? meta.archiveHistory.length : 0) + 1;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `save-${String(nextIndex).padStart(4, "0")}-${stamp}`;
}

function buildArchiveLayout(layout, saveId) {
  const dir = join(layout.archiveConversationDir, saveId);
  return {
    dir,
    sessionFile: join(dir, "session.json"),
    metaFile: join(dir, "meta.json"),
    logsDir: join(dir, "logs"),
    manifestFile: join(dir, "manifest.json")
  };
}

function hasMeaningfulSessionProgress(layout, meta = {}, sessionState = {}) {
  if (Object.keys(sessionState.investigators || {}).length) return true;
  if ((sessionState.scene?.timeState?.timelineMinute || 0) > 0) return true;
  const ledgerEvents = safeReadJsonLines(layout.ledgerLogFile).filter((event) => event.kind !== "summary.rollup");
  if (ledgerEvents.length) return true;
  return Number(meta.messageCount || 0) > 2;
}

function summarizeConversationSave(stateBundle, overrides = {}) {
  const snapshot = buildStateSnapshot(stateBundle);
  return {
    saveId: overrides.saveId || "current",
    kind: overrides.kind || "active",
    source: overrides.source || null,
    savedAt: overrides.savedAt || stateBundle.meta.updatedAt || snapshot.updatedAt,
    updatedAt: stateBundle.meta.updatedAt || snapshot.updatedAt,
    scenarioId: stateBundle.meta.scenarioId || stateBundle.sessionState.scene?.meta?.scenarioId || null,
    sessionMode: stateBundle.meta.sessionMode || "idle",
    sceneSummary: snapshot.scene.summary || null,
    location: snapshot.scene.location || null,
    currentActorName: snapshot.turnState.currentActorName || null,
    investigatorCount: snapshot.investigators.length,
    clueCount: snapshot.revealedClues.length
  };
}

function formatSaveRecordLine(record, label = null) {
  const bits = [
    label || record.saveId,
    record.sceneSummary || "未命名场景",
    record.location ? `地点 ${record.location}` : null,
    record.currentActorName ? `当前聚焦 ${record.currentActorName}` : null,
    `玩家 ${record.investigatorCount || 0} 人`,
    `线索 ${record.clueCount || 0} 条`,
    `保存 ${record.savedAt || record.updatedAt || "unknown"}`
  ].filter(Boolean);
  return `- ${bits.join("｜")}`;
}

function findArchiveRecord(meta = {}, selector = "") {
  ensureConversationControlState(meta);
  const archives = Array.isArray(meta.archiveHistory) ? meta.archiveHistory : [];
  if (!archives.length) return null;
  if (!selector) return archives.at(-1) || null;

  const normalized = String(selector).trim().toLowerCase();
  if (!normalized) return archives.at(-1) || null;

  const exact = archives.find((item) => String(item.saveId || "").toLowerCase() === normalized);
  if (exact) return exact;

  const partialMatches = archives.filter((item) => String(item.saveId || "").toLowerCase().includes(normalized));
  if (partialMatches.length === 1) return partialMatches[0];
  return null;
}

function archiveConversationState(stateBundle, source = "manual") {
  ensureConversationControlState(stateBundle.meta);
  if (!hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    return null;
  }

  const saveId = createArchiveSaveId(stateBundle.meta);
  const archiveLayout = buildArchiveLayout(stateBundle.layout, saveId);
  mkdirSync(archiveLayout.dir, { recursive: true });

  if (existsSync(stateBundle.layout.sessionFile)) {
    cpSync(stateBundle.layout.sessionFile, archiveLayout.sessionFile);
  }
  if (existsSync(stateBundle.layout.metaFile)) {
    cpSync(stateBundle.layout.metaFile, archiveLayout.metaFile);
  }
  if (existsSync(stateBundle.layout.logsConversationDir)) {
    cpSync(stateBundle.layout.logsConversationDir, archiveLayout.logsDir, { recursive: true });
  }

  const record = summarizeConversationSave(stateBundle, {
    saveId,
    kind: "archive",
    source,
    savedAt: new Date().toISOString()
  });
  writeFileSync(archiveLayout.manifestFile, JSON.stringify(record, null, 2), "utf8");

  stateBundle.meta.archiveHistory.push(record);
  stateBundle.meta.updatedAt = new Date().toISOString();
  stateBundle.meta.pendingSessionBriefing = null;
  stateBundle.meta.pendingResumeChoice = null;
  stateBundle.meta.pendingDeleteChoice = null;
  stateBundle.meta.pendingStoryPackChoice = null;
  saveMeta(stateBundle.layout, stateBundle.meta);
  return record;
}

function preserveConversationControls(meta = {}) {
  ensureConversationControlState(meta);
  return {
    archiveHistory: cloneJson(meta.archiveHistory || []),
    runtimeProfileId: meta.runtimeProfileId || "maimai-kp-v1",
    storyPackId: meta.storyPackId || null,
    briefingConfirmedAt: meta.briefingConfirmedAt || null,
    partyRosterByUserId: cloneJson(meta.partyRosterByUserId || {}),
    partyLockedAt: meta.partyLockedAt || null,
    pendingInvestigatorDraftsByUserId: {},
    pendingInvestigatorDraft: null,
    pendingSceneActionChoice: null,
    pendingDeleteChoice: null
  };
}

function applyPreservedConversationControls(meta = {}, preserved = {}) {
  ensureConversationControlState(meta);
  meta.archiveHistory = cloneJson(preserved.archiveHistory || []);
  meta.runtimeProfileId = preserved.runtimeProfileId || meta.runtimeProfileId || "maimai-kp-v1";
  meta.pendingSessionBriefing = null;
  meta.pendingResumeChoice = null;
  meta.pendingDeleteChoice = null;
  meta.pendingStoryPackChoice = null;
  meta.partyRosterByUserId = cloneJson(preserved.partyRosterByUserId || {});
  meta.partyLockedAt = preserved.partyLockedAt || null;
  meta.pendingInvestigatorDraftsByUserId = {};
  meta.pendingInvestigatorDraft = null;
  meta.pendingSceneActionChoice = null;
  meta.storyPackId = preserved.storyPackId || meta.storyPackId || null;
  meta.briefingConfirmedAt = preserved.briefingConfirmedAt || meta.briefingConfirmedAt || null;
  return meta;
}

function downgradePartyRosterForFreshLine(roster = {}) {
  const nextRoster = {};
  for (const [userId, member] of Object.entries(roster || {})) {
    const resolvedUserId = String(userId || "").trim();
    if (!resolvedUserId || !member || typeof member !== "object") continue;
    nextRoster[resolvedUserId] = {
      userId: resolvedUserId,
      userName:
        typeof member.userName === "string" && member.userName.trim()
          ? member.userName.trim()
          : `玩家${resolvedUserId}`,
      status: "joined",
      investigatorId: null,
      joinedAt:
        typeof member.joinedAt === "string" && member.joinedAt.trim()
          ? member.joinedAt.trim()
          : new Date().toISOString(),
      readyAt: null,
      lastActiveAt:
        typeof member.lastActiveAt === "string" && member.lastActiveAt.trim()
          ? member.lastActiveAt.trim()
          : null,
    };
  }
  return nextRoster;
}

function clearActiveConversationArtifacts(layout) {
  rmSync(layout.logsConversationDir, { recursive: true, force: true });
}

function startFreshConversationLine(event, stateBundle, options = {}) {
  const preserved = preserveConversationControls(stateBundle.meta);
  clearActiveConversationArtifacts(stateBundle.layout);
  const fresh = rebuildConversationSession(event, {
    storageRoot: stateBundle.layout.root,
    scenarioId: stateBundle.meta.scenarioId,
    campaignId: stateBundle.meta.campaignId,
    reset: true
  });
  preserved.partyRosterByUserId = downgradePartyRosterForFreshLine(preserved.partyRosterByUserId);
  preserved.partyLockedAt = null;
  applyPreservedConversationControls(fresh.meta, preserved);
  saveMeta(fresh.layout, fresh.meta);
  setSessionMode(fresh, "kp");
  const actor = ensureActorForUser(event, fresh, {
    autoCreateInvestigator: false
  });
  return { stateBundle: fresh, actor };
}

function restoreArchivedConversation(event, stateBundle, selector, options = {}) {
  const selected = findArchiveRecord(stateBundle.meta, selector);
  if (!selected) {
    return {
      ok: false,
      reason: "archive_not_found",
      reply: selector
        ? "我没找到这个存档。先发 `/aikp saves` 看一下可用 saveId。"
        : "现在还没有可恢复的存档。"
    };
  }

  if (hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    archiveConversationState(stateBundle, "resume-swap");
  }

  const latestMeta = loadMeta(stateBundle.layout) || stateBundle.meta;
  const preserved = preserveConversationControls(latestMeta);
  const archiveLayout = buildArchiveLayout(stateBundle.layout, selected.saveId);

  if (!existsSync(archiveLayout.sessionFile) || !existsSync(archiveLayout.metaFile)) {
    return {
      ok: false,
      reason: "archive_files_missing",
      reply: "这个存档条目还在，但底层文件已经不见了。你先 `/aikp saves` 看一下别的档吧。"
    };
  }

  clearActiveConversationArtifacts(stateBundle.layout);
  cpSync(archiveLayout.sessionFile, stateBundle.layout.sessionFile);
  cpSync(archiveLayout.metaFile, stateBundle.layout.metaFile);
  if (existsSync(archiveLayout.logsDir)) {
    cpSync(archiveLayout.logsDir, stateBundle.layout.logsConversationDir, { recursive: true });
  }

  const restoredMeta = loadMeta(stateBundle.layout) || {};
  applyPreservedConversationControls(restoredMeta, preserved);
  saveMeta(stateBundle.layout, restoredMeta);
  const restoredSession = loadSessionApi(stateBundle.layout.sessionFile);
  const restoredBundle = {
    layout: stateBundle.layout,
    meta: restoredMeta,
    sessionState: restoredSession,
    created: false
  };
  setSessionMode(restoredBundle, "kp");
  const actor = ensureActorForUser(event, restoredBundle, {
    autoCreateInvestigator: false
  });
  return {
    ok: true,
    record: selected,
    stateBundle: restoredBundle,
    actor
  };
}

function getResumeCandidate(stateBundle) {
  if (hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    return {
      source: "active",
      record: summarizeConversationSave(stateBundle, {
        saveId: "current",
        kind: "active",
        source: "current"
      })
    };
  }

  const latestArchive = findArchiveRecord(stateBundle.meta);
  if (latestArchive) {
    return {
      source: "archive",
      record: latestArchive
    };
  }

  return null;
}

function formatResumeChoicePrompt(candidate) {
  return [
    "我这边看到这个群已经有旧档了：",
    formatSaveRecordLine(candidate.record, candidate.source === "active" ? "current" : candidate.record.saveId),
    "你要 `续上` 这条，还是 `新开` 一条？",
    "群里继续操作时记得带 `@麦麦`。",
    "想看历史存档可以发 `/aikp saves`。"
  ].join("\n");
}

function formatSaveListReply(stateBundle) {
  const lines = ["当前可用存档："];
  if (hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    lines.push(formatSaveRecordLine(summarizeConversationSave(stateBundle), "current"));
  }

  const archives = [...(stateBundle.meta.archiveHistory || [])].reverse();
  if (!archives.length) {
    lines.push("- 还没有归档存档。");
    return lines.join("\n");
  }

  for (const archive of archives) {
    lines.push(formatSaveRecordLine(archive));
  }
  lines.push("想删某个历史归档就发 `/aikp delete <saveId>`。");
  return lines.join("\n");
}

function formatDeleteSavePrompt(record) {
  return [
    "你要删的是这条历史归档：",
    formatSaveRecordLine(record),
    "确认就回“确认删除”或“删掉它”；不删就回“取消”。",
    "想先看完整列表也可以发 `/aikp saves`。"
  ].join("\n");
}

function detectDeleteChoice(text = "") {
  const normalized = String(text).trim().toLowerCase();
  if (!normalized) return null;
  if (includesAny(normalized, ["看看存档", "存档列表", "存档", "列表", "list", "save"])) return "list";
  if (includesAny(normalized, ["取消", "算了", "不删", "别删", "no", "cancel"])) return "cancel";
  if (includesAny(normalized, ["确认删除", "删掉它", "删了它", "删掉", "删除", "删档", "确认", "yes"])) return "confirm";
  return null;
}

function promptDeleteArchive(event, stateBundle, selector) {
  if (!selector) {
    return {
      reply: `${formatSaveListReply(stateBundle)}\n给我一个 saveId，我就帮你删对应的历史归档。`
    };
  }

  if (String(selector).trim().toLowerCase() === "current") {
    return {
      reply: "当前这条线不能直接按删档处理。你如果是不想留它，可以先 `/aikp new` 开新线，或者 `/aikp reset` 重置当前进度。"
    };
  }

  const record = findArchiveRecord(stateBundle.meta, selector);
  if (!record) {
    return {
      reply: "我没找到这个历史归档。先发 `/aikp saves` 看一下可用 saveId。"
    };
  }

  stateBundle.meta.pendingDeleteChoice = {
    askedAt: new Date().toISOString(),
    saveId: record.saveId,
    ownerUserId: event.user_id != null ? String(event.user_id) : null,
    ownerUserName: getSenderName(event)
  };
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatDeleteSavePrompt(record),
    operationEvents: [buildOperationEvent("session.delete_prompt", `${getSenderName(event)} 准备删除存档 ${record.saveId}`, {
      userId: event.user_id != null ? String(event.user_id) : null,
      saveId: record.saveId
    })]
  };
}

function deleteArchivedConversation(stateBundle, selector) {
  const record = findArchiveRecord(stateBundle.meta, selector);
  if (!record) {
    return {
      ok: false,
      reason: "archive_not_found",
      reply: "我没找到这个历史归档。先发 `/aikp saves` 看一下可用 saveId。"
    };
  }

  const archiveLayout = buildArchiveLayout(stateBundle.layout, record.saveId);
  rmSync(archiveLayout.dir, { recursive: true, force: true });
  stateBundle.meta.archiveHistory = (stateBundle.meta.archiveHistory || []).filter((item) => item.saveId !== record.saveId);
  if (stateBundle.meta.pendingDeleteChoice?.saveId === record.saveId) {
    stateBundle.meta.pendingDeleteChoice = null;
  }
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    ok: true,
    record
  };
}

function activateStoryPackSelection(event, stateBundle, storyPackId) {
  const selected = listStoryPackEntries().find((entry) => entry.storyPack.id === storyPackId);
  if (!selected) return null;

  const preservedControls = preserveConversationControls(stateBundle.meta);
  const preservedKnownUsers = cloneJson(stateBundle.meta.knownUsers || []);
  const preservedActorsByUserId = cloneJson(stateBundle.meta.actorsByUserId || {});
  const preservedTurnState = cloneJson(ensureTurnState(stateBundle.meta));
  const preservedInvestigators = cloneJson(stateBundle.sessionState.investigators || {});

  const fresh = rebuildConversationSession(event, {
    storageRoot: stateBundle.layout.root,
    scenarioId: selected.startSceneId,
    campaignId: selected.storyPack.campaignId,
    storyPackId: selected.storyPack.id,
    reset: true
  });

  applyPreservedConversationControls(fresh.meta, preservedControls);
  fresh.meta.storyPackId = selected.storyPack.id;
  fresh.meta.knownUsers = preservedKnownUsers;
  fresh.meta.actorsByUserId = preservedActorsByUserId;
  fresh.meta.turnState = preservedTurnState;
  rememberUser(fresh.meta, event);

  fresh.sessionState.investigators = preservedInvestigators;
  saveSessionApi(fresh.sessionState, fresh.layout.sessionFile, { meta: { conversationKey: fresh.layout.conversationKey } });
  saveMeta(fresh.layout, fresh.meta);
  return { stateBundle: fresh, selected };
}

function maybePromptForStoryPackChoice(event, stateBundle) {
  if (getSelectedStoryPackEntry(stateBundle.meta)) return null;
  stateBundle.meta.pendingStoryPackChoice = {
    askedAt: new Date().toISOString()
  };
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatStoryPackChoicePrompt(),
    operationEvents: [buildOperationEvent("storypack.prompt", `${getSenderName(event)} 触发了剧本选择`, {
      userId: event.user_id != null ? String(event.user_id) : null
    })]
  };
}

function handlePendingStoryPackChoice(text, event, stateBundle) {
  const pending = stateBundle.meta.pendingStoryPackChoice;
  if (!pending) return null;

  const selection = resolveStoryPackSelection(text);
  if (!selection || selection.kind === "list") {
    return { reply: formatStoryPackChoicePrompt() };
  }

  const activated = activateStoryPackSelection(event, stateBundle, selection.storyPackId);
  if (!activated) {
    return {
      reply: `我没对上这个剧本。\n${formatStoryPackChoicePrompt()}`
    };
  }

  setSessionMode(activated.stateBundle, "kp");
  activated.stateBundle.meta.pendingStoryPackChoice = null;
  activated.stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(activated.stateBundle.layout, activated.stateBundle.meta);
  const actor = ensureActorForUser(event, activated.stateBundle, { autoCreateInvestigator: false });

  return {
    stateBundle: activated.stateBundle,
    reply: formatStartReply(activated.stateBundle, actor),
    operationEvents: [buildOperationEvent("storypack.select", `${getSenderName(event)} 选择了剧本 ${activated.selected.storyPack.title}`, {
      userId: event.user_id != null ? String(event.user_id) : null,
      storyPackId: activated.selected.storyPack.id,
      campaignId: activated.selected.storyPack.campaignId,
      scenarioId: activated.selected.startSceneId
    })]
  };
}

function detectResumeChoice(text = "") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  if (includesAny(normalized, ["续上", "继续上次", "接着上次", "恢复这个档", "继续这条", "resume"])) {
    return "resume";
  }
  if (includesAny(normalized, ["新开", "开新线", "新开一条", "另开一条", "重开一条", "new"])) {
    return "new";
  }
  if (includesAny(normalized, ["存档列表", "看看存档", "看存档", "列出存档", "存档"])) {
    return "list";
  }
  return null;
}

function maybePromptForExistingSave(event, stateBundle) {
  const candidate = getResumeCandidate(stateBundle);
  if (!candidate) return null;
  stateBundle.meta.pendingResumeChoice = {
    askedAt: new Date().toISOString(),
    source: candidate.source,
    saveId: candidate.record.saveId,
    ownerUserId: event.user_id != null ? String(event.user_id) : null,
    ownerUserName: getSenderName(event)
  };
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatResumeChoicePrompt(candidate),
    operationEvents: [buildOperationEvent("session.resume_prompt", `${getSenderName(event)} 触发了旧档续团确认`, {
      userId: event.user_id != null ? String(event.user_id) : null,
      source: candidate.source,
      saveId: candidate.record.saveId
    })]
  };
}

function handlePendingResumeChoice(text, event, stateBundle) {
  const pending = stateBundle.meta.pendingResumeChoice;
  if (!pending) return null;
  const owner = resolvePendingOwner(stateBundle, pending);
  const currentUserId = event?.user_id != null ? String(event.user_id).trim() : "";
  if (owner.userId && currentUserId && owner.userId !== currentUserId) {
    return {
      reply: `这一步我先等 ${owner.userName || "刚刚那位玩家"} 拍板旧档：续上 / 新开。你如果只是想自己看列表，可以直接发 \`/aikp saves\`。`
    };
  }

  const choice = detectResumeChoice(text);
  if (choice === "list") {
    return { reply: formatSaveListReply(stateBundle) };
  }

  if (choice === "resume") {
    stateBundle.meta.pendingResumeChoice = null;
    saveMeta(stateBundle.layout, stateBundle.meta);
    if (pending.source === "archive" && pending.saveId && pending.saveId !== "current") {
      const restored = restoreArchivedConversation(event, stateBundle, pending.saveId);
      if (!restored.ok) return { reply: restored.reply };
      return {
        reply: `好，我把旧档 ${pending.saveId} 接回来了。\n${formatStartReply(restored.stateBundle, restored.actor)}`,
        stateBundle: restored.stateBundle,
        operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了存档 ${pending.saveId}`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          saveId: pending.saveId
        })]
      };
    }

    setSessionMode(stateBundle, "kp");
    return {
      reply: `好，那我们就沿着这条继续。\n${formatStartReply(stateBundle, ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false }))}`,
      operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 继续了当前存档`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: pending.saveId || "current"
      })]
    };
  }

  if (choice === "new") {
    stateBundle.meta.pendingResumeChoice = null;
    saveMeta(stateBundle.layout, stateBundle.meta);
    const archived = archiveConversationState(stateBundle, "new-line");
    const fresh = startFreshConversationLine(event, stateBundle);
    const archiveLine = archived
      ? `旧档我先收成 ${archived.saveId} 了。`
      : "这边没有需要打包的旧档，我直接给你开了新线。";
    const startReply = buildStartPanelResponse(event, fresh.stateBundle, fresh.actor, [
      buildOperationEvent("session.new", `${getSenderName(event)} 新开了一条跑团线`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        archivedSaveId: archived?.saveId || null
      })
    ]);
    return {
      reply: `${archiveLine}\n${startReply.reply}`,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  return {
    reply: [
      "我这边先等你拍板喔。",
      "群里继续操作时记得带 `@麦麦`。",
      "回复 `续上` 我就接回旧档；回复 `新开` 我就另起一条。",
      "想看历史存档可以发 `/aikp saves`。"
    ].join("\n")
  };
}

function handlePendingDeleteChoice(text, event, stateBundle) {
  const pending = stateBundle.meta.pendingDeleteChoice;
  if (!pending?.saveId) return null;
  const owner = resolvePendingOwner(stateBundle, pending);
  const currentUserId = event?.user_id != null ? String(event.user_id).trim() : "";
  if (owner.userId && currentUserId && owner.userId !== currentUserId) {
    return {
      reply: `这一步我先等 ${owner.userName || "刚刚那位玩家"} 确认删档。你如果要查列表，可以直接发 \`/aikp saves\`。`
    };
  }

  const choice = detectDeleteChoice(text);
  if (choice === "list") {
    return { reply: formatSaveListReply(stateBundle) };
  }

  if (choice === "cancel") {
    stateBundle.meta.pendingDeleteChoice = null;
    stateBundle.meta.updatedAt = new Date().toISOString();
    saveMeta(stateBundle.layout, stateBundle.meta);
    return {
      reply: "好，那这条归档我先不动。"
    };
  }

  if (choice === "confirm") {
    const deleted = deleteArchivedConversation(stateBundle, pending.saveId);
    if (!deleted.ok) return { reply: deleted.reply };
    return {
      reply: `好，这条历史归档 ${deleted.record.saveId} 已经删掉了。`,
      operationEvents: [buildOperationEvent("session.delete", `${getSenderName(event)} 删除了存档 ${deleted.record.saveId}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: deleted.record.saveId
      })]
    };
  }

  return {
    reply: [
      "我这边先等你确认删档。",
      `目标存档：${pending.saveId}`,
      "确认就回“确认删除”或“删掉它”；不删就回“取消”。",
      "想先看列表也可以发 `/aikp saves`。"
    ].join("\n")
  };
}

function flushConversationArtifacts(event, stateBundle, response, options = {}) {
  if (!stateBundle) {
    return {
      ...response,
      sessionState: response.sessionState ?? null,
      contextRef: response.contextRef || null,
      contextPacket: response.contextPacket || null
    };
  }

  if (response.reply) {
    appendChatLog(stateBundle.layout, buildChatLogEntry(event, "outbound", response.reply));
  }

  const operationEvents = Array.isArray(options.operationEvents) ? options.operationEvents : [];
  for (const operationEvent of operationEvents) {
    appendOperationLog(stateBundle.layout, operationEvent);
  }
  appendPlayerOperationLogs(stateBundle.layout, operationEvents);

  let stateSnapshot = buildStateSnapshot(stateBundle, event?.user_id ?? null);
  const summaryChunk = maybeRollupSummaries(stateBundle.layout, stateBundle.meta, stateSnapshot, options.summaryOptions || {});
  if (summaryChunk) {
    const summaryEvent = buildOperationEvent("summary.rollup", `生成摘要块 ${summaryChunk.chunkName}`, {
      chunkName: summaryChunk.chunkName,
      pendingChatCount: summaryChunk.pendingChatCount
    });
    appendOperationLog(stateBundle.layout, summaryEvent);
    stateSnapshot = buildStateSnapshot(stateBundle, event?.user_id ?? null);
  }

  writeStateSnapshot(stateBundle.layout, stateSnapshot);
  const contextPacket = buildContextPacket(stateBundle.layout, stateBundle.meta, stateSnapshot, {
    runtimePrompt: getKpRuntimePrompt(),
    recentChatLimit: options.contextOptions?.recentChatLimit,
    recentOperationLimit: options.contextOptions?.recentOperationLimit,
    summaryChunkLimit: options.contextOptions?.summaryChunkLimit
  });
  writeContextSnapshot(stateBundle.layout, contextPacket);
  saveMeta(stateBundle.layout, stateBundle.meta);

  return {
    ...response,
    sessionState: cloneJson(stateBundle.sessionState),
    contextRef: stateBundle.layout.contextFile,
    contextPacket: options.includeContextPacket ? contextPacket : null
  };
}

function describeOperationOutcome(resultEvent = {}) {
  if (typeof resultEvent?.summary === "string" && resultEvent.summary.trim()) {
    return resultEvent.summary.trim();
  }
  if (typeof resultEvent?.sanLoss === "number" && typeof resultEvent?.sanNow === "number") {
    return `SAN ${resultEvent.sanBefore}→${resultEvent.sanNow}（-${resultEvent.sanLoss}）`;
  }
  if (Array.isArray(resultEvent?.enemies) && typeof resultEvent?.round === "number") {
    return `战斗第 ${resultEvent.round} 轮开始`;
  }
  if (!resultEvent?.result) return null;
  if (resultEvent.mode === "hidden") {
    return `${resultEvent.skillKey}（暗骰 ${resultEvent.result.successLevel}）`;
  }
  return `${resultEvent.skillKey} 投掷 ${resultEvent.roll}/${resultEvent.targetValue}（${resultEvent.result.successLevel}）`;
}

function describeSoftTimeActionLabel(action = {}, resultEvent = null, fallback = null) {
  if (resultEvent?.skillKey) {
    return `${resultEvent.skillKey} 检定`;
  }
  if (action?.skillKey) {
    return `${action.skillKey} 检定`;
  }
  const actionKindMap = {
    explore: "调查",
    talk: "交谈",
    use_item: "使用物品",
    risky_action: "冒险动作",
    steal: "摸东西",
    follow: "跟踪",
    skill_check: "检定",
    san_check: "SAN 检定",
    combat_round: "战斗动作",
    advance_time: "时间推进",
    start_combat: "开战"
  };
  if (action?.kind && actionKindMap[action.kind]) {
    return actionKindMap[action.kind];
  }
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }
  return "那步行动";
}

function buildRollOperationEvents(event, result, partyMode = false) {
  if (partyMode) {
    return (result.bundles || []).map((bundle) => {
      const description = bundle.mode === "quickfire"
        ? `${bundle.investigator.name} 快速车卡完成，职业 ${bundle.investigator.occupation}`
        : `${bundle.investigator.name} 传统车卡完成，职业 ${bundle.investigator.occupation}`;
      return buildOperationEvent("character.created", description, {
        userId: bundle.sourceUserId || null,
        userName: bundle.sourceUserName || null,
        actorId: bundle.investigator.id,
        occupationKey: bundle.occupationKey,
        mode: bundle.mode,
        generation: cloneJson(bundle.generation)
      });
    });
  }

  if (result.draft && !result.bundle) {
    const draft = result.draft;
    const occupationKey = draft.occupationKey || null;
    const occupationName = occupationKey ? getOccupationTemplate(occupationKey).name : null;
    const summary = draft.stage === "occupation"
      ? `${getSenderName(event)} 开始了传统车卡，等待职业选择`
      : `${getSenderName(event)} 进入传统车卡技能分配阶段${occupationName ? `，职业 ${occupationName}` : ""}`;
    return [
      buildOperationEvent("character.draft", summary, {
        userId: event.user_id != null ? String(event.user_id) : null,
        stage: draft.stage,
        occupationKey,
        occupationName,
        breakdown: cloneJson(draft.breakdown || [])
      })
    ];
  }

  if (!result.bundle) return [];
  const description = result.bundle.mode === "quickfire"
    ? `${getSenderName(event)} 快速车卡完成，职业 ${result.bundle.investigator.occupation}`
    : `${getSenderName(event)} 传统车卡完成，职业 ${result.bundle.investigator.occupation}`;
  return [
    buildOperationEvent("character.created", description, {
      userId: event.user_id != null ? String(event.user_id) : null,
      actorId: result.bundle.investigator.id,
      occupationKey: result.bundle.occupationKey,
      mode: result.bundle.mode,
      generation: cloneJson(result.bundle.generation)
    })
  ];
}

function detectNaturalIntent(text, actorResult = {}) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;

  if (includesAny(normalized, ["我先退团", "我先退出队伍", "我先不参加", "我先旁观", "不算我了"])) {
    return { kind: "party_leave" };
  }

  if (includesAny(normalized, ["不跑了", "先不跑了", "结束跑团", "收团", "退出跑团", "先停团"])) {
    return { kind: "exit" };
  }

  if (includesAny(normalized, ["续上", "继续上次", "接着上次", "恢复跑团", "继续这条"])) {
    return { kind: "resume" };
  }

  if (includesAny(normalized, ["开新线", "新开一条", "另开一条", "重开一条", "新开"])) {
    return { kind: "new" };
  }

  if (includesAny(normalized, ["看看状态", "现在什么情况", "当前状态", "场景状态"])) {
    return { kind: "state" };
  }

  if (includesAny(normalized, ["总结一下", "回顾一下", "复盘一下", "recap"])) {
    return { kind: "recap" };
  }

  if (includesAny(normalized, ["看看队伍", "队伍情况", "谁在场", "队伍面板"])) {
    return { kind: "party" };
  }

  if (includesAny(normalized, ["团幸运", "组幸运", "group luck", "groupluck", "全队幸运", "大家过幸运", "拼个幸运"])) {
    return { kind: "group_luck" };
  }

  if (includesAny(normalized, ["开战", "开始战斗", "进入战斗", "先打起来", "直接动手"])) {
    return { kind: "combat_start" };
  }

  const explicitOccupationKey = extractOccupationKeyFromText(text);
  const wantsQuickfire = includesAny(normalized, ["quickfire", "快速车卡", "快速建卡", "快车卡", "快速卡"]);
  const wantsRoll = includesAny(normalized, ["车卡", "建卡", "开卡", "人物卡", "角色卡", "roll卡", "roll"]) || includesAny(normalized, ["角色选", "职业选", "职业是", "职业当", "我选"]);
  const wantsParty = includesAny(normalized, ["全车", "全员", "一起车", "大家都", "批量车卡", "一次全车完卡", "一起开卡"]);
  const wantsPartyJoin = includesAny(normalized, ["算我一个", "我也玩", "我也参加", "我加入", "俺也去", "俺也去一个", "我也来"]);
  const wantsPartyLock = includesAny(normalized, ["就这些人", "就这几个人", "人齐了", "锁队伍", "锁名单", "就我们几个", "就我们这些"]);
  const wantsPartyUnlock = includesAny(normalized, ["解锁队伍", "开放加入", "再加人", "补个人", "让人进来", "名单开放"]);
  const occupationKey = explicitOccupationKey || actorResult.investigator?.occupationKey || null;
  const wantsStart = includesAny(normalized, [
    "想跑团",
    "我要跑团",
    "来跑团",
    "陪我跑团",
    "开始跑团",
    "开始跑个团",
    "开始吧",
    "开团",
    "我要开团",
    "想开团",
    "开局",
    "进游戏",
    "进入游戏",
    "开始跑",
    "想玩coc",
    "我要玩coc",
    "来个coc",
    "开个coc"
  ]);

  if (wantsRoll || (!actorResult.actorId && wantsStart && explicitOccupationKey)) {
    return {
      kind: "roll",
      mode: wantsQuickfire ? "quickfire" : "traditional",
      party: wantsParty,
      occupationKey
    };
  }

  if (wantsPartyJoin) {
    return { kind: "party_join" };
  }

  if (wantsPartyLock) {
    return { kind: "party_lock" };
  }

  if (wantsPartyUnlock) {
    return { kind: "party_unlock" };
  }

  if (wantsStart) {
    return { kind: "start" };
  }

  return null;
}

function shouldHandleOneBotMessage(event, options = {}) {
  const text = getMessageText(event);
  const commandLike = isAiKpCommand(text);
  const isGroupMessage = Boolean(event.group_id);
  const requiresMention = isGroupMessage && options.requireGroupMention !== false;
  const mentionedSelf = event.mentionedSelf !== false;
  const { layout, meta } = readConversationMetaSnapshot(event, options);
  const sessionMode = meta?.sessionMode || "idle";
  const isActive = sessionMode === "kp";
  const allowDirectMessages = options.allowDirectMessages !== false;

  if (!text) {
    return {
      handle: false,
      reason: "empty_message",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (!isConversationWhitelisted(event, options)) {
    return {
      handle: false,
      reason: "group_not_whitelisted",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (requiresMention && !mentionedSelf) {
    return {
      handle: false,
      reason: "not_addressed",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (!isGroupMessage && !allowDirectMessages) {
    return {
      handle: false,
      reason: "direct_message_disabled",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (commandLike) {
    return {
      handle: true,
      reason: "command",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (!isGroupMessage) {
    return {
      handle: true,
      reason: "direct_message",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (meta?.pendingResumeChoice) {
    return {
      handle: true,
      reason: "pending_resume_choice",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (meta?.pendingStoryPackChoice) {
    return {
      handle: true,
      reason: "pending_storypack_choice",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (isActive) {
    return {
      handle: true,
      reason: "active_session",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (options.allowNaturalActivation === false) {
    return {
      handle: false,
      reason: "inactive_group_session",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  const naturalIntent = detectNaturalIntent(text, {});
  if (naturalIntent && ["start", "roll", "exit", "resume", "new"].includes(naturalIntent.kind)) {
    return {
      handle: true,
      reason: "activation_intent",
      trigger: naturalIntent.kind,
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  return {
    handle: false,
    reason: "inactive_group_session",
    conversationKey: layout.conversationKey,
    sessionMode
  };
}

function loadConversationContext(conversationKey, options = {}) {
  const layout = buildStorageLayoutFromConversationKey(options.storageRoot, conversationKey);
  if (!existsSync(layout.contextFile)) return null;
  return JSON.parse(readFileSync(layout.contextFile, "utf8"));
}

function handleNaturalIntent(text, event, stateBundle, actorResult, options = {}) {
  const naturalIntent = detectNaturalIntent(text, actorResult);
  if (!naturalIntent) return null;
  const randomInt = options.randomInt || defaultRandomInt;
  const hasSelectedStoryPack = Boolean(getSelectedStoryPackEntry(stateBundle.meta));

  if (naturalIntent.kind === "exit") {
    setSessionMode(stateBundle, "idle");
    return {
      reply: "好，这局我先帮你收住啦。之后想继续的话，群里记得带 `@麦麦` 再说“开始跑团”或者“我想车卡”，我就能接上。",
      operationEvents: [buildOperationEvent("session.exit", `${getSenderName(event)} 结束了本群 AI-KP 状态`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    };
  }

  if (naturalIntent.kind === "state") {
    if (!hasSelectedStoryPack) return { reply: formatStoryPackChoicePrompt() };
    return { reply: formatStateSummary(stateBundle.sessionState, stateBundle.meta) };
  }

  if (naturalIntent.kind === "recap") {
    if (!hasSelectedStoryPack) return { reply: formatStoryPackChoicePrompt() };
    return { reply: formatRecapReply(stateBundle.sessionState) };
  }

  if (naturalIntent.kind === "party") {
    return { reply: formatPartySummary(stateBundle) };
  }

  if (naturalIntent.kind === "group_luck") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "发起全队幸运检定" });
    if (controlGuard) return controlGuard;
    const result = runGroupLuckRollCommand(stateBundle, randomInt);
    return result.ok
      ? {
        reply: result.reply,
        operationEvents: [buildOperationEvent("roll.group_luck", `${getSenderName(event)} 发起了全队幸运检定`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          actorId: result.chosenEntry?.actorId || null,
          memberCount: result.memberCount,
          lowestLuck: result.lowestLuck,
          lowestNames: result.lowestNames,
          roll: result.roll,
          targetValue: result.targetValue,
          successLevel: result.successLevel,
          success: result.success
        })]
      }
      : { reply: result.reply };
  }

  if (naturalIntent.kind === "combat_start") {
    return handleCombatCommand(event, stateBundle, actorResult, ["start"], options);
  }

  if (naturalIntent.kind === "party_join") {
    const joinResult = upsertPartyMember(stateBundle, event, {
      investigatorId: actorResult.investigator?.id || null,
      save: false
    });
    if (!joinResult.ok) {
      return { reply: joinResult.reply };
    }
    pruneTurnStateToParty(stateBundle, { save: false });
    return {
      reply: actorResult.investigator
        ? (joinResult.restoredExistingActor
          ? `好，你原来的卡还在，我把你重新记回这轮名单了。当前还是 ${actorResult.investigator.name}，直接继续行动就行。`
          : `好，我把你记进这轮名单了。你当前绑定的是 ${actorResult.investigator.name}，直接继续行动就行。`)
        : "好，我把你记进这轮名单了。接着直接开始建卡、报职业，或走 quickfire 就行。",
      operationEvents: [buildOperationEvent("party.join", `${getSenderName(event)} 加入了本轮名单`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        actorId: actorResult.actorId || null
      })]
    };
  }

  if (naturalIntent.kind === "party_leave") {
    const removed = removePartyMember(stateBundle, event?.user_id, { save: false });
    if (!removed.removed) {
      return { reply: "你现在本来就不在这轮名单里。想旁观的话直接看着就行。" };
    }
    const turnState = pruneTurnStateToParty(stateBundle, { save: false });
    const nextActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    return {
      reply: nextActor
        ? `好，我先把你从这轮名单里移出来。当前 spotlight 落在 ${nextActor.name}。`
        : "好，我先把你从这轮名单里移出来。",
      operationEvents: [buildOperationEvent("party.leave", `${getSenderName(event)} 暂时离开了本轮名单`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        actorId: removed.removed.investigatorId || null
      })]
    };
  }

  if (naturalIntent.kind === "party_lock") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "锁名单" });
    if (controlGuard) return controlGuard;
    if (!stateBundle.layout?.conversationKey?.startsWith("onebot-group-")) {
      return { reply: "私聊默认就按单人跑，不用额外锁名单。" };
    }
    const members = listPartyMembers(stateBundle.meta);
    if (!members.length) {
      return { reply: "现在名单还是空的。先让要参团的人开始建卡，或说一句“算我一个”。" };
    }
    setPartyLocked(stateBundle, true);
    return {
      reply: `好，这轮名单我先锁成：${members.map((member) => member.userName).join("、")}。后面要补人再解锁就行。`,
      operationEvents: [buildOperationEvent("party.lock", `${getSenderName(event)} 锁定了本轮名单`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        memberCount: members.length
      })]
    };
  }

  if (naturalIntent.kind === "party_unlock") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "解锁名单" });
    if (controlGuard) return controlGuard;
    if (!isPartyLocked(stateBundle.meta)) {
      return { reply: "这轮名单本来就是开放的，可以直接继续加人。" };
    }
    setPartyLocked(stateBundle, false);
    return {
      reply: "好，名单我重新打开了。新玩家现在可以继续入团和建卡。",
      operationEvents: [buildOperationEvent("party.unlock", `${getSenderName(event)} 解锁了本轮名单`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    };
  }

  if (naturalIntent.kind === "resume") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "接旧档" });
    if (controlGuard) return controlGuard;
    const resumeCandidate = getResumeCandidate(stateBundle);
    if (!resumeCandidate) {
      setSessionMode(stateBundle, "kp");
      return buildStartPanelResponse(event, stateBundle, actorResult, [
        buildSessionEnterOperationEvent(event)
      ]);
    }

    if (resumeCandidate.source === "archive") {
      const restored = restoreArchivedConversation(event, stateBundle, resumeCandidate.record.saveId);
      if (!restored.ok) {
        return { reply: restored.reply };
      }
      return {
        reply: `好，我把旧档 ${resumeCandidate.record.saveId} 接回来了。\n${formatStartReply(restored.stateBundle, restored.actor)}`,
        stateBundle: restored.stateBundle,
        operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了存档 ${resumeCandidate.record.saveId}`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          saveId: resumeCandidate.record.saveId
        })]
      };
    }

    setSessionMode(stateBundle, "kp");
    return {
      reply: `好，那我们就沿着这条继续。\n${formatStartReply(stateBundle, actorResult)}`,
      operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 继续了当前存档`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: resumeCandidate.record.saveId
      })]
    };
  }

  if (naturalIntent.kind === "new") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "新开跑团线" });
    if (controlGuard) return controlGuard;
    const archived = archiveConversationState(stateBundle, "natural-new-line");
    const fresh = startFreshConversationLine(event, stateBundle);
    const startReply = buildStartPanelResponse(event, fresh.stateBundle, fresh.actor, [
      buildOperationEvent("session.new", `${getSenderName(event)} 自然语言新开了一条跑团线`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        archivedSaveId: archived?.saveId || null
      })
    ]);
    return {
      reply: `${archived ? `旧档我先收成 ${archived.saveId} 了。` : "这边没有旧档要打包，我直接给你起新线。"}\n${startReply.reply}`,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  if (naturalIntent.kind === "start") {
    const resumeCandidate = getResumeCandidate(stateBundle);
    if (resumeCandidate) {
      const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "改旧档状态" });
      if (controlGuard) return controlGuard;
    }
    const prompt = maybePromptForExistingSave(event, stateBundle);
    if (prompt) return prompt;
    setSessionMode(stateBundle, "kp");
    return buildStartPanelResponse(event, stateBundle, actorResult, [
      buildSessionEnterOperationEvent(event, "激活了本群 AI-KP")
    ]);
  }

  if (naturalIntent.kind === "roll") {
    setSessionMode(stateBundle, "kp");
    if (hasSelectedStoryPack && !stateBundle.meta.briefingConfirmedAt) {
      confirmSessionBriefing(stateBundle);
    }
    if (naturalIntent.party && event?.group_id && !getPartyMember(stateBundle.meta, event?.user_id)) {
      const joinResult = upsertPartyMember(stateBundle, event, { save: false });
      if (!joinResult.ok) {
        return { reply: joinResult.reply };
      }
    }
    const partyMemberCount = listPartyMembers(stateBundle.meta).length;
    const degradePartyRollToSingle =
      naturalIntent.party
      && partyMemberCount < 2
      && includesAny(normalizeIntentText(text), ["我", "给我", "角色选", "职业选", "我想"]);
    if (naturalIntent.party && !degradePartyRollToSingle) {
      const rollResult = runPartyRollCommand(event, stateBundle, naturalIntent.mode, naturalIntent.occupationKey, randomInt);
      const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
      return {
        reply: rollResult.suppressSceneStart ? rollResult.reply : appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
        operationEvents: buildRollOperationEvents(event, rollResult, true)
      };
    }

    const rollResult = runSingleRollCommand(event, stateBundle, naturalIntent.mode, naturalIntent.occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: rollResult.suppressSceneStart ? rollResult.reply : appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, false)
    };
  }

  return null;
}

function handleCommand(text, event, stateBundle, actorResult, options = {}) {
  const { command, args } = parseCommand(text);
  const randomInt = options.randomInt || defaultRandomInt;
  const subcommand = args[0] || "";

  if (command === "/aikp" && !args.length) {
    return { reply: formatHelpReply() };
  }

  if (command === "/aikp" && subcommand === "help") {
    return { reply: formatHelpReply() };
  }

  if (text.trim() === "/aikp help") {
    return { reply: formatHelpReply() };
  }

  if (text.trim() === "/aikp start") {
    const resumeCandidate = getResumeCandidate(stateBundle);
    if (resumeCandidate) {
      const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "改旧档状态" });
      if (controlGuard) return controlGuard;
    }
    const prompt = maybePromptForExistingSave(event, stateBundle);
    if (prompt) return prompt;
    setSessionMode(stateBundle, "kp");
    return buildStartPanelResponse(event, stateBundle, actorResult, [
      buildSessionEnterOperationEvent(event, "查看了开场面板")
    ]);
  }

  if (text.trim() === "/aikp saves") {
    return { reply: formatSaveListReply(stateBundle) };
  }

  if (text.trim() === "/aikp packs") {
    return { reply: formatStoryPackChoicePrompt() };
  }

  if (command === "/aikp" && subcommand === "pack") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "切剧本" });
    if (controlGuard) return controlGuard;
    const selection = resolveStoryPackSelection(args.slice(1).join(" "));
    if (!selection || selection.kind === "list") {
      return { reply: formatStoryPackChoicePrompt() };
    }
    const activated = activateStoryPackSelection(event, stateBundle, selection.storyPackId);
    if (!activated) {
      return { reply: `我没对上这个剧本。\n${formatStoryPackChoicePrompt()}` };
    }
    setSessionMode(activated.stateBundle, "kp");
    const nextActor = ensureActorForUser(event, activated.stateBundle, { autoCreateInvestigator: false });
    return {
      reply: formatStartReply(activated.stateBundle, nextActor),
      stateBundle: activated.stateBundle,
      operationEvents: [buildOperationEvent("storypack.select", `${getSenderName(event)} 手动选择了剧本 ${activated.selected.storyPack.title}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        storyPackId: activated.selected.storyPack.id,
        campaignId: activated.selected.storyPack.campaignId,
        scenarioId: activated.selected.startSceneId
      })]
    };
  }

  if (text.trim() === "/aikp new") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "新开跑团线" });
    if (controlGuard) return controlGuard;
    const archived = archiveConversationState(stateBundle, "command-new-line");
    const fresh = startFreshConversationLine(event, stateBundle);
    const startReply = buildStartPanelResponse(event, fresh.stateBundle, fresh.actor, [
      buildOperationEvent("session.new", `${getSenderName(event)} 手动新开了一条跑团线`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        archivedSaveId: archived?.saveId || null
      })
    ]);
    return {
      reply: `${archived ? `旧档我先收成 ${archived.saveId} 了。` : "这边没有旧档要打包，我直接给你起新线。"}\n${startReply.reply}`,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  if (command === "/aikp" && subcommand === "resume") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "接旧档" });
    if (controlGuard) return controlGuard;
    const selector = args[1] || "";
    if (!selector && hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
      setSessionMode(stateBundle, "kp");
      return {
        reply: `好，这条我给你接上。\n${formatStartReply(stateBundle, actorResult)}`,
        operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了当前存档`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          saveId: "current"
        })]
      };
    }

    const restored = restoreArchivedConversation(event, stateBundle, selector);
    if (!restored.ok) {
      return { reply: restored.reply };
    }
    return {
      reply: `好，我把旧档 ${restored.record.saveId} 接回来了。\n${formatStartReply(restored.stateBundle, restored.actor)}`,
      stateBundle: restored.stateBundle,
      operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了存档 ${restored.record.saveId}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: restored.record.saveId
      })]
    };
  }

  if (command === "/aikp" && ["delete", "del", "rm"].includes(subcommand)) {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "删档" });
    if (controlGuard) return controlGuard;
    const selector = args.slice(1).join(" ").trim();
    return promptDeleteArchive(event, stateBundle, selector);
  }

  if (!getSelectedStoryPackEntry(stateBundle.meta) && STORY_PACK_REQUIRED_COMMANDS.has(subcommand)) {
    return { reply: formatStoryPackChoicePrompt() };
  }

  if (text.trim() === "/aikp state") {
    return { reply: formatStateSummary(stateBundle.sessionState, stateBundle.meta) };
  }
  if (text.trim() === "/aikp campaign") {
    return { reply: formatCampaignSummary(getCurrentCampaign(stateBundle.sessionState)) };
  }
  if (text.trim() === "/aikp hooks") {
    const campaignId = stateBundle.meta.campaignId || "old-church-arc";
    const campaign = loadCampaignTemplate(campaignId);
    const sceneId = getCurrentCampaign(stateBundle.sessionState)?.currentSceneId || stateBundle.sessionState.scene?.meta?.scenarioId;
    const hooks = listEligibleHooks(stateBundle.sessionState, campaign, sceneId);
    const lines = ["当前钩子："];
    for (const hook of hooks) {
      lines.push(`- ${hook.id}｜${hook.label}｜${hook.eligible ? "eligible" : "locked"}`);
    }
    return { reply: lines.join("\n") };
  }
  if (text.trim() === "/aikp storypack") {
    const selected = getSelectedStoryPackEntry(stateBundle.meta);
    return { reply: selected ? formatStoryPackSummary(selected.storyPack) : formatStoryPackChoicePrompt() };
  }
  if (text.trim() === "/aikp scene") {
    return { reply: formatScenePanel(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp recap") {
    return { reply: formatRecapReply(stateBundle.sessionState) };
  }
  if (["/aikp party", "/aikp members", "/aikp lobby"].includes(text.trim())) {
    return { reply: formatPartySummary(stateBundle) };
  }
  if (text.trim() === "/aikp clues") {
    return { reply: formatCluePanel(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp npcs") {
    return { reply: formatNpcPanel(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp who") {
    const turnState = ensureTurnState(stateBundle.meta);
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    const softTimeCue = currentActor ? formatActorSoftTimeCue(stateBundle, currentActor.id) : null;
    return {
      reply: currentActor
        ? [`现在轮到 ${currentActor.name}（第 ${turnState.round} 轮）。`, softTimeCue].filter(Boolean).join("\n")
        : "现在还没指定当前行动者。"
    };
  }

  if (command === "/aikp" && subcommand === "combat") {
    return handleCombatCommand(event, stateBundle, actorResult, args.slice(1), {
      ...options,
      originalText: text
    });
  }

  if (command === "/aikp" && subcommand === "san") {
    return handleSanCommand(event, stateBundle, actorResult, args.slice(1), {
      ...options,
      originalText: text
    });
  }

  if (["/aikp group-luck", "/aikp groupluck", "/aikp party-luck"].includes(text.trim())) {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "发起全队幸运检定" });
    if (controlGuard) return controlGuard;
    const result = runGroupLuckRollCommand(stateBundle, randomInt);
    return result.ok
      ? {
        reply: result.reply,
        operationEvents: [buildOperationEvent("roll.group_luck", `${getSenderName(event)} 发起了全队幸运检定`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          actorId: result.chosenEntry?.actorId || null,
          memberCount: result.memberCount,
          lowestLuck: result.lowestLuck,
          lowestNames: result.lowestNames,
          roll: result.roll,
          targetValue: result.targetValue,
          successLevel: result.successLevel,
          success: result.success
        })]
      }
      : { reply: result.reply };
  }

  if (text.trim() === "/aikp reset") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "重置当前跑团线" });
    if (controlGuard) return controlGuard;
    const fresh = rebuildConversationSession(event, {
      storageRoot: stateBundle.layout.root,
      scenarioId: stateBundle.meta.scenarioId,
      campaignId: stateBundle.meta.campaignId,
      storyPackId: stateBundle.meta.storyPackId,
      reset: true
    });
    setSessionMode(fresh, "kp");
    const actor = ensureActorForUser(event, fresh, { autoCreateInvestigator: false });
    const startReply = buildStartPanelResponse(event, fresh, actor, [
      buildOperationEvent("session.reset", `${getSenderName(event)} 重置了当前会话`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })
    ]);
    return {
      reply: startReply.reply,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  if (text.trim() === "/aikp join") {
    const joinResult = upsertPartyMember(stateBundle, event, {
      investigatorId: actorResult.investigator?.id || null,
      save: false
    });
    if (!joinResult.ok) {
      return { reply: joinResult.reply };
    }
    pruneTurnStateToParty(stateBundle, { save: false });
    if (!actorResult.investigator) {
      return { reply: "好，我把你记进这轮名单了。你现在还没绑定调查员，接着直接 `/aikp roll journalist`、`/aikp quickfire artist`，或者自然说“记者吧”“给我快速医生卡”都行。" };
    }
    return {
      reply: joinResult.restoredExistingActor
        ? `好，你原来的卡还在，我把你重新记回这轮名单了。当前调查员还是 ${actorResult.investigator.name}。`
        : `好，我把你记进这轮名单了。当前调查员是 ${actorResult.investigator.name}。`
    };
  }

  if (text.trim() === "/aikp leave") {
    const removed = removePartyMember(stateBundle, event?.user_id, { save: false });
    if (!removed.removed) {
      return { reply: "你现在不在这轮名单里。" };
    }
    const turnState = pruneTurnStateToParty(stateBundle, { save: false });
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    return {
      reply: currentActor
        ? `好，我先把你从名单里移出来。现在 spotlight 在 ${currentActor.name}。`
        : "好，我先把你从名单里移出来。"
    };
  }

  if (text.trim() === "/aikp lock-party") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "锁名单" });
    if (controlGuard) return controlGuard;
    const members = listPartyMembers(stateBundle.meta);
    if (!stateBundle.layout?.conversationKey?.startsWith("onebot-group-")) {
      return { reply: "私聊默认就按单人跑，不用锁名单。" };
    }
    if (!members.length) {
      return { reply: "现在名单还是空的。先让要参团的人开始建卡，或说一句“算我一个”。" };
    }
    setPartyLocked(stateBundle, true);
    return { reply: `好，这轮名单锁成：${members.map((member) => member.userName).join("、")}。` };
  }

  if (text.trim() === "/aikp unlock-party") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "解锁名单" });
    if (controlGuard) return controlGuard;
    if (!isPartyLocked(stateBundle.meta)) {
      return { reply: "这轮名单本来就是开放的。" };
    }
    setPartyLocked(stateBundle, false);
    return { reply: "好，名单重新打开了。现在还能继续补人。" };
  }

  if (text.trim() === "/aikp sheet") {
    return { reply: formatInvestigatorSummary(actorResult.investigator) };
  }

  if (text.trim() === "/aikp settle") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "结团结算" });
    if (controlGuard) return controlGuard;
    const settlement = settleSessionApi(stateBundle.sessionState);
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return {
      reply: formatSettlementReply(settlement, stateBundle),
      operationEvents: [buildOperationEvent("session.settle", `${getSenderName(event)} 生成了结团摘要`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        settlement: cloneJson(settlement)
      })]
    };
  }

  if (command === "/aikp" && args[0] === "roll") {
    if (getSelectedStoryPackEntry(stateBundle.meta) && !stateBundle.meta.briefingConfirmedAt) {
      confirmSessionBriefing(stateBundle);
    }
    const occupationKey = args[1] ? resolveOccupationKey(args[1], actorResult.investigator?.occupationKey || "journalist") : null;
    setSessionMode(stateBundle, "kp");
    const rollResult = runSingleRollCommand(event, stateBundle, "traditional", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: rollResult.suppressSceneStart ? rollResult.reply : appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, false)
    };
  }

  if (command === "/aikp" && args[0] === "quickfire") {
    if (getSelectedStoryPackEntry(stateBundle.meta) && !stateBundle.meta.briefingConfirmedAt) {
      confirmSessionBriefing(stateBundle);
    }
    const occupationKey = resolveOccupationKey(args[1], actorResult.investigator?.occupationKey || "journalist");
    setSessionMode(stateBundle, "kp");
    const rollResult = runSingleRollCommand(event, stateBundle, "quickfire", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: rollResult.suppressSceneStart ? rollResult.reply : appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, false)
    };
  }

  if (command === "/aikp" && args[0] === "party-roll") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "批量车卡" });
    if (controlGuard) return controlGuard;
    if (getSelectedStoryPackEntry(stateBundle.meta) && !stateBundle.meta.briefingConfirmedAt) {
      confirmSessionBriefing(stateBundle);
    }
    const occupationKey = args[1] ? resolveOccupationKey(args[1], "journalist") : null;
    setSessionMode(stateBundle, "kp");
    const rollResult = runPartyRollCommand(event, stateBundle, "traditional", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, true)
    };
  }

  if (command === "/aikp" && args[0] === "party-quickfire") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "批量车卡" });
    if (controlGuard) return controlGuard;
    if (getSelectedStoryPackEntry(stateBundle.meta) && !stateBundle.meta.briefingConfirmedAt) {
      confirmSessionBriefing(stateBundle);
    }
    const occupationKey = args[1] ? resolveOccupationKey(args[1], "journalist") : null;
    setSessionMode(stateBundle, "kp");
    const rollResult = runPartyRollCommand(event, stateBundle, "quickfire", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, true)
    };
  }

  if (command === "/aikp" && subcommand === "focus") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "切 spotlight" });
    if (controlGuard) return controlGuard;
    const entry = resolveActorSelection(stateBundle, args.slice(1).join(" "));
    if (!entry?.actorId || !entry.investigator) {
      return { reply: "我没找到你要切到的那位。可以用玩家名、调查员名、userId 来指。" };
    }
    const turnState = setCurrentActor(stateBundle, entry.actorId);
    const softTimeCue = formatActorSoftTimeCue(stateBundle, entry.actorId);
    return {
      reply: [`好，现在 spotlight 切到 ${entry.investigator.name} 了（第 ${turnState.round} 轮）。`, softTimeCue].filter(Boolean).join("\n"),
      operationEvents: [buildOperationEvent("turn.focus", `${getSenderName(event)} 把 spotlight 切到了 ${entry.investigator.name}`, {
        actorId: entry.actorId,
        round: turnState.round
      })]
    };
  }

  if (command === "/aikp" && subcommand === "goto") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "切场景" });
    if (controlGuard) return controlGuard;
    const targetSceneId = args[1];
    if (!targetSceneId) {
      return { reply: "你得给我一个 sceneId，比如 `/aikp goto bell-tower-followup`。" };
    }
    const campaignId = stateBundle.meta.campaignId || "old-church-arc";
    const campaign = loadCampaignTemplate(campaignId);
    transitionCampaignScene(stateBundle.sessionState, campaign, targetSceneId);
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return {
      reply: `好，这幕我先切到 ${targetSceneId} 了。\n${formatCampaignSummary(getCurrentCampaign(stateBundle.sessionState))}`,
      operationEvents: [buildOperationEvent("campaign.goto", `${getSenderName(event)} 切换到了场景 ${targetSceneId}`, {
        targetSceneId
      })]
    };
  }

  if (command === "/aikp" && subcommand === "advance") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "推进剧情" });
    if (controlGuard) return controlGuard;
    const preferredHookId = args[1] || null;
    const campaignId = stateBundle.meta.campaignId || "old-church-arc";
    const campaign = loadCampaignTemplate(campaignId);
    const chosen = autoAdvanceCampaign(stateBundle.sessionState, campaign, preferredHookId);
    if (!chosen) {
      return { reply: "这会儿还没有满足条件的下一幕钩子。先继续推进，或者用 `/aikp hooks` 看当前哪些是锁着的。" };
    }
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return {
      reply: `好，我按钩子 ${chosen.id} 把这幕往后推进了。\n${formatCampaignSummary(getCurrentCampaign(stateBundle.sessionState))}`,
      operationEvents: [buildOperationEvent("campaign.advance", `${getSenderName(event)} 按钩子 ${chosen.id} 推进了剧情`, {
        hookId: chosen.id
      })]
    };
  }

  if (command === "/aikp" && subcommand === "next") {
    const controlGuard = requireGroupControlPrivilege(stateBundle, event, { actionLabel: "切 spotlight" });
    if (controlGuard) return controlGuard;
    const turnState = advanceCurrentActor(stateBundle);
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    const softTimeCue = currentActor ? formatActorSoftTimeCue(stateBundle, currentActor.id) : null;
    return {
      reply: currentActor
        ? [`下一位是 ${currentActor.name}（第 ${turnState.round} 轮）。`, softTimeCue].filter(Boolean).join("\n")
        : "现在还没有可轮转的调查员。",
      operationEvents: currentActor
        ? [buildOperationEvent("turn.advance", `${getSenderName(event)} 把当前聚焦推进到 ${currentActor.name}`, {
          actorId: currentActor.id,
          round: turnState.round
        })]
        : []
    };
  }

  return null;
}

function handleOneBotMessage(event, options = {}) {
  const text = getMessageText(event);
  const summaryOptions = {
    summaryEventThreshold: options.summaryEventThreshold,
    summaryCharThreshold: options.summaryCharThreshold
  };
  const contextOptions = {
    recentChatLimit: options.contextRecentChatLimit,
    recentOperationLimit: options.contextRecentOperationLimit,
    summaryChunkLimit: options.contextSummaryChunkLimit
  };
  const stateBundle = maybeResetSession(event, options);
  rememberUser(stateBundle.meta, event);
  syncPendingInvestigatorDraftForUser(stateBundle.meta, event?.user_id);
  stateBundle.meta.messageCount += text ? 1 : 0;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  if (text) {
    appendChatLog(stateBundle.layout, buildChatLogEntry(event, "inbound", text));
  }
  const actorResult = ensureActorForUser(event, stateBundle, { ...options, autoCreateInvestigator: false });

  if (stateBundle.meta.pendingResumeChoice && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingResumeChoice(text, event, stateBundle);
    if (pendingResult) {
      const currentBundle = pendingResult.stateBundle || stateBundle;
      return flushConversationArtifacts(event, currentBundle, {
        ok: true,
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: pendingResult.operationEvents || []
      });
    }
  }

  if (stateBundle.meta.pendingSessionBriefing && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingSessionBriefing(text, stateBundle);
    if (pendingResult?.reply) {
      return flushConversationArtifacts(event, stateBundle, {
        ok: pendingResult.blocked !== true,
        reason: pendingResult.blocked ? "pending_session_briefing" : undefined,
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: []
      });
    }
  }

  if (stateBundle.meta.pendingStoryPackChoice && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingStoryPackChoice(text, event, stateBundle);
    if (pendingResult) {
      const currentBundle = pendingResult.stateBundle || stateBundle;
      return flushConversationArtifacts(event, currentBundle, {
        ok: true,
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: pendingResult.operationEvents || []
      });
    }
  }

  if (stateBundle.meta.pendingDeleteChoice && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingDeleteChoice(text, event, stateBundle);
    if (pendingResult) {
      return flushConversationArtifacts(event, stateBundle, {
        ok: true,
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: pendingResult.operationEvents || []
      });
    }
  }

  if (stateBundle.meta.pendingInvestigatorDraft && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingInvestigatorDraft(text, event, stateBundle, options);
    if (pendingResult?.passThrough) {
      // fall through to normal session / natural intent handling below
    } else if (pendingResult) {
      const currentBundle = pendingResult.stateBundle || stateBundle;
      const currentActor = pendingResult.bundle
        ? ensureActorForUser(event, currentBundle, { autoCreateInvestigator: false })
        : actorResult;
      return flushConversationArtifacts(event, currentBundle, {
        ok: true,
        reply: pendingResult.bundle
          ? (pendingResult.suppressSceneStart
            ? pendingResult.reply
            : appendSceneStartReplyIfNeeded(currentBundle, currentActor, pendingResult.reply))
          : (pendingResult.deliverStartReply
            ? appendSceneStartReplyIfNeeded(
              currentBundle,
              ensureActorForUser(event, currentBundle, { autoCreateInvestigator: false }),
              pendingResult.reply
            )
            : pendingResult.reply)
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: [
          ...(Array.isArray(pendingResult.operationEvents) ? pendingResult.operationEvents : []),
          ...(pendingResult.bundle ? buildRollOperationEvents(event, pendingResult, false) : [])
        ]
      });
    }
  }

  if (stateBundle.meta.pendingSceneActionChoice && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingSceneActionChoiceWithOptions(text, stateBundle, {
      event,
      submitAction: options.submitAction || require("../../core/src/api").submitAction,
      randomInt: options.randomInt || defaultRandomInt
    });
    if (pendingResult?.reply) {
      return flushConversationArtifacts(event, stateBundle, {
        ok: false,
        reason: "pending_scene_action_choice",
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: []
      });
    }
    if (pendingResult?.action && actorResult.actorId) {
      const investigator = stateBundle.sessionState.investigators?.[actorResult.actorId];
      const requiredSkill = findInvestigatorSkillEntry(investigator, pendingResult.action.skillKey);
      if (!requiredSkill) {
        return flushConversationArtifacts(event, stateBundle, {
          ok: false,
          reason: "missing_skill",
          reply: `我听懂你想走 ${pendingResult.selectedOption?.displayLabel || pendingResult.action.skillKey}，但这张卡现在没有 ${pendingResult.action.skillKey}。你可以换个走法，我再接。`
        }, {
          includeContextPacket: options.includeContextPacket === true,
          contextOptions,
          summaryOptions,
          operationEvents: []
        });
      }

      const beforeSessionState = pendingResult.beforeSessionState
        ? cloneJson(pendingResult.beforeSessionState)
        : cloneJson(stateBundle.sessionState);
      setSessionMode(stateBundle, "kp");
      const autoLockedParty = maybeAutoLockPartyForScene(stateBundle);
      const turn = {
        ok: true,
        action: pendingResult.action,
        result: pendingResult.result || (options.submitAction || require("../../core/src/api").submitAction)(
          stateBundle.sessionState,
          pendingResult.action,
          options.randomInt || defaultRandomInt
        )
      };

      // “接受当前结果” 只是承接这次失败，不该把同一组选项再弹一遍。
      const pendingPostCheckChoice = pendingResult.skipPostCheckChoice
        ? null
        : buildPostCheckChoice(
          stateBundle,
          turn.action,
          turn.result,
          beforeSessionState,
          stateBundle.sessionState.investigators?.[actorResult.actorId]
        );
      if (pendingPostCheckChoice) {
        stateBundle.meta.updatedAt = new Date().toISOString();
        saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
        saveMeta(stateBundle.layout, stateBundle.meta);
        return flushConversationArtifacts(event, stateBundle, {
          ok: false,
          reason: "pending_scene_action_choice",
          reply: formatSceneActionChoiceReply(pendingPostCheckChoice),
          action: turn.action
        }, {
          includeContextPacket: options.includeContextPacket === true,
          contextOptions,
          summaryOptions,
          operationEvents: []
        });
      }

      stateBundle.meta.updatedAt = new Date().toISOString();
      saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
      saveMeta(stateBundle.layout, stateBundle.meta);

      const actionSummary = describeSoftTimeActionLabel(
        turn.action,
        turn.result?.event,
        pendingResult.selectedOption?.displayLabel || turn.action?.kind || "行动已处理"
      );
      recordResolvedTurnSoftTime(stateBundle, actorResult.actorId, {
        beforeSessionState,
        actionSummary
      });
      const autoAdvancedSpotlight = maybeAdvanceSpotlightAfterResolvedTurn(stateBundle, actorResult.actorId);
      const deltaSummary = formatStateDelta(beforeSessionState, stateBundle.sessionState);
      const sceneBeat = formatSceneBeat(stateBundle.sessionState);
      const optionCue = formatOptionCue(stateBundle.sessionState);
      const softTimeCue = autoAdvancedSpotlight?.currentActor ? consumeActorSoftTimeCue(stateBundle, autoAdvancedSpotlight.currentActor.id) : null;
      const spotlightCue = [formatSpotlightCue(stateBundle), softTimeCue].filter(Boolean).join("\n") || null;
      const currentInvestigator = stateBundle.sessionState.investigators[actorResult.actorId];
      const operationSummary = describeOperationOutcome(turn.result?.event) || turn.action?.kind || "行动已处理";

      return flushConversationArtifacts(event, stateBundle, {
        ok: true,
        reply: formatTurnReply(turn.result, {
          deltaSummary,
          sceneBeat,
          optionCue,
          spotlightCue
        }),
        action: turn.action
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: [
          ...(autoAdvancedSpotlight?.operationEvent ? [autoAdvancedSpotlight.operationEvent] : []),
          ...(autoLockedParty ? [buildOperationEvent("party.lock", "多人正式进场，系统自动锁定了当前名单", {
            memberCount: listPartyMembers(stateBundle.meta).length
          })] : []),
          buildOperationEvent("scene.action", `${currentInvestigator?.name || getSenderName(event)} 选择了 ${pendingResult.selectedOption?.displayLabel || pendingResult.action?.kind || "行动"}：${operationSummary}`, {
            userId: event.user_id != null ? String(event.user_id) : null,
            actorId: actorResult.actorId,
            action: cloneJson(turn.action),
            result: cloneJson(turn.result?.event || null),
            deltaSummary
          })
        ]
      });
    }
  }

  if (!text) {
    const startReply = buildStartPanelResponse(event, stateBundle, actorResult);
    return flushConversationArtifacts(event, startReply.stateBundle || stateBundle, {
      ok: true,
      reply: startReply.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: startReply.operationEvents || []
    });
  }

  const commandResult = handleCommand(text, event, stateBundle, actorResult, options);
  if (commandResult) {
    const currentBundle = commandResult.stateBundle || stateBundle;
    return flushConversationArtifacts(event, currentBundle, {
      ok: true,
      reply: commandResult.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: commandResult.operationEvents || []
    });
  }

  const naturalIntentResult = handleNaturalIntent(text, event, stateBundle, actorResult, options);
  if (naturalIntentResult) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: true,
      reply: naturalIntentResult.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: naturalIntentResult.operationEvents || []
    });
  }

  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "missing_storypack",
      reply: formatStoryPackChoicePrompt()
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: [buildOperationEvent("turn.blocked", `${getSenderName(event)} 想继续，但当前还没选剧本`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    });
  }

  if (!actorResult.actorId) {
    const currentPartyMember = getPartyMember(stateBundle.meta, event?.user_id);
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "missing_investigator",
      reply: !currentPartyMember && event?.group_id && isPartyLocked(stateBundle.meta)
        ? "这轮名单已经锁了，你现在不在这轮里。我先不把你直接塞进场中；要补人就让场内玩家先说“解锁队伍”或用 `/aikp unlock-party`。"
        : "你还没车卡喔。传统建卡可以直接说“先roll属性”或“记者吧，信用20，侦查图书馆心理学说服”；想省事就说“给我快速车卡，职业医生”。要继续用指令也行：`/aikp roll`、`/aikp roll journalist`、`/aikp quickfire doctor`。"
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: [buildOperationEvent("turn.blocked", `${getSenderName(event)} 想行动，但还没有调查员卡`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    });
  }

  if (event?.group_id && !getPartyMember(stateBundle.meta, event?.user_id)) {
    const restoredMember = upsertPartyMember(stateBundle, event, {
      investigatorId: actorResult.actorId,
      save: false
    });
    if (restoredMember.ok) {
      pruneTurnStateToParty(stateBundle, { save: false });
    }
  }

  const spotlightControl = maybeHandleSpotlightConflict(text, event, stateBundle, actorResult);
  if (spotlightControl?.blocked) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "spotlight_conflict",
      reply: spotlightControl.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: []
    });
  }
  const actionText = spotlightControl?.text || text;
  const beforeSessionState = cloneJson(stateBundle.sessionState);
  setSessionMode(stateBundle, "kp");
  const autoLockedParty = maybeAutoLockPartyForScene(stateBundle);
  const proposedAction = routeScenarioAction(stateBundle.sessionState, actorResult.actorId, actionText);
  let turn;
  const resolvedChoice = proposedAction
    ? resolveSceneActionChoice(stateBundle, actorResult.actorId, actionText, proposedAction)
    : null;
  if (resolvedChoice?.reply) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "pending_scene_action_choice",
      reply: [spotlightControl?.focusLine, resolvedChoice.reply].filter(Boolean).join("\n")
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: spotlightControl?.operationEvents || []
    });
  }

  if (proposedAction?.kind) {
    const action = resolvedChoice?.action || proposedAction;
    const investigator = stateBundle.sessionState.investigators?.[actorResult.actorId];
    const requiredSkill = findInvestigatorSkillEntry(investigator, action.skillKey);
    if (!requiredSkill) {
      turn = {
        ok: false,
        reason: "missing_skill",
        action,
        reply: [spotlightControl?.focusLine, `我听懂你想做什么了，但这名调查员现在卡里没有 ${action.skillKey}，这一步我还不能稳稳落。`].filter(Boolean).join("\n")
      };
    } else {
      turn = {
        ok: true,
        action,
        result: (options.submitAction || require("../../core/src/api").submitAction)(
          stateBundle.sessionState,
          action,
          options.randomInt || defaultRandomInt
        )
      };
    }
  } else {
    turn = processScenarioTurn(
      stateBundle.sessionState,
      actorResult.actorId,
      actionText,
      options.submitAction || require("../../core/src/api").submitAction,
      options.randomInt || defaultRandomInt
    );
  }

  if (!turn.ok) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reply: turn.reply,
      reason: turn.reason
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: [
        ...(spotlightControl?.operationEvents || []),
        buildOperationEvent("turn.rejected", `${getSenderName(event)} 的行动没有落地：${turn.reason || "unknown"}`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          actorId: actorResult.actorId,
          reason: turn.reason || null,
          intent: actionText
        })
      ]
    });
  }

  const pendingPostCheckChoice = buildPostCheckChoice(
    stateBundle,
    turn.action,
    turn.result,
    beforeSessionState,
    stateBundle.sessionState.investigators?.[actorResult.actorId]
  );
  if (pendingPostCheckChoice) {
    stateBundle.meta.updatedAt = new Date().toISOString();
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    saveMeta(stateBundle.layout, stateBundle.meta);
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "pending_scene_action_choice",
      reply: [spotlightControl?.focusLine, formatSceneActionChoiceReply(pendingPostCheckChoice)].filter(Boolean).join("\n"),
      action: turn.action
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: spotlightControl?.operationEvents || []
    });
  }

  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);

  const softTimeActionSummary = describeSoftTimeActionLabel(
    turn.action,
    turn.result?.event,
    turn.action?.kind || "行动已处理"
  );
  recordResolvedTurnSoftTime(stateBundle, actorResult.actorId, {
    beforeSessionState,
    actionSummary: softTimeActionSummary
  });
  const autoAdvancedSpotlight = maybeAdvanceSpotlightAfterResolvedTurn(stateBundle, actorResult.actorId);
  const deltaSummary = formatStateDelta(beforeSessionState, stateBundle.sessionState);
  const sceneBeat = formatSceneBeat(stateBundle.sessionState);
  const optionCue = formatOptionCue(stateBundle.sessionState);
  const softTimeCue = autoAdvancedSpotlight?.currentActor ? consumeActorSoftTimeCue(stateBundle, autoAdvancedSpotlight.currentActor.id) : null;
  const spotlightCue = [formatSpotlightCue(stateBundle), softTimeCue].filter(Boolean).join("\n") || null;
  const investigator = stateBundle.sessionState.investigators[actorResult.actorId];
  const operationSummary = describeOperationOutcome(turn.result?.event) || turn.action?.kind || "行动已处理";

  return flushConversationArtifacts(event, stateBundle, {
    ok: true,
    reply: [spotlightControl?.focusLine, formatTurnReply(turn.result, {
      deltaSummary,
      sceneBeat,
      optionCue,
      spotlightCue
    })].filter(Boolean).join("\n"),
    action: turn.action
  }, {
    includeContextPacket: options.includeContextPacket === true,
    contextOptions,
    summaryOptions,
    operationEvents: [
      ...(spotlightControl?.operationEvents || []),
      ...(autoAdvancedSpotlight?.operationEvent ? [autoAdvancedSpotlight.operationEvent] : []),
      ...(autoLockedParty ? [buildOperationEvent("party.lock", "多人正式进场，系统自动锁定了当前名单", {
        memberCount: listPartyMembers(stateBundle.meta).length
      })] : []),
      buildOperationEvent("scene.action", `${investigator?.name || getSenderName(event)} 执行了 ${turn.action?.kind || "unknown"}：${operationSummary}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        actorId: actorResult.actorId,
        action: cloneJson(turn.action),
        result: cloneJson(turn.result?.event || null),
        deltaSummary
      })
    ]
  });
}

module.exports = {
  sanitizeSegment,
  getMessageText,
  getSenderName,
  getKpRuntimePrompt,
  buildConversationKey,
  buildStorageLayoutFromConversationKey,
  buildStorageLayout,
  loadMeta,
  saveMeta,
  isAiKpCommand,
  shouldHandleOneBotMessage,
  getConversationRuntimeState,
  loadConversationContext,
  rememberUser,
  createDefaultInvestigator,
  createRolledInvestigator,
  createQuickfireInvestigator,
  ensureConversationSession,
  ensureActorForUser,
  formatStateSummary,
  formatScenePanel,
  formatRecapReply,
  formatPartySummary,
  formatCluePanel,
  formatNpcPanel,
  formatSceneBeat,
  formatOptionCue,
  formatSpotlightCue,
  formatTurnReply,
  formatStartReply,
  resolveSceneActionChoice,
  handlePendingSceneActionChoice,
  handlePendingSceneActionChoiceWithOptions,
  buildPostCheckChoice,
  formatSceneActionChoiceReply,
  formatHelpReply,
  formatSettlementReply,
  formatInvestigatorSummary,
  handleOneBotMessage,
  rebuildConversationSession,
  runPartyRollCommand,
  buildPartyEntries,
  resolveActorSelection,
  setCurrentActor,
  advanceCurrentActor
};
