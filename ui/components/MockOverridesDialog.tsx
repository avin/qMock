import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent, UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@ui/cn";
import {
  collectGroupIds,
  createActiveOverrideEntry,
  filterOverrideTreeByQuery,
  flattenOverrideLeaves,
  placeActiveOverride,
  removeActiveOverride,
  setActiveOverrideEnabled,
  updateActiveOverrideParams,
} from "@catalog";
import type { MockOverrideActiveEntry, MockOverrideTreeNode } from "@catalog";
import {
  activeListDropId,
  catalogDropId,
  createDropAnimation,
  getActiveDragId,
  getLandingRect,
  isActiveDragId,
  mockOverrideCollisionDetection,
  mockOverrideKeyboardCoordinates,
} from "./dnd";
import type { MockOverrideDragData } from "./dnd";
import { MockOverrideActiveList } from "./MockOverrideActiveList/MockOverrideActiveList";
import { MockOverrideTree } from "./MockOverrideTree/MockOverrideTree";
import styles from "./MockOverridesDialog.module.scss";

interface Props {
  tree: MockOverrideTreeNode[];
  active: MockOverrideActiveEntry[];
  onActiveChange: (active: MockOverrideActiveEntry[]) => void;
}

interface CatalogDropAreaProps {
  children: ReactNode;
  isDropTarget: boolean;
}

function CatalogDropArea({ children, isDropTarget }: CatalogDropAreaProps) {
  const { setNodeRef } = useDroppable({ id: catalogDropId });

  return (
    <section
      ref={setNodeRef}
      className={cn(styles.column, { [styles.isRemovalTarget]: isDropTarget })}
      aria-label="Override catalog"
    >
      <h3 className={styles.columnTitle}>Catalog</h3>
      <div className={styles.columnBody}>{children}</div>
      {isDropTarget && <div className={styles.removeHint}>Release to remove</div>}
    </section>
  );
}

