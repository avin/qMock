import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import type { PointerEvent, Ref } from "react";
import { cn } from "@ui/cn";
import type { MockOverrideActiveEntry, MockOverrideTreeLeaf } from "@catalog";
import { activeListDropId, getActiveDragId } from "../dnd";
import type { MockOverrideDragData } from "../dnd";
import { MockOverrideParams } from "../MockOverrideParams/MockOverrideParams";
import styles from "./MockOverrideActiveList.module.scss";

interface Props {
  items: Array<MockOverrideActiveEntry & { leaf: MockOverrideTreeLeaf }>;
  settingsOverrideId: string | undefined;
  catalogDropIndex: number | undefined;
  insertSlotSize: number;
  ref?: Ref<HTMLDivElement>;
  onSettingsOpenChange: (overrideId: string | undefined) => void;
  onParamsChange: (overrideId: string, params: Record<string, boolean | string>) => void;
  onEnabledChange: (overrideId: string, isEnabled: boolean) => void;
}

export function MockOverrideActiveList({
  items,
  settingsOverrideId,
  catalogDropIndex,
  insertSlotSize,
  ref,
  onSettingsOpenChange,
  onParamsChange,
  onEnabledChange,
}: Props) {
  const { setNodeRef } = useDroppable({ id: activeListDropId });
  const isInsertingAtEnd = catalogDropIndex === items.length && items.length > 0;
  const sortableItems = useMemo(() => items.map((item) => getActiveDragId(item.id)), [items]);
  const orderedStyle = useMemo(
    () => (isInsertingAtEnd ? { paddingBottom: insertSlotSize } : undefined),
    [insertSlotSize, isInsertingAtEnd],
  );
  const setListRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (typeof ref === "function") {
      ref(node);
    } else if (ref != null) {
      ref.current = node;
    }
  };

  return (
    <div ref={setListRef} className={styles.list}>
      {items.length === 0 ? (
        <p className={styles.empty}>Drag an override here</p>
      ) : (
        <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
          <ol className={styles.ordered} style={orderedStyle}>
            {items.map((item, index) => (
              <MockOverrideActiveItem
                key={item.id}
                item={item}
                insertShiftY={
                  catalogDropIndex !== undefined && index >= catalogDropIndex ? insertSlotSize : 0
                }
                isSettingsOpen={settingsOverrideId === item.id}
                onSettingsOpenChange={onSettingsOpenChange}
                onParamsChange={onParamsChange}
                onEnabledChange={onEnabledChange}
              />
            ))}
          </ol>
        </SortableContext>
      )}
    </div>
  );
}

interface ActiveItemProps {
  item: MockOverrideActiveEntry & { leaf: MockOverrideTreeLeaf };
  insertShiftY: number;
  isSettingsOpen: boolean;
  onSettingsOpenChange: (overrideId: string | undefined) => void;
  onParamsChange: (overrideId: string, params: Record<string, boolean | string>) => void;
  onEnabledChange: (overrideId: string, isEnabled: boolean) => void;
}

function stopInteractivePointer(event: PointerEvent) {
  event.stopPropagation();
}

function MockOverrideActiveItem({
  item,
  insertShiftY,
  isSettingsOpen,
  onSettingsOpenChange,
  onParamsChange,
  onEnabledChange,
}: ActiveItemProps) {
  const dragData: MockOverrideDragData = { source: "active", overrideId: item.id };
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: getActiveDragId(item.id),
    data: dragData,
    animateLayoutChanges: () => false,
    transition: null,
  });
  const itemStyle = useMemo(() => {
    const nextTransform = {
      x: transform?.x ?? 0,
      y: (transform?.y ?? 0) + insertShiftY,
      scaleX: transform?.scaleX ?? 1,
      scaleY: transform?.scaleY ?? 1,
    };

    return {
      transform:
        transform != null || insertShiftY !== 0 ? CSS.Transform.toString(nextTransform) : undefined,
    };
  }, [insertShiftY, transform]);

  return (
    <li ref={setNodeRef} style={itemStyle} className={cn(isDragging && styles.isDragging)}>
      <div className={cn(styles.item, !item.isEnabled && styles.isDisabled)}>
        <button
          className={styles.dragLayer}
          type="button"
          aria-label={`Move ${item.leaf.name}`}
          {...attributes}
          {...listeners}
        />
        <span className={styles.dragHandle} aria-hidden="true" />
        <input
          className={styles.toggle}
          type="checkbox"
          checked={item.isEnabled}
          aria-label={`Enable ${item.leaf.name}`}
          onPointerDown={stopInteractivePointer}
          onChange={(event) => onEnabledChange(item.id, event.target.checked)}
        />
        <span className={styles.text}>
          <span className={styles.name}>{item.leaf.name}</span>
          {item.leaf.description && (
            <span className={styles.description}>{item.leaf.description}</span>
          )}
        </span>
        <span className={styles.actions} onPointerDown={stopInteractivePointer}>
          <MockOverrideParams
            overrideName={item.leaf.name}
            params={item.leaf.params}
            values={item.params}
            isOpen={isSettingsOpen}
            onOpenChange={(isOpen) => onSettingsOpenChange(isOpen ? item.id : undefined)}
            onChange={(params) => onParamsChange(item.id, params)}
          />
        </span>
      </div>
    </li>
  );
}
