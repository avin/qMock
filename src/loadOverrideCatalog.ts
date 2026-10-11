import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ViteDevServer } from "vite";
import {
  isOverrideModuleFileName,
  isIgnoredOverrideName,
  readExportedMockOverride,
  serializeParamsSchema,
  toPosixPath,
} from "./overrideCatalog.js";
import type { MockOverrideTreeNode } from "./overrideCatalog.js";
import type { MockOverride } from "./utils.js";

export const overridesDirectory = "src/mocks/overrides";

export type LoadedOverrideCatalog = {
  tree: MockOverrideTreeNode[];
  byId: Map<string, MockOverride>;
};

async function readDirectoryEntries(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
}

async function loadModuleExports(server: ViteDevServer, modulePath: string) {
  try {
    return (await server.ssrLoadModule(modulePath)) as Record<string, unknown>;
  } catch (error) {
    console.error(`[mock-api] Failed to load ${modulePath}`, error);
    return undefined;
  }
}

function toViteModulePath(directory: string, relativePosixPath: string) {
  return `${toPosixPath(directory).replace(/\/$/, "")}/${relativePosixPath}`;
}

async function loadDirectory(
  server: ViteDevServer,
  absoluteDirectory: string,
  relativeDirectory: string,
  moduleDirectory: string,
  byId: Map<string, MockOverride>,
): Promise<MockOverrideTreeNode[]> {
  const entries = (await readDirectoryEntries(absoluteDirectory))
    .filter((entry) => !isIgnoredOverrideName(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  const nodes: MockOverrideTreeNode[] = [];

  for (const entry of entries) {
    const relativePath =
      relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
    const absolutePath = path.join(absoluteDirectory, entry.name);

    if (entry.isDirectory()) {
      const children = await loadDirectory(server, absolutePath, relativePath, moduleDirectory, byId);

      if (children.length === 0) {
        continue;
      }

      nodes.push({
        kind: "group",
        id: relativePath,
        name: entry.name,
        children,
      });
      continue;
    }

    if (!entry.isFile() || !isOverrideModuleFileName(entry.name)) {
      continue;
    }

    const posixRelativePath = toPosixPath(relativePath);
    const moduleExports = await loadModuleExports(server, toViteModulePath(moduleDirectory, posixRelativePath));
    const override =
      moduleExports === undefined ? undefined : readExportedMockOverride(moduleExports);

    if (override === undefined) {
      console.error(`[mock-api] ${relativePath} does not export a mock override`);
      continue;
    }

    const id = posixRelativePath.replace(/\.ts$/, "");
    byId.set(id, override);
    nodes.push({
      kind: "override",
      id,
      name: override.name,
      description: override.description,
      params: serializeParamsSchema(override.params),
    });
  }

  return nodes;
}

export async function loadOverrideCatalog(
  server: ViteDevServer,
  projectRoot: string,
  directory = overridesDirectory,
): Promise<LoadedOverrideCatalog> {
  const byId = new Map<string, MockOverride>();
  const absoluteDirectory = path.resolve(projectRoot, directory);
  const relative = toPosixPath(path.relative(projectRoot, absoluteDirectory));
  const moduleDirectory = relative.startsWith("../") ? `/@fs/${toPosixPath(absoluteDirectory)}` : `/${relative}`;
  const tree = await loadDirectory(server, absoluteDirectory, "", moduleDirectory, byId);
  return { tree, byId };
}
