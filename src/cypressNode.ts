/// <reference types="cypress" />
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { isIgnoredOverrideName, isOverrideModuleFileName } from "./overrideCatalog.js";

export interface CypressNodeOptions {
  root?: string;
  /** Handler configuration path relative to project root, or absolute. */
  configuration?: string;
  /** Override catalog directory relative to project root, or absolute. */
  overrides?: string;
  alias?: Record<string, string>;
}

async function collectOverrides(directory: string, relative = ""): Promise<Array<{ id: string; file: string }>> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
  const result: Array<{ id: string; file: string }> = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isIgnoredOverrideName(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const id = relative + entry.name;
    if (entry.isDirectory()) result.push(...await collectOverrides(file, `${id}/`));
    else if (entry.isFile() && isOverrideModuleFileName(entry.name)) result.push({ id: id.slice(0, -3), file });
  }
  return result;
}

/** Register once in Cypress setupNodeEvents; no mock server is started. */
export function registerMocks(
  on: Cypress.PluginEvents,
  config: Pick<Cypress.PluginConfigOptions, "projectRoot">,
  options: CypressNodeOptions = {},
): void {
  const root = path.resolve(options.root ?? config.projectRoot);
  const configuration = path.resolve(root, options.configuration ?? "src/mocks/handlers.ts");
  const directory = path.resolve(root, options.overrides ?? "src/mocks/overrides");
  const alias = Object.fromEntries(Object.entries(options.alias ?? {}).map(([name, target]) => [name, path.resolve(root, target)]));
  on("task", {
    async "qmock:load"() {
      try { await access(configuration); }
      catch (cause) { throw new Error(`Mock configuration not found: ${configuration}. Create the file or configure its path in registerMocks.`, { cause }); }
      const modules = await collectOverrides(directory);
      let browserEntry = fileURLToPath(new URL("./browser.js", import.meta.url));
      try { await access(browserEntry); }
      catch { browserEntry = browserEntry.slice(0, -3) + ".ts"; }
      const imports = modules.map(({ file }, index) => `import * as scenario${index} from ${JSON.stringify(file)};`).join("\n");
      const entries = modules.map(({ id }, index) => `[${JSON.stringify(id)}, readExportedMockOverride(scenario${index})]`).join(",\n");
      const contents = `
        import configuration from ${JSON.stringify(configuration)};
        import { readExportedMockOverride } from ${JSON.stringify(browserEntry)};
        ${imports}
        const overrides = Object.fromEntries([${entries}].filter(([, value]) => value !== undefined));
        export { configuration, overrides };
      `;
      const result = await build({
        stdin: { contents, resolveDir: root, sourcefile: "qmock-cypress-entry.ts", loader: "ts" },
        absWorkingDir: root, bundle: true, write: false, platform: "browser",
        format: "iife", globalName: "qmockDefinitions", target: "es2022", alias,
        logLevel: "silent",
        plugins: [{
          name: "qmock-browser-helpers",
          setup(builder) {
            builder.onResolve({ filter: /^@avinlab\/qmock$/ }, () => ({ path: browserEntry }));
          },
        }],
      });
      return { code: result.outputFiles[0]!.text };
    },
  });
}
