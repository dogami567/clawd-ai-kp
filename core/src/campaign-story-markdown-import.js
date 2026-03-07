function splitLines(markdown = "") {
  return String(markdown).replace(/\r\n/g, "\n").split("\n");
}

function parseInlineKeyValue(line) {
  const index = line.indexOf(":");
  if (index === -1) return null;
  return {
    key: line.slice(0, index).trim(),
    value: line.slice(index + 1).trim()
  };
}

function parseTopMeta(lines) {
  const meta = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) break;
    if (line.startsWith("# ")) {
      index += 1;
      continue;
    }
    const parsed = parseInlineKeyValue(line);
    if (parsed) meta[parsed.key] = parsed.value;
    index += 1;
  }

  return { meta, nextIndex: index };
}

function collectSection(lines, startIndex) {
  const title = lines[startIndex].trim().replace(/^##\s+/, "").trim();
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length && !lines[index].trim().startsWith("## ")) {
    content.push(lines[index]);
    index += 1;
  }
  return { title, content, nextIndex: index };
}

function collectSubsection(lines, startIndex) {
  const title = lines[startIndex].trim().replace(/^###\s+/, "").trim();
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length && !lines[index].trim().startsWith("### ")) {
    content.push(lines[index]);
    index += 1;
  }
  return { title, content, nextIndex: index };
}

function parseSimpleList(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function parseConditionPairs(rawValue = "") {
  const conditions = {};
  const pairs = String(rawValue)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const [rawKey, rawVal] = pair.split("=").map((item) => item.trim());
    if (!rawKey || rawVal == null) continue;
    if (["minRevealedCoreClues"].includes(rawKey)) {
      conditions[rawKey] = Number(rawVal);
      continue;
    }
    if (["maxDangerLevel", "minDangerLevel"].includes(rawKey)) {
      conditions[rawKey] = rawVal;
      continue;
    }
    if (["requiredTriggeredEvents", "requiredNpcFlags"].includes(rawKey)) {
      conditions[rawKey] = rawVal.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }

  return conditions;
}

function parseHooks(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, "").split("|").map((item) => item.trim()))
    .map(([id, label, targetSceneId, status, rawConditions]) => ({
      id,
      label,
      targetSceneId,
      status: status || "planned",
      ...(rawConditions ? { conditions: parseConditionPairs(rawConditions) } : {})
    }))
    .filter((hook) => hook.id && hook.label && hook.targetSceneId);
}

function parseCampaignScenes(lines) {
  const scenes = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.startsWith("### ")) {
      index += 1;
      continue;
    }

    const subsection = collectSubsection(lines, index);
    const [sceneId, title, phase] = subsection.title.split("|").map((item) => item.trim());
    const scene = {
      sceneId,
      title,
      phase: phase || "act-1",
      purpose: "",
      hooks: []
    };

    let inHooks = false;
    for (const rawLine of subsection.content) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (/^####\s+Hooks$/i.test(trimmed)) {
        inHooks = true;
        continue;
      }
      if (inHooks) {
        scene.hooks = parseHooks(subsection.content.filter((item) => item.trim().startsWith("- ")));
        break;
      }
      const keyValue = parseInlineKeyValue(trimmed);
      if (keyValue && keyValue.key === "purpose") {
        scene.purpose = keyValue.value;
      }
    }

    scenes.push(scene);
    index = subsection.nextIndex;
  }

  return scenes;
}

function importCampaignMarkdown(markdown) {
  const lines = splitLines(markdown);
  const { meta } = parseTopMeta(lines);
  const campaign = {
    id: meta.id,
    title: meta.title,
    summary: meta.summary,
    startSceneId: meta.startSceneId,
    scenes: []
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.startsWith("## ")) {
      index += 1;
      continue;
    }
    const section = collectSection(lines, index);
    if (section.title === "Scenes") {
      campaign.scenes = parseCampaignScenes(section.content);
    }
    index = section.nextIndex;
  }

  return campaign;
}

function importStoryPackMarkdown(markdown) {
  const lines = splitLines(markdown);
  const { meta } = parseTopMeta(lines);
  const storyPack = {
    id: meta.id,
    title: meta.title,
    campaignId: meta.campaignId,
    sceneIds: [],
    notes: []
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.startsWith("## ")) {
      index += 1;
      continue;
    }
    const section = collectSection(lines, index);
    if (section.title === "Scene Ids") {
      storyPack.sceneIds = parseSimpleList(section.content);
    }
    if (section.title === "Notes") {
      storyPack.notes = parseSimpleList(section.content);
    }
    index = section.nextIndex;
  }

  return storyPack;
}

module.exports = {
  importCampaignMarkdown,
  importStoryPackMarkdown
};
