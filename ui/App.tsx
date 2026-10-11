import { useEffect, useRef, useState } from "react";
import type { MockOverrideActiveEntry, MockOverrideTreeNode } from "../src/overrideCatalog";
import { MockOverridesDialog } from "./components/MockOverridesDialog";

interface CatalogState {
  tree: MockOverrideTreeNode[];
  active: MockOverrideActiveEntry[];
}

const endpoint = "/__apiMocks/overrides";

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`The mock server returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function App() {
  const [catalog, setCatalog] = useState<CatalogState>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const pending = useRef<MockOverrideActiveEntry[] | undefined>(undefined);
  const writing = useRef(false);
  const revision = useRef(0);
  const refreshing = useRef(false);

  async function refresh() {
    if (refreshing.current || writing.current || pending.current !== undefined) return;
    refreshing.current = true;
    const currentRevision = revision.current;
    try {
      const data = await readResponse<CatalogState>(await fetch(endpoint, { cache: "no-store" }));
      if (mounted.current && revision.current === currentRevision) {
        setCatalog(data);
        setError(undefined);
      }
    } catch (cause) {
      if (mounted.current && revision.current === currentRevision) {
        setError(cause instanceof Error ? cause.message : "Unable to connect to the mock server.");
      }
    } finally {
      refreshing.current = false;
    }
  }

  async function flush() {
    if (writing.current || pending.current === undefined) return;
    writing.current = true;
    setSaving(true);
    setError(undefined);
    try {
      while (pending.current !== undefined) {
        const active = pending.current;
        pending.current = undefined;
        try {
          const data = await readResponse<{ active: MockOverrideActiveEntry[] }>(
            await fetch(endpoint, {
              method: "PUT",
              keepalive: true,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active }),
            }),
          );
          if (mounted.current && pending.current === undefined) {
            setCatalog((current) => (current ? { ...current, active: data.active } : current));
          }
        } catch (cause) {
          // Retain the latest edits so Retry never replaces them with older server state.
          if (pending.current === undefined) pending.current = active;
          throw cause;
        }
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "Unable to save overrides.");
      }
    } finally {
      writing.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, []);

  function updateActive(active: MockOverrideActiveEntry[]) {
    revision.current += 1;
    pending.current = active;
    setCatalog((current) => (current ? { ...current, active } : current));
    void flush();
  }

  const retry = () => void (pending.current === undefined ? refresh() : flush());

  if (!catalog) {
    return (
      <div className="loading-screen" role={error ? "alert" : "status"}>
        {error ?? "Loading mock overrides…"}
        {error && (
          <button className="retry-button" onClick={retry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <MockOverridesDialog
        tree={catalog.tree}
        active={catalog.active}
        onActiveChange={updateActive}
      />
      <div
        className="connection-status"
        role={error ? "alert" : "status"}
        data-error={error || undefined}
      >
        {error ? `Changes may be unsaved. ${error}` : saving ? "Saving…" : ""}
        {error && (
          <button className="retry-button" onClick={retry}>
            Retry
          </button>
        )}
      </div>
    </>
  );
}
