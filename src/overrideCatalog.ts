import type {
  MockOverride,
  MockOverrideParam,
  MockOverrideParamsSchema,
  MockOverrideParamValues,
} from "./utils.js";

export const overrideStateFileName = ".mock-overrides.json";

export type MockOverrideParamInfo =
  | { key: string; type: "boolean"; default: boolean }
  | { key: string; type: "string"; default: string; options?: string[] };

export interface MockOverrideTreeGroup {
  kind: "group";
  id: string;
  name: string;
  children: MockOverrideTreeNode[];
}

export interface MockOverrideTreeLeaf {
  kind: "override";
  id: string;
  name: string;
  description?: string;
  params: MockOverrideParamInfo[];
}

export type MockOverrideTreeNode = MockOverrideTreeGroup | MockOverrideTreeLeaf;

export interface MockOverrideActiveEntry {
  id: string;
  params: Record<string, boolean | string>;
  isEnabled: boolean;
}

export interface MockOverrideStateFile {
  active: MockOverrideActiveEntry[];
}

export function isIgnoredOverrideName(name: string) {
  return name.startsWith("_");
}

export function isOverrideModuleFileName(name: string) {
  return (
    name.endsWith(".ts") &&
    !name.endsWith(".d.ts") &&
    !name.endsWith(".test.ts") &&
    !isIgnoredOverrideName(name)
  );
}

export function toPosixPath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

export function isMockOverride(value: unknown): value is MockOverride {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    (!("description" in value) || value.description === undefined || typeof value.description === "string") &&
    (!("params" in value) || value.params === undefined || isParamsSchema(value.params)) &&
    "override" in value &&
    typeof value.override === "function"
  );
}

function isParamsSchema(value: unknown): value is MockOverrideParamsSchema {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((param: unknown) => {
    if (typeof param !== "object" || param === null || !("type" in param) || !("default" in param)) return false;
    if (param.type === "boolean") return typeof param.default === "boolean";
    if (param.type !== "string" || typeof param.default !== "string") return false;
    return !("options" in param) || param.options === undefined ||
      (Array.isArray(param.options) && param.options.every((option: unknown) => typeof option === "string") && param.options.includes(param.default));
  });
}

export function readExportedMockOverride(moduleExports: Record<string, unknown>) {
  if (isMockOverride(moduleExports.default)) {
    return moduleExports.default;
  }

  const overrides = Object.values(moduleExports).filter(isMockOverride);
  return overrides.length === 1 ? overrides[0] : undefined;
}

export function serializeParamsSchema(
  schema: MockOverrideParamsSchema | undefined,
): MockOverrideParamInfo[] {
  if (schema === undefined) {
    return [];
  }

  return Object.entries(schema).map(([key, param]: [string, MockOverrideParam]) => {
    if (param.type === "boolean") {
      return { key, type: "boolean", default: param.default };
    }

    const info: MockOverrideParamInfo = { key, type: "string", default: param.default };

    if (param.options !== undefined) {
      info.options = [...param.options];
    }

    return info;
  });
}

export function paramsSchemaFromInfo(params: MockOverrideParamInfo[]): MockOverrideParamsSchema {
  return Object.fromEntries(
    params.map((param) => {
      if (param.type === "boolean") {
        return [param.key, { type: "boolean", default: param.default }];
      }

      return [
        param.key,
        {
          type: "string",
          default: param.default,
          ...(param.options === undefined ? {} : { options: param.options }),
        },
      ];
    }),
  );
}

export function resolveOverrideParams(
  schema: MockOverrideParamsSchema | undefined,
  stored: unknown,
): Record<string, boolean | string> {
  if (schema === undefined) {
    return {};
  }

  const source =
    typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const resolved: Record<string, boolean | string> = {};

  for (const [key, param] of Object.entries(schema) as Array<[string, MockOverrideParam]>) {
    const value = source[key];

    if (param.type === "boolean") {
      resolved[key] = typeof value === "boolean" ? value : param.default;
      continue;
    }

    if (typeof value !== "string") {
      resolved[key] = param.default;
      continue;
    }

    if (param.options !== undefined && !param.options.includes(value)) {
      resolved[key] = param.default;
      continue;
    }

    resolved[key] = value;
  }

  return resolved;
}

export function flattenOverrideLeaves(nodes: MockOverrideTreeNode[]): MockOverrideTreeLeaf[] {
  return nodes.flatMap((node) =>
    node.kind === "override" ? [node] : flattenOverrideLeaves(node.children),
  );
}

