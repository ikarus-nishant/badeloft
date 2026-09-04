import { Bath, Box, Palette, Redo2, RefreshCw, Ruler, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { Dimension3DPreview } from "./components/Dimension3DPreview";
import { bowlOptions } from "./data/bowlOptions";
import type { BowlOption, BowlQuantity, MountingType, SinkConfiguration, SinkDimensions } from "./types/configurator";
import { mergedDimensions } from "./utils/calculations";
import { Card } from "./components/Card";
import { Tooltip } from "./components/Tooltip";
import { assetUrl, formatCurrency, handoffAddToCart, storefrontConfig, type SinkCartPayload } from "./integrations/storefront";

const selectedStartBowl = bowlOptions.find((bowl) => bowl.id === "UB-04-M") ?? bowlOptions[0];

const initialConfig: SinkConfiguration = {
  bowl: selectedStartBowl,
  bowlQuantity: "single",
  mountingType: "wall_mounted",
  sinkType: "CUSTOM_SINGLE",
  dimensions: {
    L2: 100,
    L3: 100,
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
  bowlColor: BowlColor;
  bowlFinish: BowlFinish;
  config: SinkConfiguration;
  drainFinish: DrainFinish;
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
  { id: "black", label: "Black", price: 29 },
  { id: "glossy-white", label: "Glossy White", price: 29 },
  { id: "matte-white", label: "Matte White", price: 29 },
  { id: "chrome", label: "Chrome", price: 29 },
  { id: "brushed-nickel", label: "Brushed Nickel", price: 29 },
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
  const [viewerResetToken, setViewerResetToken] = useState(0);
  const [showBuildSummary, setShowBuildSummary] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [bowlFinish, setBowlFinish] = useState<BowlFinish>("glossy");
  const [bowlColor, setBowlColor] = useState<BowlColor>("gray");
  const [drainFinish, setDrainFinish] = useState<DrainFinish>("chrome");
  const [showDimensions, setShowDimensions] = useState(false);
  const [arModelLoaded, setArModelLoaded] = useState(false);
  const [arModelUrl, setArModelUrl] = useState<string>();
  const [showArPreview, setShowArPreview] = useState(false);
  const [, setHistoryRevision] = useState(0);
  const arModelUrlRef = useRef<string | undefined>(undefined);
  const arViewerRef = useRef<ModelViewerElement>(null);
  const applyingHistory = useRef(false);
  const currentSnapshot = useMemo<HistorySnapshot>(() => ({
    bowlColor,
    bowlFinish,
    config,
    drainFinish,
  }), [bowlColor, bowlFinish, config, drainFinish]);
  const history = useRef<ConfiguratorHistory>({
    future: [],
    past: [],
    present: currentSnapshot,
  });
  const dims = useMemo(() => mergedDimensions(config), [config]);
  const bowlCount = countByQuantity[config.bowlQuantity ?? "single"];
  const selectedQuantityIndex = quantityOptions.findIndex((item) => item.quantity === config.bowlQuantity);
  const selectedFinishIndex = (["glossy", "matte"] as const).indexOf(bowlFinish);
  const fixedSinkWidth = (bowlCount * (config.bowl?.size.length ?? 500)) + (bowlCount > 1 ? (bowlCount - 1) * Number(config.dimensions.bowlSpacing ?? 100) : 0);
  const fixedSinkDepth = config.bowl?.size.depth ?? 410;
  const minLeftRight = config.mountingType === "wall_mounted" ? 100 : 50;
  const minOverallWidth = fixedSinkWidth + (minLeftRight * 2);
  const minOverallDepth = fixedSinkDepth + 50 + 100; // Front is 50, Rear is 100
  const maximumOverallWidth = 3000;
  const maximumOverallDepth = 600;
  const selectedBowlColor = bowlColorOptions.find((option) => option.id === bowlColor)?.color ?? "#f7f7f5";
  const selectedBowlColorLabel = bowlColorOptions.find((option) => option.id === bowlColor)?.label ?? "White";
  const selectedDrainFinish = drainFinishOptions.find((option) => option.id === drainFinish) ?? drainFinishOptions[0];
  const bowlId = config.bowl?.id ?? "UB-01";
  const selectedBowlType = getBowlTypeFromId(bowlId);
  const { shape: selectedShape, size: selectedSize } = getShapeAndSizeFromBowlId(bowlId);

  // Model-specific pricing variables
  const lengthInMeters = (dims.L ?? 0) / 1000;
  const baseSinkPrice = lengthInMeters * 210;
  
  const extraBowlCount = bowlCount > 1 ? bowlCount - 1 : 0;
  const extraBowlPrice = extraBowlCount * 80;
  
  const wallMountPrice = config.mountingType === "wall_mounted" ? 30 : 0;
  const packingPrice = 50;

  const heightInMm = dims.H ?? config.bowl?.size.height ?? 0;
  const extraHeightPrice = heightInMm > 200 ? 50 * lengthInMeters : 0;

  const factoryCost = baseSinkPrice + extraBowlPrice + wallMountPrice + packingPrice + extraHeightPrice;
  const buildSubtotal = Math.round(factoryCost * 1.85);
  const bowlColorPrice = bowlColor === "white" ? 0 : (config.bowl?.colorPrice ?? 100);
  const drainCapPrice = selectedDrainFinish.price;
  const finishSubtotal = bowlColorPrice + drainCapPrice;
  const total = buildSubtotal + finishSubtotal;

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
    setConfig((previous) => ({
      ...previous,
      bowl,
      dimensions: {
        ...previous.dimensions,
        H: bowl.size.height,
      },
    }));
  };

  const updateQuantity = (quantity: BowlQuantity) => {
    setConfig((previous) => ({
      ...previous,
      bowlQuantity: quantity,
      sinkType: quantityToSinkType(quantity),
    }));
  };

  const updateDimension = (field: keyof SinkDimensions, value: number) => {
    setConfig((previous) => {
      let clampedValue = value;
      if (field === "L2" || field === "L3") {
        clampedValue = Math.max(value, previous.mountingType === "wall_mounted" ? 100 : 50);
      } else if (field === "D3") {
        clampedValue = Math.max(value, 50);
      } else if (field === "D2") {
        clampedValue = Math.max(value, 100);
      } else if (field === "bowlSpacing") {
        clampedValue = Math.max(value, 100);
      } else if (field === "H") {
        clampedValue = Math.max(value, previous.bowl?.size.height ?? 80);
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
    setConfig((previous) => {
      const minLeftRight = mountingType === "wall_mounted" ? 100 : 50;
      const currentL2 = Number(previous.dimensions.L2 ?? 0);
      const currentL3 = Number(previous.dimensions.L3 ?? 0);
      
      return {
        ...previous,
        mountingType,
        dimensions: {
          ...previous.dimensions,
          L2: Math.max(currentL2, minLeftRight),
          L3: Math.max(currentL3, minLeftRight),
        },
      };
    });
  };

  const updateOverallWidth = (value: number) => {
    setConfig((previous) => {
      const bowlWidth = previous.bowl?.size.length ?? 500;
      const count = countByQuantity[previous.bowlQuantity ?? "single"];
      const gap = count > 1 ? Number(previous.dimensions.bowlSpacing ?? 100) : 0;
      const fixedWidth = (count * bowlWidth) + ((count - 1) * gap);
      const left = Number(previous.dimensions.L2 ?? 0);
      const right = Number(previous.dimensions.L3 ?? 0);
      const minLeftRight = previous.mountingType === "wall_mounted" ? 100 : 50;
      const [nextLeft, nextRight] = distributeOffsetDelta(value, fixedWidth, left, right, minLeftRight, minLeftRight);

      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          L2: nextLeft,
          L3: nextRight,
        },
      };
    });
  };

  const updateOverallDepth = (value: number) => {
    setConfig((previous) => {
      const bowlDepth = previous.bowl?.size.depth ?? 410;
      const front = Number(previous.dimensions.D3 ?? 0);
      const rear = Number(previous.dimensions.D2 ?? 0);
      const [nextFront, nextRear] = distributeOffsetDelta(value, bowlDepth, front, rear, 50, 100);

      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          D2: nextRear,
          D3: nextFront,
        },
      };
    });
  };

  const editSummarySection = (mode: "build" | "finish") => {
    setActiveBuildMode(mode);
    setShowBuildSummary(false);
  };

  const selectedSinkName = bowlDetails[config.bowl?.id ?? ""]?.displayName ?? config.bowl?.name ?? "01";
  const productTitle = `Undermount Sink ${selectedSinkName}`;

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
        drainCapFinish: drainFinish,
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

  return (
    <main className="builder-page">
      <section className="stage">
        <div className="stage-brand-badge">
          <img src={assetUrl("assets/poweredby-logo.png")} alt="Powered by Ikarus Delta" />
        </div>
        <div className="stage-canvas">
          <Dimension3DPreview key={viewerResetToken} bowlColor={selectedBowlColor} bowlFinish={bowlFinish} config={config} drainFinish={drainFinish} onArModelReady={handleArModelReady} showDimensions={showDimensions} />
        </div>
        <div className="viewport-toolbar" role="toolbar" aria-label="3D viewport controls">
          <button className="toolbar-icon" aria-label="Undo" disabled={!canUndo} onClick={undo} title="Undo" type="button">
            <Undo2 size={25} />
          </button>
          <button className="toolbar-icon" aria-label="Redo" disabled={!canRedo} onClick={redo} title="Redo" type="button">
            <Redo2 size={25} />
          </button>
          <button className="toolbar-icon" aria-label="Reset view" onClick={() => setViewerResetToken((token) => token + 1)} title="Reset view" type="button">
            <RefreshCw size={24} />
          </button>
          {/*
          <button
            aria-label="Sink view selected"
            aria-pressed="true"
            className="toolbar-icon toolbar-product active"
            onClick={() => setViewerResetToken((token) => token + 1)}
            title="Sink view"
            type="button"
          >
            <Bath size={24} />
          </button>
          */}
          <button
            aria-label="Toggle dimensions"
            aria-pressed={showDimensions}
            className={`toolbar-icon toolbar-product ${showDimensions ? "active" : ""}`}
            onClick={() => setShowDimensions(!showDimensions)}
            title="Toggle dimensions"
            type="button"
          >
            <Ruler size={24} />
          </button>
          <button
            className="toolbar-ar"
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

      <aside className="right-panel">
        <div className="build-tabs" role="tablist" aria-label="Configurator mode">
          <button aria-controls="configurator-panel" aria-selected={activeBuildMode === "build"} className={activeBuildMode === "build" ? "active" : ""} onClick={() => setActiveBuildMode("build")} role="tab" type="button">Build</button>
          <button aria-controls="configurator-panel" aria-selected={activeBuildMode === "finish"} className={activeBuildMode === "finish" ? "active" : ""} onClick={() => setActiveBuildMode("finish")} role="tab" type="button">Finish</button>
        </div>

        <div className="panel-scroll" id="configurator-panel" role="tabpanel">
          {activeBuildMode === "build" ? (
            <>
              <section className="control-section">
                <div className="section-heading">
                  <span>Installation</span>
                  <strong>{`+${formatCurrency(config.mountingType === "wall_mounted" ? 100 : 150)}`}</strong>
                </div>
                <div className="mounting-card-grid">
                  <button
                    className={`mounting-card ${config.mountingType === "wall_mounted" ? "selected" : ""}`}
                    onClick={() => updateMountingType("wall_mounted")}
                    type="button"
                  >
                    <span className="mounting-card-title">Wall mounted</span>
                    <span className="mounting-card-desc">Floats On A Concealed Bracket, Vanity-Free</span>
                  </button>
                  <button
                    className={`mounting-card ${config.mountingType === "countertop" ? "selected" : ""}`}
                    onClick={() => updateMountingType("countertop")}
                    type="button"
                  >
                    <span className="mounting-card-title">Countertop</span>
                    <span className="mounting-card-desc">Rests On Your Existing Vanity Or Counter</span>
                  </button>
                </div>
              </section>

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
 
                {selectedBowlType === "tilt" && (
                  <div className="drain-edge-sub-section" style={{ marginTop: "24px" }}>
                    <div className="section-heading">
                      <span>Drain Edge</span>
                    </div>
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
                )}
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
                  <strong>{formatCurrency(config.bowl?.basePrice ?? 340)}</strong>
                </div>
                <div className="bowl-model-card-grid">
                  {filteredBowls.map((bowl) => (
                    <Tooltip key={bowl.id} label={formatCurrency(bowl.basePrice ?? 0)}>
                      <Card
                        image={bowl.image}
                        label={bowlDetails[bowl.id]?.displayName ?? bowl.name}
                        selected={config.bowl?.id === bowl.id}
                        onClick={() => updateBowl(bowl)}
                      >
                        <div className="reusable-card-subtitle">
                          {formatBowlSize(bowl.size)}
                        </div>
                      </Card>
                    </Tooltip>
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
                      max={600}
                      min={100}
                      value={Number(config.dimensions.bowlSpacing ?? 100)}
                      onChange={(value) => updateDimension("bowlSpacing", value)}
                    />
                  </div>
                )}
              </section>

              <section className="control-section">
                <div className="section-heading dimensions-section-heading">
                  <span>Sink Dimensions</span>
                </div>

                {/* Length Block */}
                <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
                  <SliderRow label="Width" max={maximumOverallWidth} min={minOverallWidth} value={Number(dims.L ?? 0)} onChange={updateOverallWidth} />
                  
                  <div className="offset-grid">
                    <OffsetControl label="Left" min={config.mountingType === "wall_mounted" ? 100 : 50} value={Number(config.dimensions.L2 ?? 0)} onChange={(value) => updateDimension("L2", value)} />
                    <OffsetControl label="Right" min={config.mountingType === "wall_mounted" ? 100 : 50} value={Number(config.dimensions.L3 ?? 0)} onChange={(value) => updateDimension("L3", value)} />
                  </div>
                </div>

                {/* Divider */}
                <div className="mid-divider" />

                {/* Width Block */}
                <div style={{ display: "grid", gap: "16px" }}>
                  <SliderRow label="Depth" max={maximumOverallDepth} min={minOverallDepth} value={Number(dims.D ?? 0)} onChange={updateOverallDepth} />
                  
                  <div className="offset-grid">
                    <OffsetControl label="Front" min={50} value={Number(config.dimensions.D3 ?? 0)} onChange={(value) => updateDimension("D3", value)} />
                    <OffsetControl label="Rear" min={100} value={Number(config.dimensions.D2 ?? 0)} onChange={(value) => updateDimension("D2", value)} />
                  </div>
                </div>

                {/* Divider */}
                <div className="mid-divider" />

                {/* Height Block */}
                <div>
                  <SliderRow label="Height" max={500} min={config.bowl?.size.height ?? 80} value={Number(dims.H ?? 0)} onChange={(value) => updateDimension("H", value)} />
                </div>
              </section>

            </>
          ) : (
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
                  <strong style={{ color: "#a38460" }}>
                    {bowlColor === "white"
                      ? "Free"
                      : `+${formatCurrency(config.bowl?.colorPrice ?? 100)}`}
                  </strong>
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

              <section className="finish-section">
                <div className="section-heading">
                  <span>Drain Cap Finish</span>
                  <strong style={{ color: "#a38460" }}>{`+${formatCurrency(29)}`}</strong>
                </div>
                <div className="finish-card-grid">
                  {drainFinishOptions.map((option) => (
                    <Tooltip key={option.id} label={`+${formatCurrency(29)}`}>
                      <button
                        className={`finish-card ${drainFinish === option.id ? "selected" : ""}`}
                        onClick={() => setDrainFinish(option.id)}
                        type="button"
                      >
                        {option.label} +{formatCurrency(29)}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="cart-footer">
          <div className="cart-total"><span>Total:</span><strong>{formatCurrency(total)}</strong></div>
          <div className="cart-actions">
            <button className="summary-button" onClick={() => setShowBuildSummary(true)} type="button">Build Summary</button>
            <button className="add-cart-button" onClick={handleAddToCart} type="button">Add to Cart</button>
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
            <div className="summary-product">
              <img alt={config.bowl?.name ?? "Selected undermount sink"} src={config.bowl?.image} />
              <strong>{productTitle}</strong>
            </div>

             <div className="summary-items">
               {/* Build Card */}
               <div className="summary-group-card">
                 <div className="summary-group-header">
                   <strong>Build Subtotal</strong>
                   <span>{formatCurrency(buildSubtotal)}</span>
                 </div>
                 <div className="summary-group-divider" />
                 <ul className="summary-group-details">
                   <li>
                     <span>Bowl Model:</span>
                     <strong>{selectedSinkName}</strong>
                   </li>
                   <li>
                     <span>Bowl Shape:</span>
                     <strong>{selectedBowlType === "tilt" ? "Ramp" : (selectedBowlType === "round" ? "Oval" : "Trough")}</strong>
                   </li>
                   <li>
                     <span>Bowl Size:</span>
                     <strong>{selectedSize}</strong>
                   </li>
                   <li>
                     <span>Number of Bowls:</span>
                     <strong>{bowlCount}</strong>
                   </li>
                   <li>
                     <span>Dimensions:</span>
                     <strong>
                       {Math.round(Number(dims.L ?? 0) / 25.4)}in x {Math.round(Number(dims.D ?? 0) / 25.4)}in x {Math.round(Number(dims.H ?? 0) / 25.4)}in
                     </strong>
                   </li>
                   <li>
                     <span>Installation:</span>
                     <strong>{config.mountingType === "wall_mounted" ? "Wall Mounted" : "Countertop"}</strong>
                   </li>
                 </ul>
               </div>

               {/* Finish Card */}
               <div className="summary-group-card">
                 <div className="summary-group-header">
                   <strong>Finish Subtotal</strong>
                   <span>{formatCurrency(finishSubtotal)}</span>
                 </div>
                 <div className="summary-group-divider" />
                 <ul className="summary-group-details">
                   <li>
                     <span>Bowl Color:</span>
                     <strong>{selectedBowlColorLabel}</strong>
                   </li>
                   <li>
                     <span>Bowl Finish:</span>
                     <strong>{bowlFinish === "glossy" ? "Glossy" : "Matte"}</strong>
                   </li>
                   <li>
                     <span>Drain Cap:</span>
                     <strong>{selectedDrainFinish.label}</strong>
                   </li>
                 </ul>
               </div>
             </div>

             <div className="summary-spacer" />

             <label className="summary-instructions">
               <span>Special Instructions</span>
               <textarea
                 onChange={(event) => setSpecialInstructions(event.target.value)}
                 placeholder="Add any production or delivery instructions"
                 value={specialInstructions}
               />
             </label>
           </div>

           <div className="summary-footer">
             <div className="summary-totals">
               <div><span>Build</span><strong>{formatCurrency(buildSubtotal)}</strong></div>
               <div><span>Finish</span><strong>{formatCurrency(finishSubtotal)}</strong></div>
               <div className="summary-grand-total"><span>Total:</span><strong>{formatCurrency(total)}</strong></div>
             </div>

            <button className="summary-add-cart" onClick={handleAddToCart} type="button">Add to Cart</button>
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
        step="0.01"
        type="number"
        value={draft}
      />
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </span>
  );
}

export default App;
