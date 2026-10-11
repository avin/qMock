// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { MockOverrideActiveEntry, MockOverrideTreeNode } from "../src/overrideCatalog";

const tree: MockOverrideTreeNode[] = [
  {
    kind: "group",
    id: "payments",
    name: "Payments",
    children: [
      {
        kind: "override",
        id: "payments/decline",
        name: "Declined payment",
        description: "Reject a payment",
        params: [
          { key: "retryable", type: "boolean", default: false },
          { key: "message", type: "string", default: "Declined" },
          { key: "code", type: "string", default: "limit", options: ["limit", "fraud"] },
        ],
      },
    ],
  },
  {
    kind: "override",
    id: "slow",
    name: "Slow response",
    description: "Wait before responding",
    params: [],
  },
];
const active: MockOverrideActiveEntry[] = [
  {
    id: "payments/decline",
    isEnabled: true,
    params: { retryable: false, message: "Declined", code: "limit" },
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockServer(entries = active) {
  const writes: MockOverrideActiveEntry[][] = [];
  const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (options?.method === "PUT") {
      const data = JSON.parse(String(options.body)) as { active: MockOverrideActiveEntry[] };
      writes.push(data.active);
      return new Response(JSON.stringify(data));
    }
    return new Response(JSON.stringify({ tree, active: entries }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { writes, fetchMock };
}

describe("override management page", () => {
  it("shows the catalog, searches nested names and descriptions, and exposes empty results", async () => {
    mockServer([]);
    render(<App />);
    await screen.findByRole("heading", { name: "Mock overrides" });
    expect(screen.getByText("Drag an override here")).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: "Search" });
    fireEvent.change(search, { target: { value: "Reject a payment" } });
    expect(screen.getByRole("button", { name: "Drag Declined payment" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Drag Slow response" })).toBeNull();
    fireEvent.change(search, { target: { value: "unknown override" } });
    expect(screen.getByText("No matching overrides")).toBeTruthy();
  });

  it("persists enable switches and boolean, text, and option parameters", async () => {
    const user = userEvent.setup();
    const { writes } = mockServer();
    render(<App />);
    await user.click(await screen.findByRole("checkbox", { name: "Enable Declined payment" }));
    await waitFor(() => expect(writes.at(-1)?.[0]?.isEnabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "Settings for Declined payment" }));
    await user.click(await screen.findByRole("checkbox", { name: "retryable" }));
    await waitFor(() => expect(writes.at(-1)?.[0]?.params.retryable).toBe(true));
    fireEvent.change(screen.getByRole("textbox", { name: "message" }), {
      target: { value: "Try another card" },
    });
    await waitFor(() => expect(writes.at(-1)?.[0]?.params.message).toBe("Try another card"));
    await user.selectOptions(screen.getByRole("combobox", { name: "code" }), "fraud");
    await waitFor(() => expect(writes.at(-1)?.[0]?.params.code).toBe("fraud"));
  });

  it("retains unsaved edits after a failed write and retries the latest values", async () => {
    const user = userEvent.setup();
    const { writes, fetchMock } = mockServer();
    render(<App />);
    const toggle = await screen.findByRole("checkbox", { name: "Enable Declined payment" });
    fetchMock.mockImplementationOnce(async () => new Response("Unavailable", { status: 503 }));
    await user.click(toggle);
    await screen.findByRole("alert");
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(writes.at(-1)?.[0]?.isEnabled).toBe(false));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("serializes rapid changes so an older response cannot overwrite newer edits", async () => {
    const { fetchMock } = mockServer();
    render(<App />);
    const toggle = await screen.findByRole("checkbox", { name: "Enable Declined payment" });
    let completeFirst!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          completeFirst = resolve;
        }),
    );
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    completeFirst(new Response(JSON.stringify({ active: [{ ...active[0], isEnabled: false }] })));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(
        2,
      ),
    );
    await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true));
  });

  it("offers recovery when the initial catalog request fails", async () => {
    const user = userEvent.setup();
    const { fetchMock } = mockServer();
    fetchMock.mockRejectedValueOnce(new Error("Server offline"));
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("Server offline");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Mock overrides" });
  });
});
