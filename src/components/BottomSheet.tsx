import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export type SnapPosition = "peek" | "half" | "full";

export interface BottomSheetProps {
  snapState: SnapPosition;
  onSnapChange: (snap: SnapPosition) => void;
  totalFormatted: string;
  subtitleSummary?: string;
  onOpenSummary?: () => void;
  onAddToCart: () => void;
  isCartDisabled?: boolean;
  cartDisabledTooltip?: string;
  cartStatus?: "idle" | "loading" | "success" | "error";
  children: ReactNode;
}

export function BottomSheet({
  snapState,
  onSnapChange,
  totalFormatted,
  subtitleSummary,
  onOpenSummary,
  onAddToCart,
  isCartDisabled = false,
  cartDisabledTooltip,
  cartStatus = "idle",
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [headerHeight, setHeaderHeight] = useState(116);
  const [windowHeight, setWindowHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 667
  );

  const rafId = useRef<number | null>(null);

  const dragRef = useRef({
    isDragging: false,
    startY: 0,
    startTime: 0,
    startTranslateY: 0,
    currentY: 0,
  });

  // Keep window and header measurements updated without redundant renders
  useEffect(() => {
    const measure = () => {
      if (typeof window !== "undefined") {
        setWindowHeight((prev) => (prev !== window.innerHeight ? window.innerHeight : prev));
      }
      if (headerRef.current) {
        const h = headerRef.current.offsetHeight || 116;
        setHeaderHeight((prev) => (prev !== h ? h : prev));
        document.documentElement.style.setProperty("--sheet-peek-height", `${h}px`);
      }
    };

    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("orientationchange", measure, { passive: true });

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  // Calculate snap heights
  const fullHeight = Math.max(windowHeight - 68, 300);
  const halfHeight = Math.round(windowHeight * 0.5);
  const peekHeight = Math.max(headerHeight, 100);

  const getTranslateYForSnap = useCallback(
    (snap: SnapPosition): number => {
      switch (snap) {
        case "full":
          return 0;
        case "half":
          return Math.max(0, fullHeight - halfHeight);
        case "peek":
        default:
          return Math.max(0, fullHeight - peekHeight);
      }
    },
    [fullHeight, halfHeight, peekHeight]
  );

  // Sync sheet transform with snapState
  useEffect(() => {
    if (!dragRef.current.isDragging && sheetRef.current) {
      const targetY = getTranslateYForSnap(snapState);
      dragRef.current.currentY = targetY;
      sheetRef.current.style.transition = "transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)";
      sheetRef.current.style.transform = `translate3d(0, ${targetY}px, 0)`;
      sheetRef.current.style.setProperty("--sheet-translate-y", `${targetY}px`);
    }
  }, [snapState, getTranslateYForSnap]);

  // Drag Handlers (touch & pointer via GPU transform)
  const startDrag = (clientY: number) => {
    const currentY = dragRef.current.currentY;
    dragRef.current = {
      isDragging: true,
      startY: clientY,
      startTime: Date.now(),
      startTranslateY: currentY,
      currentY: currentY,
    };

    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  };

  const moveDrag = (clientY: number) => {
    if (!dragRef.current.isDragging) return;

    // deltaY: dragging down is positive (moves sheet down)
    const deltaY = clientY - dragRef.current.startY;
    let nextY = dragRef.current.startTranslateY + deltaY;

    const minTranslateY = 0;
    const maxTranslateY = Math.max(0, fullHeight - peekHeight);

    // Elastic resistance
    if (nextY < minTranslateY) {
      nextY = minTranslateY + (nextY - minTranslateY) * 0.25;
    } else if (nextY > maxTranslateY) {
      nextY = maxTranslateY + (nextY - maxTranslateY) * 0.25;
    }

    dragRef.current.currentY = nextY;

    // V-Sync locked GPU transform via requestAnimationFrame
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transform = `translate3d(0, ${dragRef.current.currentY}px, 0)`;
          sheetRef.current.style.setProperty("--sheet-translate-y", `${dragRef.current.currentY}px`);
        }
        rafId.current = null;
      });
    }
  };

  const endDrag = (clientY: number) => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;

    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    const deltaY = clientY - dragRef.current.startY;
    const duration = Math.max(1, Date.now() - dragRef.current.startTime);
    const velocity = deltaY / duration; // px per ms (+ is down, - is up)
    const currentY = dragRef.current.currentY;

    const snapYFull = 0;
    const snapYHalf = Math.max(0, fullHeight - halfHeight);
    const snapYPeek = Math.max(0, fullHeight - peekHeight);

    let targetSnap: SnapPosition = snapState;

    // Tap detection on header
    if (Math.abs(deltaY) < 6) {
      if (snapState === "peek") {
        targetSnap = "half";
      } else if (snapState === "half") {
        targetSnap = "full";
      } else {
        targetSnap = "half";
      }
    } else if (velocity < -0.3) {
      // Strong upward flick (decreases translateY, expands sheet)
      if (snapState === "peek") {
        targetSnap = velocity < -0.7 ? "full" : "half";
      } else {
        targetSnap = "full";
      }
    } else if (velocity > 0.3) {
      // Strong downward flick (increases translateY, collapses sheet)
      if (snapState === "full") {
        targetSnap = velocity > 0.7 ? "peek" : "half";
      } else {
        targetSnap = "peek";
      }
    } else {
      // Position-based closest snap point
      const distFull = Math.abs(currentY - snapYFull);
      const distHalf = Math.abs(currentY - snapYHalf);
      const distPeek = Math.abs(currentY - snapYPeek);

      if (distFull <= distHalf && distFull <= distPeek) {
        targetSnap = "full";
      } else if (distHalf <= distFull && distHalf <= distPeek) {
        targetSnap = "half";
      } else {
        targetSnap = "peek";
      }
    }

    const finalY = getTranslateYForSnap(targetSnap);
    dragRef.current.currentY = finalY;

    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)";
      sheetRef.current.style.transform = `translate3d(0, ${finalY}px, 0)`;
      sheetRef.current.style.setProperty("--sheet-translate-y", `${finalY}px`);
    }

    onSnapChange(targetSnap);
  };

  // Header Touch Listeners
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(".sheet-add-cart-btn") ||
      target.closest(".sheet-snap-pill") ||
      target.closest(".sheet-header-left")
    ) {
      return;
    }
    startDrag(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    moveDrag(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    endDrag(e.changedTouches[0].clientY);
  };

  // Header Pointer Listeners (Mouse / Devtools emulation)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(".sheet-add-cart-btn") ||
      target.closest(".sheet-snap-pill") ||
      target.closest(".sheet-header-left")
    ) {
      return;
    }

    startDrag(e.clientY);

    const onPointerMove = (ev: PointerEvent) => {
      moveDrag(ev.clientY);
    };

    const onPointerUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      endDrag(ev.clientY);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <aside
      aria-label="Configuration Sheet"
      className={`mobile-bottom-sheet ${snapState}`}
      ref={sheetRef}
      style={{
        height: `${fullHeight}px`,
        transform: `translate3d(0, ${getTranslateYForSnap(snapState)}px, 0)`,
      }}
    >
      {/* Draggable Header */}
      <div
        className="bottom-sheet-header"
        onPointerDown={handlePointerDown}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        ref={headerRef}
      >
        <div className="sheet-handle-bar-wrapper">
          <div className="sheet-handle-bar" title="Drag up or down to resize" />
          <div className="sheet-snap-selector" role="tablist" aria-label="Sheet snap height">
            <button
              type="button"
              className={`sheet-snap-pill ${snapState === "peek" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSnapChange("peek");
              }}
              title="Peek mode (3D view)"
            >
              Peek
            </button>
            <button
              type="button"
              className={`sheet-snap-pill ${snapState === "half" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSnapChange("half");
              }}
              title="Half mode (Split view)"
            >
              Half
            </button>
            <button
              type="button"
              className={`sheet-snap-pill ${snapState === "full" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSnapChange("full");
              }}
              title="Full mode (Expanded options)"
            >
              Full
            </button>
          </div>
        </div>

        <div className="sheet-header-content">
          <div
            className="sheet-header-left"
            onClick={() => {
              if (onOpenSummary) onOpenSummary();
            }}
            role="button"
            tabIndex={0}
            title="Click to view Build Summary"
          >
            <span className="sheet-total-label">TOTAL</span>
            <strong className="sheet-total-price">{totalFormatted}</strong>
            {subtitleSummary ? (
              <span className="sheet-subtitle-summary">{subtitleSummary}</span>
            ) : (
              <button
                className="sheet-summary-link"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenSummary) onOpenSummary();
                }}
                type="button"
              >
                Build Summary
              </button>
            )}
          </div>

          <div className="sheet-header-right">
            <Tooltip label={isCartDisabled ? cartDisabledTooltip : undefined} triggerOnClick>
              <button
                aria-disabled={isCartDisabled || cartStatus === "loading"}
                className={`sheet-add-cart-btn ${isCartDisabled ? "disabled" : ""} ${
                  cartStatus === "success" ? "success" : ""
                }`}
                disabled={isCartDisabled || cartStatus === "loading"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isCartDisabled && cartStatus !== "loading") {
                    onAddToCart();
                  }
                }}
                type="button"
              >
                {cartStatus === "loading" && "Adding..."}
                {cartStatus === "success" && "Added to cart ✓"}
                {cartStatus === "idle" && "Add to Cart"}
                {cartStatus === "error" && "Try again"}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Scrollable Configuration Controls */}
      <div className="bottom-sheet-body" ref={contentRef}>
        {children}
      </div>
    </aside>
  );
}
