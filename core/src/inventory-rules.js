const ERA_BANNED_KEYWORDS = {
  depression_era_1920s: ["智能手机", "smartphone", "手机", "平板", "tablet", "笔记本电脑", "laptop", "无人机", "drone"]
};

function categoryLimit(category) {
  if (category === "powerful" || category === "weapon") return 1;
  if (category === "daily" || category === "tool") return 3;
  return 2;
}

function validateInventoryForEra(inventory, era) {
  const bannedKeywords = ERA_BANNED_KEYWORDS[era] || [];
  const issues = [];
  const groupedCounts = {};

  for (const item of inventory) {
    const name = item.name || "";
    const lowerName = name.toLowerCase();

    if (bannedKeywords.some((keyword) => lowerName.includes(String(keyword).toLowerCase()))) {
      issues.push({
        type: "era_block",
        item: item.name,
        message: `${item.name} 不符合当前时代 ${era}`
      });
    }

    const bucket = item.category || "other";
    groupedCounts[bucket] = (groupedCounts[bucket] || 0) + (item.quantity || 1);
  }

  for (const [bucket, count] of Object.entries(groupedCounts)) {
    const limit = categoryLimit(bucket);
    if (count > limit) {
      issues.push({
        type: "limit_exceeded",
        category: bucket,
        count,
        limit,
        message: `${bucket} 类物品当前带了 ${count} 件，超过建议上限 ${limit}`
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function buildConditionalAllowance(validation) {
  if (validation.ok) {
    return {
      allowed: true,
      mode: "direct",
      notes: ["物品通过当前时代与配额校验。"]
    };
  }

  return {
    allowed: true,
    mode: "conditional",
    notes: validation.issues.map((issue) => {
      if (issue.type === "era_block") {
        return `${issue.item} 需要替换为时代相符版本，或改成剧情中后续才能获得。`;
      }
      if (issue.type === "limit_exceeded") {
        return `${issue.category} 超额，建议降到 ${issue.limit} 件，或保留但增加盘查/携带风险。`;
      }
      return issue.message;
    })
  };
}

module.exports = {
  validateInventoryForEra,
  buildConditionalAllowance
};