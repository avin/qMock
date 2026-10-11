import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@ui/Icon";
import { cn } from "@ui/cn";
import type { MockOverrideTreeNode } from "@catalog";
import { getCatalogDragId } from "../dnd";
import type { MockOverrideDragData } from "../dnd";
import styles from "./MockOverrideTree.module.scss";

interface Props {
  nodes: MockOverrideTreeNode[];
  activeIds: string[];
  expandedIds: ReadonlySet<string>;
  isSearchActive: boolean;
  onToggleGroup: (groupId: string) => void;
}

export function MockOverrideTree({
  nodes,
  activeIds,
  expandedIds,
  isSearchActive,
  onToggleGroup,
}: Props) {
  return (
    <ul className={styles.tree}>
      {nodes.map((node) =>
        node.kind === "group" ? (
          <li key={node.id}>
            <details
              className={styles.group}
              open={expandedIds.has(node.id)}
              onToggle={(event) => {
                if (isSearchActive) {
                  return;
                }

                const isOpen = event.currentTarget.open;
                if (isOpen !== expandedIds.has(node.id)) {
                  onToggleGroup(node.id);
                }
              }}
            >
              <summary className={styles.summary}>
                <span className={styles.chevron} aria-hidden="true">
                  <Icon name="chevron" size={12} />
                </span>
                {node.name}
              </summary>
              <MockOverrideTree
                nodes={node.children}
                activeIds={activeIds}
                expandedIds={expandedIds}
                isSearchActive={isSearchActive}
                onToggleGroup={onToggleGroup}
              />
            </details>
          </li>
        ) : (
          <MockOverrideTreeLeafItem
            key={node.id}
            node={node}
            isActive={activeIds.includes(node.id)}
          />
        ),
      )}
    </ul>
  );
}

interface LeafItemProps {
  node: Extract<MockOverrideTreeNode, { kind: "override" }>;
  isActive: boolean;
}

function MockOverrideTreeLeafItem({ node, isActive }: LeafItemProps) {
  const dragData: MockOverrideDragData = { source: "catalog", overrideId: node.id };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: getCatalogDragId(node.id),
    data: dragData,
  });

  return (
    <li ref={setNodeRef}>
      <div
        className={cn(styles.leaf, isActive && styles.isActive, isDragging && styles.isDragging)}
      >
        <button
          className={styles.dragLayer}
          type="button"
          aria-label={`Drag ${node.name}`}
          {...attributes}
          {...listeners}
        />
        <span className={styles.dragHandle} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.name}>{node.name}</span>
          {node.description && <span className={styles.description}>{node.description}</span>}
          {isActive && <span className={styles.activeMark}>in use</span>}
        </span>
      </div>
    </li>
  );
}
