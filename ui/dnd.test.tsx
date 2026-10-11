// @vitest-environment jsdom
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { describe, expect, it, vi } from "vitest";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { activeListDropId, catalogDropId, mockOverrideKeyboardCoordinates } from "./components/dnd";

vi.mock("@dnd-kit/sortable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dnd-kit/sortable")>()),
  sortableKeyboardCoordinates: vi.fn(() => ({ x: 7, y: 9 })),
}));

function keyboardContext(source: "catalog" | "active", stacked: boolean, overId?: string) {
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const catalog = rect(0, 0, 300, 300);
  const list = stacked ? rect(0, 320, 300, 300) : rect(320, 0, 300, 300);
  const collisionRect =
    source === "catalog" ? rect(10, 50, 200, 42) : rect(list.left + 10, list.top, 200, 42);
  return {
    active: source === "catalog" ? "catalog:first" : "active:first",
    currentCoordinates: { x: collisionRect.left, y: collisionRect.top },
    context: {
      active: {
        id: source === "catalog" ? "catalog:first" : "active:first",
        data: { current: { source } },
      },
      collisionRect,
      droppableRects: new Map([
        [catalogDropId, catalog],
        [activeListDropId, list],
      ]),
      droppableContainers: { getEnabled: () => [{ id: "active:first" }, { id: "active:second" }] },
      over: overId ? { id: overId } : null,
    },
  } as unknown as Parameters<KeyboardCoordinateGetter>[1];
}

describe("keyboard override navigation", () => {
  it.each([
    [false, "ArrowRight"],
    [true, "ArrowDown"],
  ] as const)(
    "moves catalog entries into the active column in one keypress (stacked=%s)",
    (stacked, key) => {
      const next = mockOverrideKeyboardCoordinates(
        new KeyboardEvent("keydown", { code: key }),
        keyboardContext("catalog", stacked),
      );
      expect(next).toEqual({ x: stacked ? 50 : 370, y: stacked ? 320 : 0 });
    },
  );

  it.each([
    [false, "ArrowLeft"],
    [true, "ArrowUp"],
  ] as const)(
    "moves active entries to the catalog for keyboard removal (stacked=%s)",
    (stacked, key) => {
      const next = mockOverrideKeyboardCoordinates(
        new KeyboardEvent("keydown", { code: key }),
        keyboardContext("active", stacked, "active:first"),
      );
      expect(next).toEqual({ x: 50, y: 0 });
    },
  );

  it("keeps arrow navigation between active items for reordering", () => {
    const next = mockOverrideKeyboardCoordinates(
      new KeyboardEvent("keydown", { code: "ArrowUp" }),
      keyboardContext("active", true, "active:second"),
    );
    expect(next).toEqual({ x: 7, y: 9 });
    expect(sortableKeyboardCoordinates).toHaveBeenCalled();
  });
});
