function splitLines(markdown = "") {
  return String(markdown).replace(/\r\n/g, "\n").split("\n");
}

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function parseInlineKeyValue(line) {
  const index = line.indexOf(":");
  if (index === -1) return null;
  return {
    key: line.slice(0, index).trim(),
    value: line.slice(index + 1).trim()
  };
}

function parseTopMeta(lines, startIndex = 0) {
  const meta = {};
  let index = startIndex;

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

function parseSimpleList(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function parseAreas(lines) {
  const areas = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("### ")) {
      const payload = line.replace(/^###\s+/, "");
      const [id, name] = payload.split("|").map((item) => item.trim());
      current = { id, name, description: "", notable: [] };
      areas.push(current);
      continue;
    }
    if (!current) continue;
    const keyValue = parseInlineKeyValue(line);
    if (keyValue && keyValue.key === "description") {
      current.description = keyValue.value;
      continue;
    }
    if (line.startsWith("- ")) {
      current.notable.push(line.replace(/^-\s+/, "").trim());
    }
  }

  return areas;
}

function parsePipeRows(lines, mapper) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s+/, "").split("|").map((item) => item.trim()))
    .map(mapper)
    .filter(Boolean);
}

function parseOpening(lines) {
  return lines.join("\n").trim();
}

function parseAtmosphere(lines) {
  const result = { tone: "", light: "", smell: [], sound: [] };
  let currentListKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const keyValue = parseInlineKeyValue(line);
    if (keyValue) {
      if (keyValue.key === "tone") result.tone = keyValue.value;
      else if (keyValue.key === "light") result.light = keyValue.value;
      else if (keyValue.key === "smell") currentListKey = "smell";
      else if (keyValue.key === "sound") currentListKey = "sound";
      continue;
    }
    if (line.startsWith("- ") && currentListKey) {
      result[currentListKey].push(line.replace(/^-\s+/, "").trim());
    }
  }

  return result;
}

function importSceneMarkdown(markdown) {
  const lines = splitLines(markdown);
  const { meta } = parseTopMeta(lines, 0);
  const scene = {
    id: meta.id,
    title: meta.title,
    opening: "",
    summary: meta.summary || meta.title,
    location: meta.location || "未知地点",
    sceneType: meta.sceneType || "investigation",
    threats: {
      exposure: Number(meta.exposure || 0),
      pressure: Number(meta.pressure || 0),
      dangerLevel: meta.dangerLevel || "low"
    },
    atmosphere: { tone: "", smell: [], sound: [], light: "" },
    areas: [],
    truthLayers: [],
    endingHooks: [],
    clues: [],
    events: [],
    nextOptions: [],
    npcRefs: [],
    starterPrompts: []
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.startsWith("## ")) {
      index += 1;
      continue;
    }

    const section = collectSection(lines, index);
    if (section.title === "Opening") scene.opening = parseOpening(section.content);
    if (section.title === "Atmosphere") scene.atmosphere = parseAtmosphere(section.content);
    if (section.title === "Areas") scene.areas = parseAreas(section.content);
    if (section.title === "Truth Layers") scene.truthLayers = parseSimpleList(section.content);
    if (section.title === "Ending Hooks") scene.endingHooks = parseSimpleList(section.content);
    if (section.title === "Starter Prompts") scene.starterPrompts = parseSimpleList(section.content);
    if (section.title === "Clues") {
      scene.clues = parsePipeRows(section.content, ([id, title, kind, quality, revealed, source]) => ({
        id,
        title,
        kind,
        quality,
        revealed: parseBoolean(revealed),
        source
      }));
    }
    if (section.title === "Events") {
      scene.events = parsePipeRows(section.content, ([id, label, triggered]) => ({
        id,
        label,
        triggered: parseBoolean(triggered)
      }));
    }
    if (section.title === "Options") {
      scene.nextOptions = parsePipeRows(section.content, ([id, label, type]) => ({ id, label, type }));
    }
    if (section.title === "NPC Refs") {
      scene.npcRefs = parsePipeRows(section.content, ([id, trust, status]) => ({
        id,
        trust: Number(trust || 0),
        status: status || "active"
      }));
    }

    index = section.nextIndex;
  }

  return scene;
}

module.exports = {
  importSceneMarkdown
};