export function MockOverridesDialog({ tree, active, onActiveChange }: Props) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [settingsOverrideId, setSettingsOverrideId] = useState<string | undefined>();
  const [dragData, setDragData] = useState<MockOverrideDragData | undefined>();
  const [overId, setOverId] = useState<UniqueIdentifier | undefined>();
  const [dragSlotSize, setDragSlotSize] = useState(48);
  const landingRectRef = useRef<{ left: number; top: number } | undefined>(undefined);
  const landInListRef = useRef(false);
  const activeListNodeRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: mockOverrideKeyboardCoordinates }),
  );
  const leaves = flattenOverrideLeaves(tree);
  const leafById = new Map(leaves.map((leaf) => [leaf.id, leaf]));
  const activeIds = useMemo(() => active.map((entry) => entry.id), [active]);
  const isSearchActive = query.trim() !== "";
  const visibleTree = filterOverrideTreeByQuery(tree, query);
  const openGroupIds = new Set(isSearchActive ? collectGroupIds(visibleTree) : expandedIds);
  const activeItems = active.flatMap((entry) => {
    const leaf = leafById.get(entry.id);
    return leaf === undefined ? [] : [{ ...entry, leaf }];
  });

  const toggleGroup = (groupId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const dropAt = (index: number, payload: MockOverrideDragData) => {
    const leaf = leafById.get(payload.overrideId);

    if (leaf === undefined) {
      return;
    }

    onActiveChange(
      placeActiveOverride(active, payload.overrideId, index, () => createActiveOverrideEntry(leaf)),
    );
  };

  const getDropIndex = (targetId: UniqueIdentifier | undefined) => {
    if (targetId === activeListDropId) {
      return activeItems.length;
    }

    return activeItems.findIndex((item) => getActiveDragId(item.id) === targetId);
  };

  const resetDragState = () => {
    setDragData(undefined);
    setOverId(undefined);
  };

  const dropAnimation = useMemo(() => createDropAnimation({ landingRectRef, landInListRef }), []);

  const handleDragStart = ({ active: dragged }: DragStartEvent) => {
    landInListRef.current = false;
    landingRectRef.current = undefined;
    setDragData(dragged.data.current as MockOverrideDragData | undefined);
    const height = dragged.rect.current.initial?.height;
    setDragSlotSize((height ?? 42) + 6);
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over?.id);
    if (over?.rect === null || over?.rect === undefined) {
      return;
    }

    landingRectRef.current = getLandingRect(over, activeListNodeRef.current);
  };

  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    const payload = dragged.data.current as MockOverrideDragData | undefined;
    const targetId = over?.id;
    const droppingOnList =
      payload?.source === "catalog" &&
      targetId !== undefined &&
      (targetId === activeListDropId || isActiveDragId(targetId));
    landInListRef.current = droppingOnList;
    if (droppingOnList && over?.rect) {
      landingRectRef.current = getLandingRect(over, activeListNodeRef.current);
    }
    resetDragState();

    if (payload === undefined || targetId === undefined) {
      return;
    }

    if (payload.source === "active" && targetId === catalogDropId) {
      if (settingsOverrideId === payload.overrideId) {
        setSettingsOverrideId(undefined);
      }

      onActiveChange(removeActiveOverride(active, payload.overrideId));
      return;
    }

    const index = getDropIndex(targetId);
    if (index === -1) {
      return;
    }

    if (payload.source === "active") {
      const fromIndex = active.findIndex((entry) => entry.id === payload.overrideId);
      if (fromIndex !== -1 && fromIndex !== index) {
        onActiveChange(arrayMove(active, fromIndex, index));
      }
      return;
    }

    dropAt(index, payload);
  };

  const isRemovalTarget = dragData?.source === "active" && overId === catalogDropId;
  const isActiveDropTarget = overId === activeListDropId || (overId && isActiveDragId(overId));
  const catalogDropIndex =
    dragData?.source === "catalog" && isActiveDropTarget
      ? Math.max(0, getDropIndex(overId))
      : undefined;
  const draggedLeaf = dragData === undefined ? undefined : leafById.get(dragData.overrideId);
  const draggedActiveEntry =
    dragData === undefined ? undefined : active.find((entry) => entry.id === dragData.overrideId);
  const isOverlayEnabled = draggedActiveEntry?.isEnabled ?? true;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mock overrides</h1>
      </div>
      <div className={styles.search}>
        <label htmlFor={searchId}>Search</label>
        <input
          ref={searchRef}
          id={searchId}
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={mockOverrideCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          landInListRef.current = false;
          resetDragState();
        }}
      >
        <div className={styles.columns}>
          <CatalogDropArea isDropTarget={isRemovalTarget}>
            {visibleTree.length === 0 ? (
              <p className={styles.empty}>No matching overrides</p>
            ) : (
              <MockOverrideTree
                nodes={visibleTree}
                activeIds={activeIds}
                expandedIds={openGroupIds}
                isSearchActive={isSearchActive}
                onToggleGroup={toggleGroup}
              />
            )}
          </CatalogDropArea>
          <section className={styles.column} aria-label="Active overrides">
            <h3 className={styles.columnTitle}>Active</h3>
            <div className={styles.columnBody}>
              <MockOverrideActiveList
                ref={activeListNodeRef}
                items={activeItems}
                settingsOverrideId={settingsOverrideId}
                catalogDropIndex={catalogDropIndex}
                insertSlotSize={dragSlotSize}
                onSettingsOpenChange={setSettingsOverrideId}
                onParamsChange={(overrideId, params) =>
                  onActiveChange(updateActiveOverrideParams(active, overrideId, params))
                }
                onEnabledChange={(overrideId, isEnabled) =>
                  onActiveChange(setActiveOverrideEnabled(active, overrideId, isEnabled))
                }
              />
            </div>
          </section>
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {draggedLeaf !== undefined && dragData !== undefined && (
            <div
              className={cn(styles.dragOverlay, {
                [styles.isDisabled]: !isOverlayEnabled,
              })}
            >
              <span className={styles.dragOverlayHandle} aria-hidden="true" />
              <input
                className={styles.dragOverlayToggle}
                type="checkbox"
                checked={isOverlayEnabled}
                onChange={() => {}}
                tabIndex={-1}
                aria-hidden="true"
              />
              <span className={styles.dragOverlayText}>
                <span className={styles.dragOverlayName}>{draggedLeaf.name}</span>
                {draggedLeaf.description && (
                  <span className={styles.dragOverlayDescription}>{draggedLeaf.description}</span>
                )}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
