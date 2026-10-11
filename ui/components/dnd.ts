import {
  closestCenter,
  defaultDropAnimationSideEffects,
  defaultKeyboardCoordinateGetter,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DropAnimation,
  KeyboardCoordinateGetter,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RefObject } from "react";

export const catalogDropId = "mock-override-catalog";
export const activeListDropId = "mock-override-active-list";

export function getCatalogDragId(overrideId: string) {
  return `catalog:${overrideId}`;
}

export function getActiveDragId(overrideId: string) {
  return `active:${overrideId}`;
}

export function isActiveDragId(id: string | number) {
  return String(id).startsWith("active:");
}

export interface MockOverrideDragData {
  source: "catalog" | "active";
  overrideId: string;
}

export const mockOverrideKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, collisionRect, droppableRects, droppableContainers, over } = args.context;
  const dragData = active?.data.current as MockOverrideDragData | undefined;
  const catalog = droppableRects.get(catalogDropId);
  const list = droppableRects.get(activeListDropId);
  if (catalog && list && collisionRect) {
    const isStacked = list.top >= catalog.bottom;
    const towardList = event.code === (isStacked ? "ArrowDown" : "ArrowRight");
    const towardCatalog = event.code === (isStacked ? "ArrowUp" : "ArrowLeft");
    const firstActive = droppableContainers
      .getEnabled()
      .find((container) => isActiveDragId(container.id));
    const isAtStart = (over?.id ?? active?.id) === firstActive?.id;
    const target =
      towardList && (dragData?.source === "catalog" || over?.id === catalogDropId)
        ? list
        : towardCatalog && dragData?.source === "active" && (!isStacked || isAtStart)
          ? catalog
          : undefined;
    if (target) {
      event.preventDefault();
      // Move the dragged rectangle into the other column in one keypress, regardless of viewport size.
      return {
        x:
          args.currentCoordinates.x +
          target.left +
          target.width / 2 -
          collisionRect.left -
          collisionRect.width / 2,
        y:
          args.currentCoordinates.y +
          target.top +
          Math.min(target.height / 2, collisionRect.height / 2) -
          collisionRect.top -
          collisionRect.height / 2,
      };
    }
  }

  return dragData?.source === "active"
    ? sortableKeyboardCoordinates(event, args)
    : defaultKeyboardCoordinateGetter(event, args);
};

export const mockOverrideCollisionDetection: CollisionDetection = (args) => {
  const payload = args.active.data.current as MockOverrideDragData | undefined;
  const pointerCollisions = pointerWithin(args);
  const keyboardCollisions = args.pointerCoordinates === null ? rectIntersection(args) : [];

  if (payload?.source === "active") {
    const catalogCollision = [...pointerCollisions, ...keyboardCollisions].find(
      ({ id }) => id === catalogDropId,
    );
    if (catalogCollision !== undefined) {
      return [catalogCollision];
    }
  }

  const sortableContainers = args.droppableContainers.filter((container) =>
    isActiveDragId(container.id),
  );

  if (sortableContainers.length > 0) {
    let lastBottom = Number.NEGATIVE_INFINITY;
    for (const container of sortableContainers) {
      const rect = args.droppableRects.get(container.id);
      if (rect !== undefined && rect.bottom > lastBottom) {
        lastBottom = rect.bottom;
      }
    }
    const pointerY = args.pointerCoordinates?.y;

    if (pointerY !== undefined && pointerY > lastBottom) {
      return [{ id: activeListDropId }];
    }

    const closestItems = closestCenter({
      ...args,
      droppableContainers: sortableContainers,
    });
    if (closestItems.length > 0) {
      return closestItems;
    }
  }

  const listCollision = pointerCollisions.find(({ id }) => id === activeListDropId);
  if (listCollision !== undefined) {
    return [listCollision];
  }

  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

const activeListGap = 6;

export function getLandingRect(
  over: { id: UniqueIdentifier; rect: { left: number; top: number } },
  listNode: HTMLElement | null,
) {
  if (over.id !== activeListDropId) {
    return { left: over.rect.left, top: over.rect.top };
  }

  const lastItem = listNode?.querySelector("ol > li:last-child");
  if (lastItem instanceof HTMLElement) {
    const rect = lastItem.getBoundingClientRect();
    return { left: rect.left, top: rect.bottom + activeListGap };
  }

  return { left: over.rect.left, top: over.rect.top };
}

const defaultActiveDropAnimation = defaultDropAnimationSideEffects({
  styles: { active: { opacity: "0" } },
});

interface DropAnimationState {
  landingRectRef: RefObject<{ left: number; top: number } | undefined>;
  landInListRef: RefObject<boolean>;
}

export function createDropAnimation({
  landingRectRef,
  landInListRef,
}: DropAnimationState): DropAnimation {
  return {
    duration: 180,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    keyframes: ({ transform, dragOverlay }) => {
      const landing = landingRectRef.current;
      if (landInListRef.current && landing !== undefined) {
        return [
          { transform: CSS.Transform.toString(transform.initial) },
          {
            transform: CSS.Transform.toString({
              x: transform.initial.x + landing.left - dragOverlay.rect.left,
              y: transform.initial.y + landing.top - dragOverlay.rect.top,
              scaleX: transform.initial.scaleX,
              scaleY: transform.initial.scaleY,
            }),
          },
        ];
      }

      return [
        { transform: CSS.Transform.toString(transform.initial) },
        { transform: CSS.Transform.toString(transform.final) },
      ];
    },
    sideEffects: (params) => {
      if (landInListRef.current) {
        return;
      }

      return defaultActiveDropAnimation(params);
    },
  };
}