export function filterOverrideTreeByQuery(
  nodes: MockOverrideTreeNode[],
  query: string,
): MockOverrideTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    return nodes;
  }

  const matchesText = (value: string) => value.toLowerCase().includes(normalizedQuery);

  const walk = (
    items: MockOverrideTreeNode[],
    isUnderMatchingGroup: boolean,
  ): MockOverrideTreeNode[] => {
    const nextNodes: MockOverrideTreeNode[] = [];

    for (const node of items) {
      if (node.kind === "override") {
        if (
          isUnderMatchingGroup ||
          matchesText(node.name) ||
          matchesText(node.id) ||
          (node.description !== undefined && matchesText(node.description))
        ) {
          nextNodes.push(node);
        }

        continue;
      }

      const groupMatches = matchesText(node.name) || matchesText(node.id);
      const children = walk(node.children, isUnderMatchingGroup || groupMatches);

      if (groupMatches || children.length > 0) {
        nextNodes.push({
          ...node,
          children: groupMatches ? node.children : children,
        });
      }
    }

    return nextNodes;
  };

  return walk(nodes, false);
}

export function collectGroupIds(nodes: MockOverrideTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "group" ? [node.id, ...collectGroupIds(node.children)] : [],
  );
}

export function parseOverrideStateFile(raw: unknown): MockOverrideActiveEntry[] {
  if (typeof raw !== "object" || raw === null || !("active" in raw) || !Array.isArray(raw.active)) {
    return [];
  }

  const entries: MockOverrideActiveEntry[] = [];

  for (const item of raw.active) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string"
    ) {
      continue;
    }

    const params =
      "params" in item && typeof item.params === "object" && item.params !== null
        ? (item.params as Record<string, boolean | string>)
        : {};
    const isEnabled = !("isEnabled" in item) || item.isEnabled !== false;
    const existingIndex = entries.findIndex((entry) => entry.id === item.id);
    const nextEntry = { id: item.id, params, isEnabled };

    if (existingIndex === -1) {
      entries.push(nextEntry);
    } else {
      entries.splice(existingIndex, 1);
      entries.push(nextEntry);
    }
  }

  return entries;
}

export function serializeOverrideStateFile(active: MockOverrideActiveEntry[]): string {
  const state: MockOverrideStateFile = { active };
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function normalizeActiveOverrides(
  entries: MockOverrideActiveEntry[],
  catalog: Map<string, MockOverride>,
): MockOverrideActiveEntry[] {
  const normalized: MockOverrideActiveEntry[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const override = catalog.get(entry.id);

    if (override === undefined || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    normalized.push({
      id: entry.id,
      params: resolveOverrideParams(override.params, entry.params),
      isEnabled: entry.isEnabled !== false,
    });
  }

  return normalized;
}

export function placeActiveOverride(
  active: MockOverrideActiveEntry[],
  id: string,
  toIndex: number,
  createEntry: () => MockOverrideActiveEntry,
): MockOverrideActiveEntry[] {
  const fromIndex = active.findIndex((entry) => entry.id === id);
  const entry = fromIndex === -1 ? createEntry() : active[fromIndex];
  const without = fromIndex === -1 ? active : active.filter((item) => item.id !== id);
  const adjustedIndex = fromIndex !== -1 && fromIndex < toIndex ? toIndex - 1 : toIndex;
  const clampedIndex = Math.max(0, Math.min(without.length, adjustedIndex));

  return [...without.slice(0, clampedIndex), entry, ...without.slice(clampedIndex)];
}

export function removeActiveOverride(active: MockOverrideActiveEntry[], id: string) {
  return active.filter((entry) => entry.id !== id);
}

export function updateActiveOverrideParams(
  active: MockOverrideActiveEntry[],
  id: string,
  params: Record<string, boolean | string>,
) {
  return active.map((entry) => (entry.id === id ? { ...entry, params } : entry));
}

export function setActiveOverrideEnabled(
  active: MockOverrideActiveEntry[],
  id: string,
  isEnabled: boolean,
) {
  return active.map((entry) => (entry.id === id ? { ...entry, isEnabled } : entry));
}

export function createActiveOverrideEntry(
  leaf: MockOverrideTreeLeaf,
  stored?: unknown,
): MockOverrideActiveEntry {
  return {
    id: leaf.id,
    params: resolveOverrideParams(paramsSchemaFromInfo(leaf.params), stored),
    isEnabled: true,
  };
}

export type AppliedMockOverride = MockOverride & {
  id: string;
};

export function applyOverrideParams(
  override: MockOverride,
  params: Record<string, boolean | string>,
) {
  return override.override(params as MockOverrideParamValues<MockOverrideParamsSchema>);
}
