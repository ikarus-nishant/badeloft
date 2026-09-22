import { Bath, Box, Palette, Redo2, RefreshCw, Ruler, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { Dimension3DPreview } from "./components/Dimension3DPreview";
import { bowlOptions } from "./data/bowlOptions";
import type { BowlOption, BowlQuantity, MountingType, SinkConfiguration, SinkDimensions } from "./types/configurator";
import { mergedDimensions, toFractionalInches } from "./utils/calculations";
import { Card } from "./components/Card";
import { Tooltip } from "./components/Tooltip";
import { BottomSheet, type SnapPosition } from "./components/BottomSheet";
import { NumberedStep } from "./components/NumberedStep";
import { assetUrl, formatCurrency, handoffAddToCart, storefrontConfig, type SinkCartPayload } from "./integrations/storefront";

const selectedStartBowl = bowlOptions.find((bowl) => bowl.id === "UB-04-M") ?? bowlOptions[0];
const defaultInitialWidth = 30 * 25.4; // 30 inches (762 mm)
const defaultInitialOffset = Math.round((defaultInitialWidth - selectedStartBowl.size.length) / 2); // 131 mm

const initialConfig: SinkConfiguration = {
  bowl: selectedStartBowl,
  bowlQuantity: "single",
  mountingType: "wall_mounted",
  sinkType: "CUSTOM_SINGLE",
  dimensions: {
    L2: defaultInitialOffset,
    L3: defaultInitialOffset,
    D2: 100,
    D3: 50,
    H: selectedStartBowl.size.height,
    bowlSpacing: 100, // Minimum spacing
  },
};

const quantityOptions: Array<{ label: string; quantity: BowlQuantity; price: string }> = [
  { label: "1", quantity: "single", price: "+$140" },
  { label: "2", quantity: "double", price: "+$280" },
  { label: "3", quantity: "triple", price: "+$420" },
];

type BowlFinish = "glossy" | "matte";
type BowlColor = "white" | "black" | "gray";
type DrainFinish = "chrome" | "black" | "brushed-nickel" | "glossy-white" | "matte-white";

interface HistorySnapshot {
  bowlColor?: BowlColor;
  bowlFinish: BowlFinish;
  config: SinkConfiguration;
  drainFinish?: DrainFinish;
}

interface ConfiguratorHistory {
  future: HistorySnapshot[];
  past: HistorySnapshot[];
  present: HistorySnapshot;
}

const bowlColorOptions: Array<{ color: string; id: BowlColor; label: string }> = [
  { color: "#f7f7f5", id: "white", label: "White" },
  { color: "#454545", id: "black", label: "Black" },
  { color: "#a4a4a4", id: "gray", label: "Gray" },
];

const drainFinishOptions: Array<{ id: DrainFinish; label: string; price: number }> = [
  { id: "chrome", label: "Chrome", price: 0 },
  { id: "black", label: "Black", price: 29 },
  { id: "brushed-nickel", label: "Brushed Nickel", price: 29 },
  { id: "glossy-white", label: "Glossy White", price: 29 },
  { id: "matte-white", label: "Matte White", price: 29 },
];

const countByQuantity: Record<BowlQuantity, number> = {
  single: 1,
  double: 2,
  triple: 3,
};

function quantityToSinkType(quantity: BowlQuantity) {
  if (quantity === "single") return "CUSTOM_SINGLE";
  if (quantity === "double") return "CUSTOM_DOUBLE";
  return "CUSTOM_TRIPLE";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toInches(value: number) {
  return Number((value / 25.4).toFixed(4));
}

function distributeOffsetDelta(targetOverall: number, fixedSize: number, firstOffset: number, secondOffset: number, minFirst = 0, minSecond = 0): [number, number] {
  const availableOffset = Math.max(minFirst + minSecond, targetOverall - fixedSize);
  const equalDelta = (availableOffset - firstOffset - secondOffset) / 2;
  let nextFirst = firstOffset + equalDelta;
  let nextSecond = secondOffset + equalDelta;

  if (nextFirst < minFirst) {
    nextSecond += (nextFirst - minFirst);
    nextFirst = minFirst;
  }

  if (nextSecond < minSecond) {
    nextFirst += (nextSecond - minSecond);
    nextSecond = minSecond;
  }

  return [Math.max(minFirst, nextFirst), Math.max(minSecond, nextSecond)];
}

type BowlShape = "rectangle" | "oval";
type BowlSize = "S" | "M" | "L" | "XL" | "XXL";

const bowlDetails: Record<string, { shape: BowlShape; size: BowlSize; displayName: string }> = {
  "UB-01": { shape: "rectangle", size: "M", displayName: "01" },
  "UB-02": { shape: "oval", size: "M", displayName: "02" },
  "UB-03": { shape: "oval", size: "M", displayName: "03" },
  "UB-04-M": { shape: "rectangle", size: "M", displayName: "04-M" },
  "UB-04-L": { shape: "rectangle", size: "L", displayName: "04-L" },
  "UB-04-RL": { shape: "rectangle", size: "L", displayName: "04-RL" },
  "UB-04-LR": { shape: "rectangle", size: "L", displayName: "04-LR" },
  "UB-04-32": { shape: "rectangle", size: "L", displayName: "04-32" },
  "UB-04-40": { shape: "rectangle", size: "XL", displayName: "04-40" },
  "UB-04-XL": { shape: "rectangle", size: "XL", displayName: "04-XL" },
  "UB-04-XXL": { shape: "rectangle", size: "XXL", displayName: "04-XXL" },
  "UB-05-M": { shape: "rectangle", size: "M", displayName: "05-M" },
  "UB-05-L": { shape: "rectangle", size: "L", displayName: "05-L" },
  "UB-05-XL": { shape: "rectangle", size: "XL", displayName: "05-XL" },
};

function getShapeAndSizeFromBowlId(bowlId: string): { shape: BowlShape; size: BowlSize } {
  const details = bowlDetails[bowlId];
  if (details) {
    return { shape: details.shape, size: details.size };
  }
  return { shape: "rectangle", size: "M" };
}

type BowlType = "tilt" | "rectangle" | "round";

function getBowlTypeFromId(bowlId: string): BowlType {
  if (bowlId.startsWith("UB-04-")) {
    return "tilt";
  }
  const details = bowlDetails[bowlId];
  if (details && details.shape === "oval") {
    return "round";
  }
  return "rectangle";
}

function formatBowlSize(size: { length: number; depth: number; height: number }): string {
  const l = (size.length / 25.4).toFixed(size.length === 827 ? 2 : 1);
  const d = (size.depth / 25.4).toFixed(1);
  const h = (size.height / 25.4).toFixed(1);
  return `Size: ${l} x ${d} x ${h} In`;
}

const sizes: BowlSize[] = ["S", "M", "L", "XL", "XXL"];

function App() {
  const [config, setConfig] = useState<SinkConfiguration>(initialConfig);
  const [activeBuildMode, setActiveBuildMode] = useState<"build" | "finish">("build");
  const [openStep, setOpenStep] = useState<number | null>(1);
  const [mobileSnap, setMobileSnap] = useState<SnapPosition>("half");
  const [viewerResetToken, setViewerResetToken] = useState(0);
  const [showBuildSummary, setShowBuildSummary] = useState(false);
  const [cartStatus, setCartStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [cartErrorMessage, setCartErrorMessage] = useState<string | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [bowlFinish, setBowlFinish] = useState<BowlFinish>("glossy");
  const [bowlColor, setBowlColor] = useState<BowlColor | undefined>("white");
  const [drainFinish, setDrainFinish] = useState<DrainFinish | undefined>("chrome");
  const [showDimensions, setShowDimensions] = useState(false);
  const [arModelLoaded, setArModelLoaded] = useState(false);
  const [arModelUrl, setArModelUrl] = useState<string>();
  const [showArPreview, setShowArPreview] = useState(false);
  const [, setHistoryRevision] = useState(0);
  const arModelUrlRef = useRef<string | undefined>(undefined);
  const arViewerRef = useRef<ModelViewerElement>(null);
  const applyingHistory = useRef(false);

  // Resize 3D stage after drawer completes smooth transition
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 400);
    return () => clearTimeout(timer);
  }, [mobileSnap]);
  const bowlId = config.bowl?.id ?? "UB-01";
  const selectedBowlType = getBowlTypeFromId(bowlId);
  const isRamp = selectedBowlType === "tilt";
  const effectiveDrainFinish: DrainFinish | undefined = isRamp ? undefined : drainFinish;
  const currentSnapshot = useMemo<HistorySnapshot>(() => ({
    bowlColor,
    bowlFinish,
    config,
    drainFinish: effectiveDrainFinish,
  }), [bowlColor, bowlFinish, config, effectiveDrainFinish]);
  const history = useRef<ConfiguratorHistory>({
    future: [],
    past: [],
    present: currentSnapshot,
  });
  const dims = useMemo(() => mergedDimensions(config), [config]);
  const bowlCount = countByQuantity[config.bowlQuantity ?? "single"];
  const selectedQuantityIndex = quantityOptions.findIndex((item) => item.quantity === config.bowlQuantity);
  const selectedFinishIndex = (["glossy", "matte"] as const).indexOf(bowlFinish);
  const minLeftRight = 100; // 3.94 inches (100 mm)
  const minSpacing = 100; // 3.94 inches (100 mm)
  const minFrontRear = 50; // 1.9685 inches (50 mm)
  const bowlLength = config.bowl?.size.length ?? 500;
  const totalBowlsLength = bowlCount * bowlLength;
  const gaps = bowlCount > 1 ? bowlCount - 1 : 0;
  const minOverallWidth = totalBowlsLength + (gaps * minSpacing) + (minLeftRight * 2);
  const extraWidthAllowance = 15 * 25.4; // 15 inches (381 mm) allowance above minimum for XL+
  const maximumOverallWidth = Math.max(3000, minOverallWidth + extraWidthAllowance);
  const maximumOverallDepth = 600; // 23.622 inches (600 mm)
  const currentSpacing = gaps > 0 ? Math.max(minSpacing, Number(config.dimensions.bowlSpacing ?? minSpacing)) : 0;
  const fixedSinkWidth = totalBowlsLength + (gaps * currentSpacing);
  const fixedSinkDepth = config.bowl?.size.depth ?? 410;
  const minOverallDepth = fixedSinkDepth + (minFrontRear * 2);
  const maxSpacingLimit = gaps > 0
    ? Math.max(minSpacing, Math.floor((maximumOverallWidth - totalBowlsLength - (minLeftRight * 2)) / gaps))
    : minSpacing;
  const maximumOverallHeight = 10 * 25.4; // 10 inches (254 mm)
  const selectedBowlColor = (bowlColor && bowlColorOptions.find((option) => option.id === bowlColor)?.color) ?? "#f7f7f5";
  const selectedBowlColorLabel = (bowlColor && bowlColorOptions.find((option) => option.id === bowlColor)?.label) ?? "";
  const selectedDrainFinish = effectiveDrainFinish ? drainFinishOptions.find((option) => option.id === effectiveDrainFinish) : undefined;
  const { shape: selectedShape, size: selectedSize } = getShapeAndSizeFromBowlId(bowlId);

  // Model-specific pricing variables
  const lengthInMeters = (dims.L ?? 0) / 1000;
  const baseSinkPrice = lengthInMeters * 210;

  const depthInMeters = (dims.D ?? 0) / 1000;
  const baseDepthPrice = depthInMeters * 210;

  const extraBowlCount = bowlCount > 1 ? bowlCount - 1 : 0;
  const extraBowlPrice = extraBowlCount * 80;
  
  const packingPrice = 50;

  const heightInMeters = (dims.H ?? config.bowl?.size.height ?? 0) / 1000;
  const baseHeightPrice = heightInMeters * 210;

  const widthInInches = Number(((dims.L ?? 0) / 25.4).toFixed(2));
  const extraWidthPrice = widthInInches >= 40 ? 50 : 0;

  const wallMountPrice = bowlCount === 1 ? 150 : (bowlCount === 2 ? 200 : 250);
  const installationPrice = config.mountingType === "wall_mounted" ? wallMountPrice : 0;

  const factoryCost = baseSinkPrice + baseDepthPrice + baseHeightPrice + extraBowlPrice + packingPrice;
  const baseBuildSubtotal = Math.round(factoryCost * 1.85) + extraWidthPrice + installationPrice;
  const buildSubtotal = Math.round(baseBuildSubtotal * 1.7);
  const bowlColorPrice = bowlColor ? (bowlColor === "white" ? 0 : (config.bowl?.colorPrice ?? 100)) : 0;
  const drainCapPrice = selectedDrainFinish ? selectedDrainFinish.price : 0;
  const baseFinishSubtotal = bowlColorPrice + drainCapPrice;
  const finishSubtotal = Math.round(baseFinishSubtotal * 1.7);
  const total = buildSubtotal + finishSubtotal;

  const hasAllSelections = Boolean(
    config.mountingType &&
    config.bowl &&
    config.bowlQuantity &&
    bowlFinish &&
    bowlColor &&
    (isRamp || effectiveDrainFinish)
  );

  const isCartDisabled = !hasAllSelections;
  const cartDisabledTooltip = "One more step - select your sink finish to add to cart";

  const selectedDrainEdge: "left" | "rear" | "right" = bowlId === "UB-04-RL"
    ? "left"
    : (bowlId === "UB-04-LR" ? "right" : "rear");

  const isDrainEdgeDisabled = (edge: "left" | "rear" | "right") => {
    return false;
  };

  const getFilteredBowls = (type: BowlType, size: BowlSize, edge: "left" | "rear" | "right" = selectedDrainEdge) => {
    if (type === "round") {
      return bowlOptions.filter((b) => {
        const details = bowlDetails[b.id];
        return details && details.shape === "oval" && details.size === size;
      });
    }
    if (type === "tilt") {
      return bowlOptions.filter((b) => {
        const details = bowlDetails[b.id];
        if (!b.id.startsWith("UB-04-") || !details || details.size !== size) {
          return false;
        }
        const itemEdge = b.id === "UB-04-RL"
          ? "left"
          : (b.id === "UB-04-LR" ? "right" : "rear");
        return itemEdge === edge;
      });
    }
    return bowlOptions.filter((b) => {
      const details = bowlDetails[b.id];
      return details && details.shape === "rectangle" && !b.id.startsWith("UB-04-") && details.size === size;
    });
  };

  const filteredBowls = getFilteredBowls(selectedBowlType, selectedSize, selectedDrainEdge);

  const updateBowlById = (id: string) => {
    const newBowl = bowlOptions.find((b) => b.id === id);
    if (newBowl) {
      updateBowl(newBowl);
    }
  };

  const isSizeDisabled = (type: BowlType, size: BowlSize) => {
    const edge = type === "tilt" ? selectedDrainEdge : "rear";
    return getFilteredBowls(type, size, edge).length === 0;
  };

  const handleDrainEdgeChange = (edge: "left" | "rear" | "right") => {
    let targetSize = selectedSize;
    if ((edge === "left" || edge === "right") && targetSize !== "L") {
      targetSize = "L"; // Auto switch size to L
    }
    const matching = getFilteredBowls(selectedBowlType, targetSize, edge);
    if (matching.length > 0) {
      updateBowl(matching[0]);
    }
  };

  const handleTypeChange = (newType: BowlType) => {
    let targetSize = selectedSize;
    let matching = getFilteredBowls(newType, targetSize, "rear");
    
    if (matching.length === 0) {
      const fallbackSizes: BowlSize[] = ["M", "L", "XL", "XXL", "S"];
      for (const fs of fallbackSizes) {
        matching = getFilteredBowls(newType, fs, "rear");
        if (matching.length > 0) {
          targetSize = fs;
          break;
        }
      }
    }
    
    if (matching.length > 0) {
      updateBowl(matching[0]);
    }
  };

  const handleSizeChange = (newSize: BowlSize) => {
    if (isSizeDisabled(selectedBowlType, newSize)) return;
    let targetEdge = selectedDrainEdge;
    if (newSize !== "L" && targetEdge !== "rear") {
      targetEdge = "rear";
    }
    const matching = getFilteredBowls(selectedBowlType, newSize, targetEdge);
    if (matching.length > 0) {
      updateBowl(matching[0]);
    }
  };

  useEffect(() => {
    if (!showBuildSummary) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowBuildSummary(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showBuildSummary]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.badeloft.com") {
        return;
      }

      if (!event.data || typeof event.data !== "object") {
        return;
      }

      if (event.data.type !== "badeloft:sink:cart-result") {
        return;
      }

      if (event.data.ok === true) {
        setCartStatus("success");
        setCartErrorMessage(null);
      } else {
        setCartStatus("error");
        setCartErrorMessage(typeof event.data.message === "string" ? event.data.message : "Unable to add item to cart");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (cartStatus === "success") {
      const timer = setTimeout(() => {
        setCartStatus("idle");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [cartStatus]);

  useEffect(() => {
    setCartStatus("idle");
    setCartErrorMessage(null);
  }, [config, bowlColor, bowlFinish, drainFinish]);
  useEffect(() => {
    if (applyingHistory.current) {
      applyingHistory.current = false;
      return;
    }

    const historyState = history.current;
    if (
      historyState.present.config === currentSnapshot.config
      && historyState.present.bowlColor === currentSnapshot.bowlColor
      && historyState.present.bowlFinish === currentSnapshot.bowlFinish
      && historyState.present.drainFinish === currentSnapshot.drainFinish
    ) {
      return;
    }

    historyState.past.push(historyState.present);
    if (historyState.past.length > 100) historyState.past.shift();
    historyState.present = currentSnapshot;
    historyState.future = [];
    setHistoryRevision((revision) => revision + 1);
  }, [currentSnapshot]);

  const applyHistorySnapshot = (snapshot: HistorySnapshot) => {
    setConfig(snapshot.config);
    setBowlColor(snapshot.bowlColor);
    setBowlFinish(snapshot.bowlFinish);
    setDrainFinish(snapshot.drainFinish);
  };

  const undo = () => {
    const historyState = history.current;
    const previous = historyState.past.pop();
    if (!previous) return;

    historyState.future.push(historyState.present);
    historyState.present = previous;
    applyingHistory.current = true;
    applyHistorySnapshot(previous);
    setHistoryRevision((revision) => revision + 1);
  };

  const redo = () => {
    const historyState = history.current;
    const next = historyState.future.pop();
    if (!next) return;

    historyState.past.push(historyState.present);
    historyState.present = next;
    applyingHistory.current = true;
    applyHistorySnapshot(next);
    setHistoryRevision((revision) => revision + 1);
  };

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const updateBowl = (bowl: BowlOption) => {
    setConfig((previous) => {
      const count = countByQuantity[previous.bowlQuantity ?? "single"];
      const gaps = count > 1 ? count - 1 : 0;
      const totalBowlsLength = count * bowl.size.length;
      const minRequired = totalBowlsLength + (gaps * minSpacing) + (minLeftRight * 2);
      const maxOverallWidth = Math.max(3000, minRequired + (15 * 25.4));

      let spacing = gaps > 0 ? Math.max(minSpacing, Number(previous.dimensions.bowlSpacing ?? minSpacing)) : 0;
      if (gaps > 0) {
        const maxSpacingForBowl = Math.max(minSpacing, Math.floor((maxOverallWidth - totalBowlsLength - (minLeftRight * 2)) / gaps));
        spacing = clamp(spacing, minSpacing, maxSpacingForBowl);
      }

      let fixedWidth = totalBowlsLength + (gaps * spacing);
      let left = Math.max(minLeftRight, Number(previous.dimensions.L2 ?? minLeftRight));
      let right = Math.max(minLeftRight, Number(previous.dimensions.L3 ?? minLeftRight));

      if (left + right + fixedWidth > maxOverallWidth) {
        const [nextLeft, nextRight] = distributeOffsetDelta(maxOverallWidth, fixedWidth, left, right, minLeftRight, minLeftRight);
        left = nextLeft;
        right = nextRight;
      }

      let front = Math.max(minFrontRear, Number(previous.dimensions.D3 ?? minFrontRear));
      let rear = Math.max(minFrontRear, Number(previous.dimensions.D2 ?? minFrontRear));
      if (front + rear + bowl.size.depth > maximumOverallDepth) {
        const [nextFront, nextRear] = distributeOffsetDelta(maximumOverallDepth, bowl.size.depth, front, rear, minFrontRear, minFrontRear);
        front = nextFront;
        rear = nextRear;
      }

      return {
        ...previous,
        bowl,
        dimensions: {
          ...previous.dimensions,
          L2: left,
          L3: right,
          D3: front,
          D2: rear,
          H: bowl.size.height,
          ...(gaps > 0 ? { bowlSpacing: spacing } : {}),
        },
      };
    });
  };

  const updateQuantity = (quantity: BowlQuantity) => {
    setConfig((previous) => {
      const nextCount = countByQuantity[quantity];
      const nextGaps = nextCount > 1 ? nextCount - 1 : 0;
      const bowlLen = previous.bowl?.size.length ?? 500;
      const nextBowlsLength = nextCount * bowlLen;
      const nextMinRequired = nextBowlsLength + (nextGaps * minSpacing) + (minLeftRight * 2);
      const maxOverallWidth = Math.max(3000, nextMinRequired + (15 * 25.4));

      let nextSpacing = nextGaps > 0 ? Math.max(minSpacing, Number(previous.dimensions.bowlSpacing ?? minSpacing)) : 0;

      if (nextGaps > 0) {
        const maxSpacingForNew = Math.max(minSpacing, Math.floor((maxOverallWidth - nextBowlsLength - (minLeftRight * 2)) / nextGaps));
        nextSpacing = clamp(nextSpacing, minSpacing, maxSpacingForNew);
      }

      const newFixedWidth = nextBowlsLength + (nextGaps * nextSpacing);
      let left = Math.max(minLeftRight, Number(previous.dimensions.L2 ?? minLeftRight));
      let right = Math.max(minLeftRight, Number(previous.dimensions.L3 ?? minLeftRight));

      if (left + right + newFixedWidth > maxOverallWidth) {
        const [nextLeft, nextRight] = distributeOffsetDelta(maxOverallWidth, newFixedWidth, left, right, minLeftRight, minLeftRight);
        left = nextLeft;
        right = nextRight;
      }

      return {
        ...previous,
        bowlQuantity: quantity,
        sinkType: quantityToSinkType(quantity),
        dimensions: {
          ...previous.dimensions,
          L2: left,
          L3: right,
          ...(nextGaps > 0 ? { bowlSpacing: nextSpacing } : {}),
        },
      };
    });
  };

  const updateDimension = (field: keyof SinkDimensions, value: number) => {
    setConfig((previous) => {
      const count = countByQuantity[previous.bowlQuantity ?? "single"];
      const gaps = count > 1 ? count - 1 : 0;
      const bowlLen = previous.bowl?.size.length ?? 500;
      const totalBowlsLength = count * bowlLen;
      const minRequired = totalBowlsLength + (gaps * minSpacing) + (minLeftRight * 2);
      const maxOverall = Math.max(3000, minRequired + (15 * 25.4));
      let currentSpacing = gaps > 0 ? Math.max(minSpacing, Number(previous.dimensions.bowlSpacing ?? minSpacing)) : 0;

      if (field === "bowlSpacing") {
        if (gaps === 0) return previous;
        const maxSpacing = Math.max(minSpacing, Math.floor((maxOverall - totalBowlsLength - (minLeftRight * 2)) / gaps));
        const targetSpacing = clamp(value, minSpacing, maxSpacing);
        const newFixedWidth = totalBowlsLength + (gaps * targetSpacing);
        const currentL2 = Math.max(minLeftRight, Number(previous.dimensions.L2 ?? minLeftRight));
        const currentL3 = Math.max(minLeftRight, Number(previous.dimensions.L3 ?? minLeftRight));

        let nextL2 = currentL2;
        let nextL3 = currentL3;

        // If total width exceeds maxOverall, reduce Left and Right down towards minLeftRight
        if (newFixedWidth + nextL2 + nextL3 > maxOverall) {
          const [adjL2, adjL3] = distributeOffsetDelta(
            maxOverall,
            newFixedWidth,
            currentL2,
            currentL3,
            minLeftRight,
            minLeftRight
          );
          nextL2 = adjL2;
          nextL3 = adjL3;
        }

        return {
          ...previous,
          dimensions: {
            ...previous.dimensions,
            bowlSpacing: targetSpacing,
            L2: nextL2,
            L3: nextL3,
          },
        };
      }

      if (field === "L2") {
        let fixedWidth = totalBowlsLength + (gaps * currentSpacing);
        const currentL3 = Math.max(minLeftRight, Number(previous.dimensions.L3 ?? minLeftRight));
        let targetL2 = Math.max(minLeftRight, value);
        let nextL3 = currentL3;

        // If total width exceeds maxOverall, first reduce Right (L3) down to minimum
        if (targetL2 + nextL3 + fixedWidth > maxOverall) {
          nextL3 = maxOverall - fixedWidth - targetL2;
          if (nextL3 < minLeftRight) {
            nextL3 = minLeftRight;
            // If L3 hit minimum and we have multiple bowls with spacing > minSpacing,
            // reduce spacing down towards minSpacing
            if (gaps > 0 && currentSpacing > minSpacing) {
              const excess = (targetL2 + nextL3 + fixedWidth) - maxOverall;
              const maxSpacingReduction = currentSpacing - minSpacing;
              const neededSpacingReduction = excess / gaps;
              const actualReduction = Math.min(maxSpacingReduction, neededSpacingReduction);
              currentSpacing = currentSpacing - actualReduction;
              fixedWidth = totalBowlsLength + (gaps * currentSpacing);
              targetL2 = Math.min(targetL2, maxOverall - fixedWidth - nextL3);
            } else {
              targetL2 = maxOverall - fixedWidth - minLeftRight;
            }
          }
        }

        return {
          ...previous,
          dimensions: {
            ...previous.dimensions,
            L2: Math.max(minLeftRight, targetL2),
            L3: Math.max(minLeftRight, nextL3),
            ...(gaps > 0 ? { bowlSpacing: currentSpacing } : {}),
          },
        };
      }

      if (field === "L3") {
        let fixedWidth = totalBowlsLength + (gaps * currentSpacing);
        const currentL2 = Math.max(minLeftRight, Number(previous.dimensions.L2 ?? minLeftRight));
        let targetL3 = Math.max(minLeftRight, value);
        let nextL2 = currentL2;

        // If total width exceeds maxOverall, first reduce Left (L2) down to minimum
        if (nextL2 + targetL3 + fixedWidth > maxOverall) {
          nextL2 = maxOverall - fixedWidth - targetL3;
          if (nextL2 < minLeftRight) {
            nextL2 = minLeftRight;
            // If L2 hit minimum and we have multiple bowls with spacing > minSpacing,
            // reduce spacing down towards minSpacing
            if (gaps > 0 && currentSpacing > minSpacing) {
              const excess = (nextL2 + targetL3 + fixedWidth) - maxOverall;
              const maxSpacingReduction = currentSpacing - minSpacing;
              const neededSpacingReduction = excess / gaps;
              const actualReduction = Math.min(maxSpacingReduction, neededSpacingReduction);
              currentSpacing = currentSpacing - actualReduction;
              fixedWidth = totalBowlsLength + (gaps * currentSpacing);
              targetL3 = Math.min(targetL3, maxOverall - fixedWidth - nextL2);
            } else {
              targetL3 = maxOverall - fixedWidth - minLeftRight;
            }
          }
        }

        return {
          ...previous,
          dimensions: {
            ...previous.dimensions,
            L2: Math.max(minLeftRight, nextL2),
            L3: Math.max(minLeftRight, targetL3),
            ...(gaps > 0 ? { bowlSpacing: currentSpacing } : {}),
          },
        };
      }

      if (field === "D3") {
        const bowlDepth = previous.bowl?.size.depth ?? 410;
        const currentD2 = Math.max(minFrontRear, Number(previous.dimensions.D2 ?? minFrontRear));
        let targetD3 = Math.max(minFrontRear, value);
        let nextD2 = currentD2;

        // If total depth exceeds 23.622 in (maximumOverallDepth), reduce Rear (D2) down to minimum
        if (targetD3 + nextD2 + bowlDepth > maximumOverallDepth) {
          nextD2 = maximumOverallDepth - bowlDepth - targetD3;
          if (nextD2 < minFrontRear) {
            nextD2 = minFrontRear;
            targetD3 = maximumOverallDepth - bowlDepth - minFrontRear;
          }
        }

        return {
          ...previous,
          dimensions: {
            ...previous.dimensions,
            D3: Math.max(minFrontRear, targetD3),
            D2: Math.max(minFrontRear, nextD2),
          },
        };
      }

      if (field === "D2") {
        const bowlDepth = previous.bowl?.size.depth ?? 410;
        const currentD3 = Math.max(minFrontRear, Number(previous.dimensions.D3 ?? minFrontRear));
        let targetD2 = Math.max(minFrontRear, value);
        let nextD3 = currentD3;

        // If total depth exceeds 23.622 in (maximumOverallDepth), reduce Front (D3) down to minimum
        if (nextD3 + targetD2 + bowlDepth > maximumOverallDepth) {
          nextD3 = maximumOverallDepth - bowlDepth - targetD2;
          if (nextD3 < minFrontRear) {
            nextD3 = minFrontRear;
            targetD2 = maximumOverallDepth - bowlDepth - minFrontRear;
          }
        }

        return {
          ...previous,
          dimensions: {
            ...previous.dimensions,
            D2: Math.max(minFrontRear, targetD2),
            D3: Math.max(minFrontRear, nextD3),
          },
        };
      }

      let clampedValue = value;
      if (field === "H") {
        clampedValue = Math.min(Math.max(value, previous.bowl?.size.height ?? 80), maximumOverallHeight);
      }

      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          [field]: clampedValue,
        },
      };
    });
  };

  const updateMountingType = (mountingType: MountingType) => {
    setConfig((previous) => ({
      ...previous,
      mountingType,
    }));
  };

  const updateOverallWidth = (value: number) => {
    setConfig((previous) => {
      const count = countByQuantity[previous.bowlQuantity ?? "single"];
      const gaps = count > 1 ? count - 1 : 0;
      const bowlLen = previous.bowl?.size.length ?? 500;
      const totalBowlsLength = count * bowlLen;
      const minPossibleWidth = totalBowlsLength + (gaps * minSpacing) + (minLeftRight * 2);
      const maxOverall = Math.max(3000, minPossibleWidth + (15 * 25.4));
      const clampedValue = Math.min(maxOverall, Math.max(minPossibleWidth, value));
      let spacing = gaps > 0 ? Math.max(minSpacing, Number(previous.dimensions.bowlSpacing ?? minSpacing)) : 0;

      let fixedWidth = totalBowlsLength + (gaps * spacing);
      if (gaps > 0 && clampedValue < fixedWidth + (minLeftRight * 2)) {
        spacing = Math.max(minSpacing, Math.floor((clampedValue - totalBowlsLength - (minLeftRight * 2)) / gaps));
        fixedWidth = totalBowlsLength + (gaps * spacing);
      }

      const left = Number(previous.dimensions.L2 ?? minLeftRight);
      const right = Number(previous.dimensions.L3 ?? minLeftRight);
      const [nextLeft, nextRight] = distributeOffsetDelta(clampedValue, fixedWidth, left, right, minLeftRight, minLeftRight);

      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          L2: nextLeft,
          L3: nextRight,
          ...(gaps > 0 ? { bowlSpacing: spacing } : {}),
        },
      };
    });
  };

  const updateOverallDepth = (value: number) => {
    setConfig((previous) => {
      const bowlDepth = previous.bowl?.size.depth ?? 410;
      const minPossibleDepth = bowlDepth + (minFrontRear * 2);
      const clampedValue = Math.min(maximumOverallDepth, Math.max(minPossibleDepth, value));
      const front = Math.max(minFrontRear, Number(previous.dimensions.D3 ?? minFrontRear));
      const rear = Math.max(minFrontRear, Number(previous.dimensions.D2 ?? minFrontRear));
      const [nextFront, nextRear] = distributeOffsetDelta(clampedValue, bowlDepth, front, rear, minFrontRear, minFrontRear);

      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          D3: nextFront,
          D2: nextRear,
        },
      };
    });
  };

  const editSummarySection = (mode: "build" | "finish" | number) => {
    if (typeof mode === "number") {
      setOpenStep(mode);
    } else {
      setOpenStep(mode === "build" ? 1 : 2);
    }
    setShowBuildSummary(false);
  };

  const selectedSinkName = bowlDetails[config.bowl?.id ?? ""]?.displayName ?? config.bowl?.name ?? "01";
  const productTitle = `Custom Sink ${selectedSinkName}`;

  const handleArModelReady = useCallback((model: Blob) => {
    const nextUrl = URL.createObjectURL(model);
    const previousUrl = arModelUrlRef.current;
    arModelUrlRef.current = nextUrl;
    setArModelLoaded(false);
    setArModelUrl(nextUrl);
    if (previousUrl) window.setTimeout(() => URL.revokeObjectURL(previousUrl), 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (arModelUrlRef.current) URL.revokeObjectURL(arModelUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const viewer = arViewerRef.current;
    if (!viewer || !arModelUrl) return;

    const markLoaded = () => setArModelLoaded(true);
    viewer.addEventListener("load", markLoaded);
    if (viewer.loaded) markLoaded();
    return () => viewer.removeEventListener("load", markLoaded);
  }, [arModelUrl]);

  const launchAr = () => {
    const viewer = arViewerRef.current;
    if (!viewer || !arModelLoaded) return;

    if (viewer.canActivateAR) {
      void viewer.activateAR().catch(() => setShowArPreview(true));
      return;
    }

    setShowArPreview(true);
  };

  const handleAddToCart = () => {
    if (isCartDisabled || cartStatus === "loading") return;
    if (!bowlColor || (!isRamp && !effectiveDrainFinish)) return;
    setCartStatus("loading");
    setCartErrorMessage(null);
    const bowl = config.bowl ?? selectedStartBowl;
    const width = Number(dims.L ?? 0);
    const depth = Number(dims.D ?? 0);
    const height = Number(dims.H ?? bowl.size.height);
    const left = Number(dims.L2 ?? 0);
    const right = Number(dims.L3 ?? 0);
    const front = Number(dims.D3 ?? 0);
    const rear = Number(dims.D2 ?? 0);
    const bowlSpacing = Number(dims.bowlSpacing ?? 0);
    const installationId = config.mountingType === "wall_mounted" ? "wall_mounted" : "countertop";
    const payload: SinkCartPayload = {
      version: 1,
      productHandle: storefrontConfig.productHandle,
      currency: storefrontConfig.currency,
      price: { build: buildSubtotal, finish: finishSubtotal, total },
      selection: {
        bowl: {
          count: bowlCount,
          modelId: bowl.id,
          modelName: bowl.name,
          quantityId: config.bowlQuantity ?? "single",
          shape: selectedBowlType === "tilt" ? "ramp" : selectedBowlType === "round" ? "oval" : "trough",
          size: selectedSize,
        },
        installation: {
          id: installationId,
          label: installationId === "wall_mounted" ? "Wall Mounted" : "Countertop",
          sinkMount: "undermount",
        },
        color: { hex: selectedBowlColor, id: bowlColor, label: selectedBowlColorLabel },
        finish: bowlFinish,
        ...(!isRamp && effectiveDrainFinish ? { drainCapFinish: effectiveDrainFinish } : {}),
        drainEdge: selectedDrainEdge,
        dimensionsInches: {
          overall: { width: toInches(width), depth: toInches(depth), height: toInches(height) },
          bowl: {
            width: toInches(bowl.size.length),
            depth: toInches(bowl.size.depth),
            height: toInches(bowl.size.height),
            innerWidth: toInches(bowl.innerSize.length),
            innerDepth: toInches(bowl.innerSize.depth),
          },
          offsets: {
            left: toInches(left),
            right: toInches(right),
            front: toInches(front),
            rear: toInches(rear),
            betweenBowls: toInches(bowlSpacing),
          },
          codes: {
            L: toInches(width),
            L1: toInches(Number(dims.L1 ?? bowl.size.length)),
            L2: toInches(left),
            L3: toInches(right),
            D: toInches(depth),
            D1: toInches(Number(dims.D1 ?? bowl.size.depth)),
            D2: toInches(rear),
            D3: toInches(front),
            H: toInches(height),
            bowlSpacing: toInches(bowlSpacing),
          },
        },
      },
      specialInstructions,
    };

    handoffAddToCart(payload);
  };

  const subtitleSummary = useMemo(() => {
    const mounting = config.mountingType === "wall_mounted" ? "Wall mounted" : "Countertop";
    const finish = `${bowlFinish === "glossy" ? "Glossy" : "Matte"} ${selectedBowlColorLabel || "White"}`.trim();
    const type = selectedBowlType === "tilt" ? "ramp" : selectedBowlType === "round" ? "oval" : "trough";
    const bowlText = `${bowlCount} ${type} bowl${bowlCount > 1 ? "s" : ""}`;
    const drainEdgeText = selectedBowlType === "tilt"
      ? `${selectedDrainEdge.charAt(0).toUpperCase() + selectedDrainEdge.slice(1)} drain`
      : "Center drain";
    const widthIn = (Number(dims.L ?? 0) / 25.4).toFixed(0);
    const depthIn = (Number(dims.D ?? 0) / 25.4).toFixed(1);
    const sizeText = `${widthIn} × ${depthIn} in`;
    const drainCapText = isRamp ? "Concealed slot" : `${selectedDrainFinish?.label ?? "Chrome"} cap`;

    return `${mounting} · ${finish} · ${bowlText} · ${drainEdgeText} · ${sizeText} · ${drainCapText}`;
  }, [
    config.mountingType,
    bowlFinish,
    selectedBowlColorLabel,
    selectedBowlType,
    bowlCount,
    selectedDrainEdge,
    dims.L,
    dims.D,
    isRamp,
    selectedDrainFinish,
  ]);

  const renderConfiguratorControls = (idSuffix: string = "") => (
    <div className="panel-scroll" id={`configurator-panel${idSuffix}`}>
      {idSuffix === "-mobile" && (
        <div className="mobile-sheet-heading">
          <h2 className="desktop-panel-title">Build your sink</h2>
          <p className="desktop-panel-desc">Cast to order in stone resin. Ships in 10-12 weeks.</p>
        </div>
      )}
      {/* 1. Installation */}
      <NumberedStep
        isOpen={openStep === 1}
        onToggle={() => setOpenStep((prev) => (prev === 1 ? null : 1))}
        priceDelta={config.mountingType === "wall_mounted" ? `+${formatCurrency(installationPrice)}` : undefined}
        stepNumber={1}
        summary={config.mountingType === "wall_mounted" ? "Wall mounted" : "Countertop"}
        title="Installation"
      >
        <section className="control-section">
          <div className="mounting-card-grid">
            <Tooltip className="mounting-tooltip-wrapper" label={`+${formatCurrency(wallMountPrice)}`}>
              <button
                className={`mounting-card ${config.mountingType === "wall_mounted" ? "selected" : ""}`}
                onClick={() => updateMountingType("wall_mounted")}
                type="button"
              >
                <span className="mounting-card-title">Wall mounted</span>
                <span className="mounting-card-desc">Floats On A Concealed Bracket, Vanity-Free</span>
              </button>
            </Tooltip>
            <Tooltip className="mounting-tooltip-wrapper">
              <button
                className={`mounting-card ${config.mountingType === "countertop" ? "selected" : ""}`}
                onClick={() => updateMountingType("countertop")}
                type="button"
              >
                <span className="mounting-card-title">Countertop</span>
                <span className="mounting-card-desc">Rests On Your Existing Vanity Or Counter</span>
              </button>
            </Tooltip>
          </div>
        </section>
      </NumberedStep>

      {/* 2. Surface finish */}
      <NumberedStep
        isOpen={openStep === 2}
        onToggle={() => setOpenStep((prev) => (prev === 2 ? null : 2))}
        priceDelta={bowlColorPrice > 0 ? `+${formatCurrency(bowlColorPrice)}` : undefined}
        stepNumber={2}
        summary={`${bowlFinish === "glossy" ? "Glossy" : "Matte"} ${selectedBowlColorLabel || "white"}`}
        title="Surface finish"
      >
        <div className="finish-menu">
          <section className="finish-section">
            <div className="section-heading">
              <span>Surface Finish</span>
            </div>
            <div className="finish-card-grid">
              {(["glossy", "matte"] as const).map((finish) => (
                <button
                  className={`finish-card ${bowlFinish === finish ? "selected" : ""}`}
                  key={finish}
                  onClick={() => setBowlFinish(finish)}
                  type="button"
                >
                  {finish === "glossy" ? "Glossy" : "Matte"}
                </button>
              ))}
            </div>
          </section>

          <section className="finish-section">
            <div className="section-heading">
              <span>Color</span>
              {bowlColor && (
                <strong style={{ color: "#a38460" }}>
                  {bowlColor === "white"
                    ? "+$0"
                    : `+${formatCurrency(config.bowl?.colorPrice ?? 100)}`}
                </strong>
              )}
            </div>
            <div className="finish-card-grid">
              {bowlColorOptions.map((option) => (
                <button
                  className={`color-card color-${option.id} ${bowlColor === option.id ? "selected" : ""}`}
                  key={option.id}
                  onClick={() => setBowlColor(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </NumberedStep>

      {/* 3. Bowl */}
      <NumberedStep
        isOpen={openStep === 3}
        onToggle={() => setOpenStep((prev) => (prev === 3 ? null : 3))}
        stepNumber={3}
        summary={`${bowlCount} ${selectedBowlType === "tilt" ? "ramp" : selectedBowlType === "round" ? "oval" : "trough"} bowl${bowlCount > 1 ? "s" : ""}`}
        title="Bowl"
      >
        <section className="control-section">
          <div className="section-heading">
            <span>Bowl Type</span>
          </div>
          <div className="bowl-type-image-grid">
            {(["tilt", "rectangle", "round"] as const).map((type) => {
              const typeDisplayNames = {
                tilt: "Ramp",
                rectangle: "Trough",
                round: "Oval",
              };
              return (
                <button
                  className={`bowl-type-image-btn ${selectedBowlType === type ? "active" : ""}`}
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  type="button"
                  title={typeDisplayNames[type]}
                >
                  <img src={assetUrl(`assets/${type}${selectedBowlType === type ? "_active" : ""}.webp`)} alt={typeDisplayNames[type]} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <span>Bowl Size</span>
          </div>
          <div className="segmented-control" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            <div
              className="segmented-indicator"
              style={{
                transform: `translateX(${sizes.indexOf(selectedSize) * 100}%)`,
                width: "20%",
              }}
            />
            {sizes.map((size) => {
              const isDisabled = isSizeDisabled(selectedBowlType, size);
              return (
                <Tooltip key={size} label={isDisabled ? "Not Available" : ""}>
                  <button
                    className={`${selectedSize === size ? "active" : ""} ${isDisabled ? "disabled" : ""}`}
                    onClick={() => !isDisabled && handleSizeChange(size)}
                    disabled={isDisabled}
                    type="button"
                  >
                    {size}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          <div style={{ marginTop: "10px", fontSize: "13px", color: "#737783", fontWeight: 500 }}>
            Bowl Dimensions Are Fixed
          </div>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <span>Bowl Model</span>
          </div>
          <div className="bowl-model-card-grid">
            {filteredBowls.map((bowl) => (
              <Card
                key={bowl.id}
                image={bowl.image}
                label={bowlDetails[bowl.id]?.displayName ?? bowl.name}
                selected={config.bowl?.id === bowl.id}
                onClick={() => updateBowl(bowl)}
              >
                <div className="reusable-card-subtitle">
                  {formatBowlSize(bowl.size)}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <span>Number Of Bowls</span>
            <strong>{`x${bowlCount}`}</strong>
          </div>
          <div className="segmented-control">
            <div
              className="segmented-indicator"
              style={{
                transform: `translateX(${selectedQuantityIndex * 100}%)`,
                width: "33.333%",
              }}
            />
            {quantityOptions.map((item) => {
              const qtyMultiplier = item.quantity === "single" ? 1 : (item.quantity === "double" ? 2 : 3);
              const labelText = `x${qtyMultiplier}`;

              return (
                <Tooltip key={item.quantity} label={labelText}>
                  <button
                    className={config.bowlQuantity === item.quantity ? "active" : ""}
                    onClick={() => updateQuantity(item.quantity)}
                    type="button"
                  >
                    {item.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          {bowlCount > 1 && (
            <div style={{ marginTop: "24px" }}>
              <SliderRow
                label="Spacing"
                max={maxSpacingLimit}
                min={minSpacing}
                value={Number(config.dimensions.bowlSpacing ?? minSpacing)}
                onChange={(value) => updateDimension("bowlSpacing", value)}
              />
            </div>
          )}
        </section>
      </NumberedStep>

      {/* 4. Drain edge */}
      <NumberedStep
        isOpen={openStep === 4}
        onToggle={() => setOpenStep((prev) => (prev === 4 ? null : 4))}
        stepNumber={4}
        summary={selectedBowlType === "tilt" ? (selectedDrainEdge === "left" ? "Left" : selectedDrainEdge === "right" ? "Right" : "Rear") : "Center"}
        title="Drain edge"
      >
        <section className="control-section">
          {selectedBowlType === "tilt" ? (
            <div className="drain-edge-sub-section">
              <div className="segmented-control" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div
                  className="segmented-indicator"
                  style={{
                    transform: `translateX(${(["left", "rear", "right"] as const).indexOf(selectedDrainEdge) * 100}%)`,
                    width: "33.333%",
                  }}
                />
                {(["left", "rear", "right"] as const).map((edge) => {
                  const isDisabled = isDrainEdgeDisabled(edge);
                  const label = edge.charAt(0).toUpperCase() + edge.slice(1);
                  return (
                    <Tooltip key={edge} label={isDisabled ? "Only Available on Size L" : ""}>
                      <button
                        className={`${selectedDrainEdge === edge ? "active" : ""} ${isDisabled ? "disabled" : ""}`}
                        onClick={() => !isDisabled && handleDrainEdgeChange(edge)}
                        disabled={isDisabled}
                        type="button"
                      >
                        {label}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="drain-integrated-notice">
              Standard center drain is integrated into oval and trough bowl models.
            </div>
          )}
        </section>
      </NumberedStep>

      {/* 5. Size */}
      <NumberedStep
        isOpen={openStep === 5}
        onToggle={() => setOpenStep((prev) => (prev === 5 ? null : 5))}
        stepNumber={5}
        summary={`${(Number(dims.L ?? 0) / 25.4).toFixed(0)} in wide, ${(Number(dims.D ?? 0) / 25.4).toFixed(1)} in deep`}
        title="Size"
      >
        <section className="control-section">
          {/* Length Block */}
          <div style={{ display: "grid", gap: "16px" }}>
            <SliderRow label="Width" max={maximumOverallWidth} min={minOverallWidth} value={Number(dims.L ?? 0)} onChange={updateOverallWidth} />
            
            <div className="offset-grid">
              <OffsetControl
                label="Left"
                max={maximumOverallWidth - fixedSinkWidth - minLeftRight}
                min={minLeftRight}
                value={Number(config.dimensions.L2 ?? minLeftRight)}
                onChange={(value) => updateDimension("L2", value)}
              />
              <OffsetControl
                label="Right"
                max={maximumOverallWidth - fixedSinkWidth - minLeftRight}
                min={minLeftRight}
                value={Number(config.dimensions.L3 ?? minLeftRight)}
                onChange={(value) => updateDimension("L3", value)}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="mid-divider" />

          {/* Width Block */}
          <div style={{ display: "grid", gap: "16px" }}>
            <SliderRow label="Depth" max={maximumOverallDepth} min={minOverallDepth} value={Number(dims.D ?? 0)} onChange={updateOverallDepth} />
            
            <div className="offset-grid">
              <OffsetControl
                label="Front"
                max={maximumOverallDepth - fixedSinkDepth - minFrontRear}
                min={minFrontRear}
                value={Number(config.dimensions.D3 ?? minFrontRear)}
                onChange={(value) => updateDimension("D3", value)}
              />
              <OffsetControl
                label="Rear"
                max={maximumOverallDepth - fixedSinkDepth - minFrontRear}
                min={minFrontRear}
                value={Number(config.dimensions.D2 ?? minFrontRear)}
                onChange={(value) => updateDimension("D2", value)}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="mid-divider" />

          {/* Height Block */}
          <div>
            <SliderRow label="Height" max={maximumOverallHeight} min={config.bowl?.size.height ?? 80} value={Number(dims.H ?? 0)} onChange={(value) => updateDimension("H", value)} />
          </div>
        </section>
      </NumberedStep>

      {/* 6. Drain cap */}
      <NumberedStep
        isOpen={openStep === 6}
        onToggle={() => setOpenStep((prev) => (prev === 6 ? null : 6))}
        priceDelta={!isRamp && selectedDrainFinish && selectedDrainFinish.price > 0 ? `+${formatCurrency(selectedDrainFinish.price)}` : undefined}
        stepNumber={6}
        summary={isRamp ? "Concealed slot" : `${selectedDrainFinish?.label ?? "Chrome"} drain cap`}
        title="Drain cap"
      >
        {!isRamp ? (
          <section className="finish-section">
            <div className="section-heading">
              <span>Drain Cap Finish</span>
              {selectedDrainFinish && (
                <strong style={{ color: "#a38460" }}>
                  {selectedDrainFinish.price === 0
                    ? "+$0"
                    : `+${formatCurrency(selectedDrainFinish.price)}`}
                </strong>
              )}
            </div>
            <div className="finish-card-grid">
              {drainFinishOptions.map((option) => (
                <Tooltip
                  key={option.id}
                  label={option.price === 0 ? "+$0" : `+${formatCurrency(option.price)}`}
                >
                  <button
                    className={`finish-card ${drainFinish === option.id ? "selected" : ""}`}
                    onClick={() => setDrainFinish(option.id)}
                    type="button"
                  >
                    <span className="finish-card-label">{option.label}</span>
                    <span className="finish-card-price">
                      {option.price === 0 ? "+$0" : `+${formatCurrency(option.price)}`}
                    </span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </section>
        ) : (
          <div className="drain-integrated-notice">
            Ramp sinks feature an elegant concealed slot drain integrated into the basin slope. No separate drain cap is required.
          </div>
        )}
      </NumberedStep>
    </div>
  );

  const widthMm = Math.round(Number(dims.L ?? 0));
  const depthMm = Math.round(Number(dims.D ?? 0));
  const heightMm = Math.round(Number(dims.H ?? config.bowl?.size.height ?? 0));
  const widthFraction = toFractionalInches(widthMm);
  const depthFraction = toFractionalInches(depthMm);
  const heightFraction = toFractionalInches(heightMm);

  const leftMm = Math.round(Number(dims.L2 ?? 0));
  const rightMm = Math.round(Number(dims.L3 ?? 0));
  const isCentered = Math.abs(leftMm - rightMm) <= 3;
  const leftIn = toFractionalInches(leftMm).formattedText;
  const rightIn = toFractionalInches(rightMm).formattedText;

  const shapeDisplayName = selectedBowlType === "tilt" ? "Ramp" : (selectedBowlType === "round" ? "Oval" : "Trough");
  const sizeMap: Record<string, string> = {
    s: "small",
    m: "medium",
    l: "large",
    xl: "XL",
    xxl: "XXL",
  };
  const sizeDisplayName = sizeMap[selectedSize.toLowerCase()] ?? selectedSize.toLowerCase();
  const bowlCodeName = bowlDetails[bowlId]?.displayName ?? config.bowl?.name ?? "04-M";
  const bowlSpecText = `${shapeDisplayName}, ${sizeDisplayName} (${bowlCodeName}) × ${bowlCount}`;

  return (
    <main className="builder-page">
      {/* Mobile Top Header Bar (< 1024px) */}
      <header className="mobile-app-header">
        <a
          aria-label="Badeloft Home"
          className="mobile-header-brand"
          href="https://www.badeloft.com/"
          rel="noopener noreferrer"
          target="_top"
        >
          <img
            alt="Badeloft - Powered by Ikarus Delta"
            className="mobile-brand-logo-img"
            src={assetUrl("assets/poweredby-logo.png")}
          />
        </a>

        <a
          aria-label="Back to site"
          className="mobile-header-back"
          href="https://www.badeloft.com/"
          onClick={(e) => {
            try {
              if (window.top && window.top !== window) {
                e.preventDefault();
                window.top.location.href = "https://www.badeloft.com/";
              }
            } catch {
              // target="_top" handles cross-origin fallback
            }
          }}
          rel="noopener noreferrer"
          target="_top"
        >
          <span>Back to site</span>
          <span className="mobile-back-x" aria-hidden="true">×</span>
        </a>
      </header>

      {/* 3D Stage Viewport (Desktop Left / Mobile Top) */}
      <section className={`stage snap-${mobileSnap}`}>
        <div className="stage-brand-badge desktop-only-badge">
          <img src={assetUrl("assets/poweredby-logo.png")} alt="Powered by Ikarus Delta" />
        </div>

        {/* Top-Right Pinned "View in your space" AR button (Mobile & Tablet) */}
        <button
          className="stage-ar-button-pinned"
          disabled={!arModelLoaded}
          onClick={launchAr}
          title={arModelLoaded ? "View in your space" : "Preparing AR model"}
          type="button"
        >
          <Box size={18} />
          <span>View in your space</span>
        </button>

        <div className="stage-canvas">
          <Dimension3DPreview key={viewerResetToken} bowlColor={selectedBowlColor} bowlFinish={bowlFinish} config={config} drainFinish={effectiveDrainFinish} onArModelReady={handleArModelReady} showDimensions={showDimensions} />
        </div>

        <div className="viewport-toolbar" role="toolbar" aria-label="3D viewport controls">
          <button className="toolbar-icon" aria-label="Undo" disabled={!canUndo} onClick={undo} title="Undo" type="button">
            <Undo2 size={24} />
          </button>
          <button className="toolbar-icon" aria-label="Redo" disabled={!canRedo} onClick={redo} title="Redo" type="button">
            <Redo2 size={24} />
          </button>
          <button className="toolbar-icon" aria-label="Reset view" onClick={() => setViewerResetToken((token) => token + 1)} title="Reset view" type="button">
            <RefreshCw size={22} />
          </button>
          <button
            aria-label="Toggle dimensions"
            aria-pressed={showDimensions}
            className={`toolbar-icon toolbar-product ${showDimensions ? "active" : ""}`}
            onClick={() => setShowDimensions(!showDimensions)}
            title="Toggle dimensions"
            type="button"
          >
            <Ruler size={22} />
          </button>
          <button
            className="toolbar-ar desktop-only-ar"
            disabled={!arModelLoaded}
            onClick={launchAr}
            title={arModelLoaded ? "View in your space" : "Preparing AR model"}
            type="button"
          >
            <Box size={21} />
            <span>View in your space</span>
          </button>
        </div>
      </section>

      {/* Mobile & Tablet Bottom Sheet (< 1024px) */}
      <div className="mobile-sheet-wrapper">
        <BottomSheet
          cartDisabledTooltip={cartDisabledTooltip}
          cartStatus={cartStatus}
          isCartDisabled={isCartDisabled}
          onAddToCart={() => setShowBuildSummary(true)}
          onOpenSummary={() => setShowBuildSummary(true)}
          onSnapChange={setMobileSnap}
          snapState={mobileSnap}
          subtitleSummary={subtitleSummary}
          totalFormatted={formatCurrency(total)}
        >
          {renderConfiguratorControls("-mobile")}
        </BottomSheet>
      </div>

      {/* Desktop Configuration Panel (>= 1024px) */}
      <aside className="right-panel desktop-only-panel">
        <header className="desktop-panel-header">
          <div className="desktop-panel-header-content">
            <h2 className="desktop-panel-title">Build your sink</h2>
            <p className="desktop-panel-desc">Cast to order in stone resin. Ships in 10-12 weeks.</p>
          </div>
          <a
            aria-label="Back to site"
            className="back-to-site-btn"
            href="https://www.badeloft.com/"
            onClick={(e) => {
              try {
                if (window.top && window.top !== window) {
                  e.preventDefault();
                  window.top.location.href = "https://www.badeloft.com/";
                }
              } catch {
                // target="_top" handles cross-origin fallback
              }
            }}
            rel="noopener noreferrer"
            target="_top"
            title="Back to site"
          >
            <span>Back to site</span>
            <span className="back-to-site-circle" aria-hidden="true">
              <X size={13} strokeWidth={2} />
            </span>
          </a>
        </header>

        {renderConfiguratorControls("-desktop")}
        <footer className="cart-footer">
          <div className="cart-total-section">
            <div className="cart-total">
              <span>Total:</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            {subtitleSummary && (
              <div
                className="cart-subtitle-summary desktop-only"
                onClick={() => setShowBuildSummary(true)}
                role="button"
                tabIndex={0}
                title="Click to view full build summary"
              >
                {subtitleSummary}
              </div>
            )}
          </div>
          <div className="cart-actions">
            <Tooltip
              className="cart-tooltip-wrapper"
              label={isCartDisabled ? cartDisabledTooltip : undefined}
              triggerOnClick
            >
              <button
                aria-disabled={isCartDisabled}
                className={`add-cart-button ${isCartDisabled ? "disabled" : ""}`}
                onClick={(e) => {
                  if (isCartDisabled) {
                    e.preventDefault();
                    return;
                  }
                  setShowBuildSummary(true);
                }}
                type="button"
              >
                Add to Cart
              </button>
            </Tooltip>
          </div>
        </footer>
      </aside>

      <div className={`summary-backdrop ${showBuildSummary ? "open" : ""}`} onMouseDown={() => setShowBuildSummary(false)}>
        <section
          aria-labelledby="build-summary-title"
          aria-modal="true"
          className={`build-summary-dialog ${showBuildSummary ? "open" : ""}`}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <header className="summary-header">
            <h2 id="build-summary-title">Your Build</h2>
            <button aria-label="Close build summary" onClick={() => setShowBuildSummary(false)} type="button">
              <X size={20} strokeWidth={2} />
            </button>
          </header>

          <div className="summary-content">
            {/* SPECIFICATIONS Card */}
            <div className="summary-spec-card">
              <div className="spec-card-header">
                <span className="spec-card-title">SPECIFICATIONS</span>
                <button
                  type="button"
                  className="spec-edit-btn"
                  onClick={() => {
                    setShowBuildSummary(false);
                    setOpenStep(1);
                  }}
                >
                  Edit
                </button>
              </div>
              <div className="spec-card-divider" />
              <div className="spec-rows">
                <div className="spec-row">
                  <span className="spec-label">Installation</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">
                      {config.mountingType === "wall_mounted" ? "Wall mounted" : "Countertop"}
                    </strong>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Bowl</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">{bowlSpecText}</strong>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Width</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">
                      {widthFraction.whole}
                      {widthFraction.fractionText && (
                        <>
                          {" "}
                          <sup>{widthFraction.fractionText}</sup>
                        </>
                      )}{" "}
                      in
                    </strong>
                    <span className="spec-val-secondary">{widthMm} mm</span>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Depth</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">
                      {depthFraction.whole}
                      {depthFraction.fractionText && (
                        <>
                          {" "}
                          <sup>{depthFraction.fractionText}</sup>
                        </>
                      )}{" "}
                      in
                    </strong>
                    <span className="spec-val-secondary">{depthMm} mm</span>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Height</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">
                      {heightFraction.whole}
                      {heightFraction.fractionText && (
                        <>
                          {" "}
                          <sup>{heightFraction.fractionText}</sup>
                        </>
                      )}{" "}
                      in
                    </strong>
                    <span className="spec-val-secondary">{heightMm} mm</span>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Bowl position</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">{isCentered ? "Centered" : "Offset"}</strong>
                    <span className="spec-val-secondary">
                      L {leftIn} · R {rightIn}
                    </span>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Color</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">
                      {bowlColor ? bowlColor.charAt(0).toUpperCase() + bowlColor.slice(1) : "White"}
                    </strong>
                    <span className="spec-val-secondary">
                      {bowlColor === "white" || !bowlColor ? "Included" : `+$${bowlColorPrice}`}
                    </span>
                  </div>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Finish</span>
                  <div className="spec-value">
                    <strong className="spec-val-primary">
                      {bowlFinish === "glossy" ? "Glossy" : "Matte"}
                    </strong>
                    <span className="spec-val-secondary">Included</span>
                  </div>
                </div>
                {!isRamp && selectedDrainFinish && (
                  <div className="spec-row">
                    <span className="spec-label">Drain cap</span>
                    <div className="spec-value">
                      <strong className="spec-val-primary">{selectedDrainFinish.label}</strong>
                      <span className="spec-val-secondary">
                        {selectedDrainFinish.price > 0 ? `+$${selectedDrainFinish.price}` : "Included"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* What happens next */}
            <div className="what-happens-next">
              <h3 className="summary-block-title">What happens next</h3>
              <ol className="next-steps-list">
                <li className="next-step-item">
                  <div className="next-step-circle" aria-hidden="true">
                    1
                  </div>
                  <div className="next-step-content">
                    <strong className="next-step-title">We draw it.</strong>
                    <p className="next-step-desc">
                      Our factory prepares a CAD drawing of your exact sink for your approval.
                    </p>
                  </div>
                </li>
                <li className="next-step-item">
                  <div className="next-step-circle" aria-hidden="true">
                    2
                  </div>
                  <div className="next-step-content">
                    <strong className="next-step-title">You approve, or walk away.</strong>
                    <p className="next-step-desc">
                      Full refund if the drawing isn't right or your plans change before production starts.
                    </p>
                  </div>
                </li>
                <li className="next-step-item">
                  <div className="next-step-circle" aria-hidden="true">
                    3
                  </div>
                  <div className="next-step-content">
                    <strong className="next-step-title">We cast it.</strong>
                    <p className="next-step-desc">
                      Hand-finished in stone resin and delivered in 9–12 weeks.
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Notes for our team */}
            <div className="summary-notes-section">
              <label htmlFor="summary-team-notes" className="summary-notes-label">
                <strong>Notes for our team</strong>
                <span className="summary-notes-optional">(optional)</span>
              </label>
              <textarea
                id="summary-team-notes"
                className="summary-notes-textarea"
                onChange={(event) => setSpecialInstructions(event.target.value)}
                placeholder="Anything we should know about your project, e.g. 1 faucet hole centered in back of the bowl"
                value={specialInstructions}
                rows={3}
              />
              <p className="summary-notes-hint">
                We'll confirm anything noted here on your drawing before production.
              </p>
            </div>
          </div>

          <div className="summary-footer">
            <div className="summary-total-row">
              <span className="summary-total-label">Total</span>
              <strong className="summary-total-amount">{formatCurrency(total)}</strong>
            </div>
            <div className="summary-affirm-note">
              or monthly payments with Affirm
            </div>

            <Tooltip
              className="summary-cart-tooltip-wrapper"
              label={isCartDisabled ? cartDisabledTooltip : undefined}
              triggerOnClick
            >
              <button
                aria-disabled={isCartDisabled || cartStatus === "loading"}
                className={`summary-add-cart ${isCartDisabled ? "disabled" : ""} ${cartStatus === "success" ? "success" : ""}`}
                onClick={(e) => {
                  if (isCartDisabled || cartStatus === "loading") {
                    e.preventDefault();
                    return;
                  }
                  handleAddToCart();
                }}
                type="button"
              >
                {cartStatus === "loading" && "Adding..."}
                {cartStatus === "success" && "Added to cart ✓"}
                {cartStatus !== "loading" && cartStatus !== "success" && "Add to Cart"}
              </button>
            </Tooltip>
            {cartErrorMessage && (
              <div className="summary-cart-error" role="alert">
                {cartErrorMessage}
              </div>
            )}
          </div>
        </section>
      </div>

      <model-viewer
        alt={productTitle}
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-placement="floor"
        ar-scale="fixed"
        className="ar-launcher-model"
        loading="eager"
        ref={arViewerRef}
        src={arModelUrl}
      />

      {showArPreview && arModelUrl && (
        <div className="ar-preview-backdrop" onMouseDown={() => setShowArPreview(false)}>
          <section aria-labelledby="ar-preview-title" aria-modal="true" className="ar-preview-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <header>
              <strong id="ar-preview-title">AR Preview</strong>
              <button aria-label="Close AR preview" onClick={() => setShowArPreview(false)} title="Close" type="button">
                <X size={20} />
              </button>
            </header>
            <model-viewer
              alt={productTitle}
              ar
              ar-modes="webxr scene-viewer quick-look"
              ar-placement="floor"
              ar-scale="fixed"
              camera-controls
              className="ar-preview-model"
              loading="eager"
              src={arModelUrl}
              touch-action="pan-y"
            >
              <button className="ar-preview-launch" slot="ar-button" type="button">
                <Box size={20} />
                <span>View in your space</span>
              </button>
            </model-viewer>
            <p>AR is unavailable on this device.</p>
          </section>
        </div>
      )}
    </main>
  );
}

interface SummaryItemProps {
  children?: ReactNode;
  label: string;
  onEdit: () => void;
  price: number;
}

function SummaryItem({ children, label, onEdit, price }: SummaryItemProps) {
  return (
    <article className="summary-item">
      <div>
        <strong>{label}</strong>
        <span>{formatCurrency(price)}</span>
        <button aria-label={`Edit ${label}`} onClick={onEdit} title={`Edit ${label}`} type="button">
          <img src={assetUrl("assets/edit.svg")} alt="Edit" style={{ width: "16px", height: "16px" }} />
        </button>
      </div>
      {children}
    </article>
  );
}
interface SliderRowProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}

function SliderRow({ label, max, min, onChange, value }: SliderRowProps) {
  const valInInches = Number((value / 25.4).toFixed(2));
  const minInInches = Number((min / 25.4).toFixed(2));
  const maxInInches = Number((max / 25.4).toFixed(2));

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inchVal = Number(event.target.value);
    onChange(inchVal * 25.4);
  };

  const handleNumericCommit = (inchVal: number) => {
    onChange(inchVal * 25.4);
  };

  const sliderValue = clamp(valInInches, minInInches, maxInInches);
  const progress = maxInInches === minInInches ? 0 : ((sliderValue - minInInches) / (maxInInches - minInInches)) * 100;
  const sliderStyle = { "--range-progress": `${progress}%` } as CSSProperties;

  return (
    <div className="slider-row">
      <div className="slider-row-header">
        <span>{label}</span>
        <NumericInput ariaLabel={`${label} in inches`} max={maxInInches} min={minInInches} onCommit={handleNumericCommit} suffix="in" value={valInInches} />
      </div>
      <input max={maxInInches} min={minInInches} step="0.01" style={sliderStyle} type="range" value={sliderValue} onChange={handleSliderChange} />
    </div>
  );
}

interface OffsetControlProps {
  label: string;
  onChange: (value: number) => void;
  value: number;
  min?: number;
  max?: number;
}

function OffsetControl({ label, onChange, value, min = 0, max = 1200 }: OffsetControlProps) {
  const valInInches = Number((value / 25.4).toFixed(2));
  const minInInches = Number((min / 25.4).toFixed(2));
  const maxInInches = Number((max / 25.4).toFixed(2));

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inchVal = Number(event.target.value);
    onChange(inchVal * 25.4);
  };

  const handleNumericCommit = (inchVal: number) => {
    onChange(inchVal * 25.4);
  };

  const sliderValue = clamp(valInInches, minInInches, maxInInches);
  const progress = maxInInches === minInInches ? 0 : ((sliderValue - minInInches) / (maxInInches - minInInches)) * 100;
  const sliderStyle = { "--range-progress": `${progress}%` } as CSSProperties;

  return (
    <div className="offset-control">
      <div className="offset-control-header">
        <span>{label}</span>
        <NumericInput
          ariaLabel={`${label} offset in inches`}
          max={maxInInches}
          min={minInInches}
          onCommit={handleNumericCommit}
          suffix="in"
          value={valInInches}
        />
      </div>
      <input
        max={maxInInches}
        min={minInInches}
        step="0.01"
        style={sliderStyle}
        type="range"
        value={sliderValue}
        onChange={handleSliderChange}
      />
    </div>
  );
}
interface NumericInputProps {
  ariaLabel: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  suffix?: string;
  value: number;
}

function NumericInput({ ariaLabel, max, min, onCommit, suffix, value }: NumericInputProps) {
  const [draft, setDraft] = useState(value % 1 === 0 ? String(value) : value.toFixed(2));

  useEffect(() => {
    setDraft(value % 1 === 0 ? String(value) : value.toFixed(2));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(value % 1 === 0 ? String(value) : value.toFixed(2));
      return;
    }

    const nextValue = clamp(parsed, min, max);
    setDraft(nextValue % 1 === 0 ? String(nextValue) : nextValue.toFixed(2));
    onCommit(nextValue);
  };

  return (
    <span className="number-input-shell">
      <input
        aria-label={ariaLabel}
        className="number-box"
        inputMode="decimal"
        max={max}
        min={min}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value % 1 === 0 ? String(value) : value.toFixed(2));
            event.currentTarget.blur();
          }
        }}
        step="any"
        type="number"
        value={draft}
      />
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </span>
  );
}

export default App;
