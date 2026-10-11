import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  overrideStateFileName,
  parseOverrideStateFile,
  serializeOverrideStateFile,
} from "./overrideCatalog.js";
import type { MockOverrideActiveEntry } from "./overrideCatalog.js";

export function overrideStateFilePath(projectRoot: string, stateFile = overrideStateFileName) {
  return path.resolve(projectRoot, stateFile);
}

export function readOverrideStateFile(projectRoot: string, stateFile = overrideStateFileName): MockOverrideActiveEntry[] {
  try {
    const raw = JSON.parse(readFileSync(overrideStateFilePath(projectRoot, stateFile), "utf8")) as unknown;
    return parseOverrideStateFile(raw);
  } catch {
    return [];
  }
}

export function writeOverrideStateFile(projectRoot: string, active: MockOverrideActiveEntry[], stateFile = overrideStateFileName) {
  mkdirSync(path.dirname(overrideStateFilePath(projectRoot, stateFile)), { recursive: true });
  writeFileSync(overrideStateFilePath(projectRoot, stateFile), serializeOverrideStateFile(active), "utf8");
}
