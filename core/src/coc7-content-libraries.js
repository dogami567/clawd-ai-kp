function uniqueList(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function pickBySeed(options = [], seedText = "") {
  if (!options.length) return null;
  let hash = 0;
  for (const char of String(seedText || "")) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return options[hash % options.length];
}

const FAILURE_FORWARD_LIBRARY = Object.freeze({
  time: Object.freeze({
    label: "时间代价",
    acceptLines: [
      "线索没断，但你们已经慢了一拍，倒计时和压力会先往前跳一下。",
      "事情还是在推进，只是你们得拿更多时间去换，场上那口气会更紧。"
    ],
    followup: "常见会落成时间流失、压力上升，或目标先一步转场。",
    reviewNote: "适合搜证、破译、追踪失去节奏这类失败。"
  }),
  exposure: Object.freeze({
    label: "暴露代价",
    acceptLines: [
      "事情往前动了，但你们也留下了声响、痕迹，或者被谁盯上了。",
      "推进是有推进，只不过你们已经把自己递到别人视线边上了。"
    ],
    followup: "常见会落成暴露值上升、NPC 戒心变高、额外巡逻或追逐。",
    reviewNote: "适合潜行、偷窃、跟踪、硬闯这类失败。"
  }),
  relationship: Object.freeze({
    label: "关系代价",
    acceptLines: [
      "你还是撬开了一点信息，但对方会把这次记成一笔情绪账。",
      "话不是没送进去，只是关系面已经被你磨毛了。"
    ],
    followup: "常见会落成态度下降、要价变高、后续社交路线变窄。",
    reviewNote: "适合说服、魅惑、恐吓、贿赂后的失败推进。"
  }),
  resource: Object.freeze({
    label: "资源代价",
    acceptLines: [
      "事情推进了，但会吃掉道具、现金、体力，或者把窗口磨薄一点。",
      "你拿到了想要的那一层，可代价会落在资源和后勤上。"
    ],
    followup: "常见会落成物品损耗、现金支出、体力消耗，或额外准备动作。",
    reviewNote: "适合工具使用、急救、修理、交易类动作。"
  }),
  misinfo: Object.freeze({
    label: "偏差信息",
    acceptLines: [
      "你还是摸到了东西，只是它会把你们往偏一点的方向带。",
      "线索还在，但这次拿到的是带噪声的版本，后面得再校一次。"
    ],
    followup: "常见会落成部分真相、错误重点，或需要下一步交叉验证。",
    reviewNote: "适合侦查、图书馆、资料比对类失败。"
  }),
  injury: Object.freeze({
    label: "伤势代价",
    acceptLines: [
      "事情推过去了，但你得拿皮肉、站位或行动余裕来换。",
      "你勉强顶过去了，可身体后劲已经开始掉链子。"
    ],
    followup: "常见会落成 HP 损失、倒地、手滑、需要急救或被迫撤步。",
    reviewNote: "适合高风险闯关、攀爬、近战、坠落类失败。"
  }),
  sanity: Object.freeze({
    label: "精神代价",
    acceptLines: [
      "真相往前挪了一点，但这口刺激会直接记到精神状态上。",
      "你看见了该看的东西，只不过 SAN 这边得先挨一下。"
    ],
    followup: "常见会落成 SAN 损失、临时发作、短暂失语或行动失序。",
    reviewNote: "适合神话冲击、尸体现身、异常仪式等失败。"
  })
});

const PUSHED_ROLL_LIBRARY = Object.freeze({
  default: Object.freeze({
    label: "通用强推",
    lines: [
      "可以推骰，但若还没过，代价通常会从“勉强推进”翻成“现场直接变糟”。",
      "能再赌一次；只是再失手的话，KP 一般会把后果直接落实，不再只给软代价。"
    ]
  }),
  explore: Object.freeze({
    label: "侦查强推",
    lines: [
      "可以再翻一次，但再失败多半就是惊动现场、漏掉关键顺序，或者把线索直接摸坏。",
      "想强推可以；不过再没过，常见会从“看漏”升级成“留下痕迹、把动静放出来”。"
    ]
  }),
  talk: Object.freeze({
    label: "社交强推",
    lines: [
      "可以再递一句，但再失败通常会把场面推到翻脸、要价、记仇这一档。",
      "能强推；只是再没过，对方往往不只是闭嘴，而是会改变态度或反咬回来。"
    ]
  }),
  use_item: Object.freeze({
    label: "工具强推",
    lines: [
      "可以硬上，但再失败就不只是没效果，常见会把工具、窗口或材料一起赔进去。",
      "想强推没问题；不过再没过，KP 往往会把代价落到道具损坏、资源消耗或时间爆掉。"
    ]
  }),
  steal: Object.freeze({
    label: "偷窃强推",
    lines: [
      "可以再伸一次手，但再失败通常就是当场露馅、被盯上，或失主提前清点。",
      "能强推；只是这类动作再失手，很容易从“差一点”直接翻成“人赃俱在”。"
    ]
  }),
  follow: Object.freeze({
    label: "跟踪强推",
    lines: [
      "可以继续咬住，但再失败多半就是被对方彻底确认、换路线，甚至反钓你。",
      "能再赌一次；不过再没过，常见会从“快跟丢”升级成“直接暴露”。"
    ]
  }),
  risky_action: Object.freeze({
    label: "高风险强推",
    lines: [
      "这种动作真要强推，再失败通常就不是小代价，而是直接触发伤势、惊动或更坏的后果。",
      "可以莽，但再没过的话，KP 一般会把危险一次性落实，不会只给轻描淡写的推进。"
    ]
  })
});

const PENALTY_DICE_LIBRARY = Object.freeze({
  poor_light: Object.freeze({
    key: "poor_light",
    label: "昏暗或遮挡",
    penaltyDice: 1,
    note: "视线不完整时，侦查、射击、读取现场都容易漏细节。"
  }),
  unstable_ground: Object.freeze({
    key: "unstable_ground",
    label: "湿滑、狭窄或高低差地形",
    penaltyDice: 1,
    note: "楼梯、碎石、地下通道这类地形会让移动、追逐和硬闯更吃亏。"
  }),
  rushed_window: Object.freeze({
    key: "rushed_window",
    label: "争分夺秒",
    penaltyDice: 1,
    note: "越赶时间越难稳住动作，常见会补惩罚骰来体现仓促。"
  }),
  split_focus: Object.freeze({
    key: "split_focus",
    label: "一边藏人一边做事",
    penaltyDice: 1,
    note: "偷窃、尾随、临场编话时同时顾太多目标，容易手忙脚乱。"
  }),
  pain_and_shock: Object.freeze({
    key: "pain_and_shock",
    label: "伤势或精神后效",
    penaltyDice: 1,
    note: "吃过伤、刚失 SAN、或状态不稳时，专注与动作都会被拖住。"
  }),
  improvised_tools: Object.freeze({
    key: "improvised_tools",
    label: "临时工具",
    penaltyDice: 1,
    note: "工具不趁手时，修理、撬锁、急救和精细操作更容易翻车。"
  }),
  outnumbered: Object.freeze({
    key: "outnumbered",
    label: "被夹击或压位",
    penaltyDice: 1,
    note: "战斗里被多人围压时，格斗和闪避通常都会吃亏。"
  })
});

const SANITY_AFTERMATH_LIBRARY = Object.freeze({
  temporary: Object.freeze([
    "当场僵住几秒，动作节奏被打断",
    "突然转成本能反应，先撤、先躲或先护住同伴",
    "说话开始跳针，短时间内很难把线索讲清"
  ]),
  indefinite: Object.freeze([
    "把这件事记成长期阴影，之后再碰相关场景会更难稳住",
    "开始对某类声音、地点或符号特别敏感",
    "人还在推进，但性格面会被这次经历慢慢改写"
  ])
});

const INJURY_AFTERMATH_LIBRARY = Object.freeze({
  setback: Object.freeze([
    "擦伤、扭伤或摔得发虚，下一步动作不再利索",
    "为了把事做完只能硬吃一下疼，后面得补急救或撤步",
    "站位被迫变差，继续硬顶会更危险"
  ]),
  major: Object.freeze([
    "直接打进重伤区，需要立刻止血、固定或撤离",
    "动作还能做，但要按明显失能去演绎后效",
    "如果还不收手，很容易继续滑向濒死"
  ]),
  dying: Object.freeze([
    "已经不是单纯吃亏，而是得先保命",
    "现场推进会让位给抢救、拖人和撤离",
    "再拖延的话，后果会从伤势变成角色生存问题"
  ])
});

function inferPenaltyTags(action = {}, scene = {}, actor = null) {
  const tags = [];
  const lightText = String(scene?.meta?.atmosphere?.light || scene?.meta?.opening || "").toLowerCase();
  const locationText = String(scene?.location || "").toLowerCase();
  const dangerLevel = scene?.threats?.dangerLevel || "low";

  if (/(暗|moon|shadow|挤进来一点|不够用|昏|light)/i.test(lightText)) tags.push("poor_light");
  if (/(楼梯|钟楼|地下|地窖|密室|broken-floor|stairs)/i.test(locationText) || action.kind === "risky_action") tags.push("unstable_ground");
  if (["high", "extreme"].includes(dangerLevel) || action.pushed === true) tags.push("rushed_window");
  if (["steal", "follow", "talk"].includes(action.kind)) tags.push("split_focus");
  if (action.kind === "use_item") tags.push("improvised_tools");
  if (scene?.sceneType === "combat") tags.push("outnumbered");
  if (actor?.status?.majorWound || actor?.status?.temporaryInsanity || actor?.status?.indefiniteInsanity) tags.push("pain_and_shock");

  return uniqueList(tags);
}

function summarizePenaltyEntries(entries = []) {
  if (!entries.length) return null;
  return entries
    .map((entry) => `${entry.label}（常见 ${entry.penaltyDice} 颗惩罚骰：${entry.note}）`)
    .join("；");
}

function buildCrisisNote(action = {}, scene = {}, actor = null) {
  const dangerLevel = scene?.threats?.dangerLevel || "low";
  const needsHighRiskPreview = action.kind === "risky_action" || action.pushed === true || ["high", "extreme"].includes(dangerLevel);
  if (!needsHighRiskPreview) return null;

  const injuryPool = dangerLevel === "extreme" ? INJURY_AFTERMATH_LIBRARY.major : INJURY_AFTERMATH_LIBRARY.setback;
  const sanityPool = actor?.status?.temporaryInsanity || actor?.status?.indefiniteInsanity
    ? SANITY_AFTERMATH_LIBRARY.indefinite
    : SANITY_AFTERMATH_LIBRARY.temporary;

  const injury = pickBySeed(injuryPool, `${action.intent || action.kind}-injury`);
  const sanity = pickBySeed(sanityPool, `${action.intent || action.kind}-sanity`);
  return `再硬顶的话，常见会从这些后果里落一类：${injury}；${sanity}。`;
}

function buildActionRuleGuidance({ action = {}, adjudication = {}, scene = {}, actor = null }) {
  const failForwardKey = adjudication.failForward || "time";
  const failForwardEntry = FAILURE_FORWARD_LIBRARY[failForwardKey] || FAILURE_FORWARD_LIBRARY.time;
  const pushedEntry = PUSHED_ROLL_LIBRARY[action.kind] || PUSHED_ROLL_LIBRARY.default;
  const penaltyTags = inferPenaltyTags(action, scene, actor);
  const penaltyEntries = penaltyTags
    .map((tag) => PENALTY_DICE_LIBRARY[tag])
    .filter(Boolean);

  return {
    failForward: failForwardKey,
    failForwardLabel: failForwardEntry.label,
    acceptLine: pickBySeed(failForwardEntry.acceptLines, action.intent || action.kind),
    failurePreview: `${failForwardEntry.label}：${failForwardEntry.followup}`,
    failureReviewNote: failForwardEntry.reviewNote,
    pushLine: pickBySeed(pushedEntry.lines, action.intent || action.kind),
    penaltyTags,
    penaltyEntries,
    penaltyNote: penaltyEntries.length
      ? `按 CoC7 常见判法，这种条件下一般会考虑惩罚骰：${summarizePenaltyEntries(penaltyEntries)}`
      : null,
    crisisNote: buildCrisisNote(action, scene, actor)
  };
}

module.exports = {
  FAILURE_FORWARD_LIBRARY,
  PUSHED_ROLL_LIBRARY,
  PENALTY_DICE_LIBRARY,
  SANITY_AFTERMATH_LIBRARY,
  INJURY_AFTERMATH_LIBRARY,
  buildActionRuleGuidance
};
