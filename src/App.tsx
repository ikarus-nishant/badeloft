import { Bath, Box, Palette, Redo2, RefreshCw, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Dimension3DPreview } from "./components/Dimension3DPreview";
import { bowlOptions } from "./data/bowlOptions";
import type { BowlOption, BowlQuantity, MountingType, SinkConfiguration, SinkDimensions } from "./types/configurator";
import { mergedDimensions } from "./utils/calculations";
import { Card } from "./components/Card";
import { SpacingDiagram } from "./components/SpacingDiagram";
import { Tooltip } from "./components/Tooltip";

const selectedStartBowl = bowlOptions[0];

const initialConfig: SinkConfiguration = {
  bowl: selectedStartBowl,
  bowlQuantity: "single",
  mountingType: "countertop",
  sinkType: "CUSTOM_SINGLE",
  dimensions: {
    L2: 250,
    L3: 250,
    D2: 165,
    D3: 165,
    H: selectedStartBowl.size.height,
    bowlSpacing: 203.2, // Default spacing is 8 inches (203.2 mm)
  },
};

const quantityOptions: Array<{ label: string; quantity: BowlQuantity; price: string }> = [
  { label: "1", quantity: "single", price: "+$140" },
  { label: "2", quantity: "double", price: "+$280" },
  { label: "3", quantity: "triple", price: "+$420" },
];

type BowlFinish = "glossy" | "matte";
type BowlColor = "white" | "black" | "gray" | "custom";
type DrainFinish = "chrome" | "black" | "brushed-nickel" | "glossy-white" | "matte-white";

interface HistorySnapshot {
  bowlColor: BowlColor;
  bowlFinish: BowlFinish;
  config: SinkConfiguration;
  customBowlColor: string;
  drainFinish: DrainFinish;
}

interface ConfiguratorHistory {
  future: HistorySnapshot[];
  past: HistorySnapshot[];
  present: HistorySnapshot;
}

const bowlColorOptions: Array<{ color: string; id: Exclude<BowlColor, "custom">; label: string }> = [
  { color: "#f7f7f5", id: "white", label: "White" },
  { color: "#454545", id: "black", label: "Black" },
  { color: "#a4a4a4", id: "gray", label: "Gray" },
];

const drainFinishOptions: Array<{ id: DrainFinish; label: string; price: number }> = [
  { id: "black", label: "Black", price: 0 },
  { id: "glossy-white", label: "Glossy White", price: 0 },
  { id: "matte-white", label: "Matte White", price: 0 },
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

function distributeOffsetDelta(targetOverall: number, fixedSize: number, firstOffset: number, secondOffset: number): [number, number] {
  const availableOffset = Math.max(0, targetOverall - fixedSize);
  const equalDelta = (availableOffset - firstOffset - secondOffset) / 2;
  let nextFirst = firstOffset + equalDelta;
  let nextSecond = secondOffset + equalDelta;

  if (nextFirst < 0) {
    nextSecond += nextFirst;
    nextFirst = 0;
  }

  if (nextSecond < 0) {
    nextFirst += nextSecond;
    nextSecond = 0;
  }

  return [Math.max(0, nextFirst), Math.max(0, nextSecond)];
}

function ColorWheelIcon() {
  const segments = [];
  const R1 = 9;
  const R2 = 21;
  const center = 24;
  const gap = 3.5;

  for (let i = 0; i < 8; i++) {
    const startAngleDeg = i * 45 + gap;
    const endAngleDeg = (i + 1) * 45 - gap;

    const startRad = (startAngleDeg * Math.PI) / 180;
    const endRad = (endAngleDeg * Math.PI) / 180;

    const x1_in = center + R1 * Math.cos(startRad);
    const y1_in = center + R1 * Math.sin(startRad);
    const x2_in = center + R1 * Math.cos(endRad);
    const y2_in = center + R1 * Math.sin(endRad);

    const x1_out = center + R2 * Math.cos(startRad);
    const y1_out = center + R2 * Math.sin(startRad);
    const x2_out = center + R2 * Math.cos(endRad);
    const y2_out = center + R2 * Math.sin(endRad);

    const d = `
      M ${x1_in} ${y1_in}
      L ${x1_out} ${y1_out}
      A ${R2} ${R2} 0 0 1 ${x2_out} ${y2_out}
      L ${x2_in} ${y2_in}
      A ${R1} ${R1} 0 0 0 ${x1_in} ${y1_in}
      Z
    `;
    segments.push(<path d={d} key={i} fill="currentColor" />);
  }

  return (
    <svg viewBox="0 0 48 48" width="26" height="26" style={{ display: "block" }} aria-hidden="true">
      {segments}
    </svg>
  );
}

function App() {
  const [config, setConfig] = useState<SinkConfiguration>(initialConfig);
  const [activeBuildMode, setActiveBuildMode] = useState<"build" | "finish">("build");
  const [viewerResetToken, setViewerResetToken] = useState(0);
  const [showBuildSummary, setShowBuildSummary] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [bowlFinish, setBowlFinish] = useState<BowlFinish>("glossy");
  const [bowlColor, setBowlColor] = useState<BowlColor>("white");
  const [customBowlColor, setCustomBowlColor] = useState("#e6e6e6");
  const [drainFinish, setDrainFinish] = useState<DrainFinish>("chrome");
  const [, setHistoryRevision] = useState(0);
  const applyingHistory = useRef(false);
  const currentSnapshot = useMemo<HistorySnapshot>(() => ({
    bowlColor,
    bowlFinish,
    config,
    customBowlColor,
    drainFinish,
  }), [bowlColor, bowlFinish, config, customBowlColor, drainFinish]);
  const history = useRef<ConfiguratorHistory>({
    future: [],
    past: [],
    present: currentSnapshot,
  });
  const dims = useMemo(() => mergedDimensions(config), [config]);
  const bowlCount = countByQuantity[config.bowlQuantity ?? "single"];
  const selectedQuantityIndex = quantityOptions.findIndex((item) => item.quantity === config.bowlQuantity);
  const selectedFinishIndex = (["glossy", "matte"] as const).indexOf(bowlFinish);
  const fixedSinkWidth = bowlCount * (config.bowl?.size.length ?? 500);
  const fixedSinkDepth = config.bowl?.size.depth ?? 410;
  const maximumOverallWidth = Math.max(2400, fixedSinkWidth + 1000);
  const maximumOverallDepth = Math.max(1200, fixedSinkDepth + 1000);
  const selectedBowlColor = bowlColor === "custom"
    ? customBowlColor
    : bowlColorOptions.find((option) => option.id === bowlColor)?.color ?? "#f7f7f5";
  const selectedBowlColorLabel = bowlColor === "custom"
    ? "Custom"
    : bowlColorOptions.find((option) => option.id === bowlColor)?.label ?? "White";
  const selectedDrainFinish = drainFinishOptions.find((option) => option.id === drainFinish) ?? drainFinishOptions[0];
  const quantityPrice = bowlCount * 140;
  const buildTotal = 350 + quantityPrice + 150;
  const total = buildTotal + selectedDrainFinish.price;

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
      && historyState.present.customBowlColor === currentSnapshot.customBowlColor
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
    setCustomBowlColor(snapshot.customBowlColor);
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
    setConfig((previous) => ({
      ...previous,
      dimensions: {
        ...previous.dimensions,
        [field]: value,
      },
    }));
  };

  const updateMountingType = (mountingType: MountingType) => {
    setConfig((previous) => ({
      ...previous,
      mountingType,
    }));
  };

  const updateOverallWidth = (value: number) => {
    setConfig((previous) => {
      const bowlWidth = previous.bowl?.size.length ?? 500;
      const count = countByQuantity[previous.bowlQuantity ?? "single"];
      const fixedWidth = count * bowlWidth;
      const left = Number(previous.dimensions.L2 ?? 0);
      const right = Number(previous.dimensions.L3 ?? 0);
      const [nextLeft, nextRight] = distributeOffsetDelta(value, fixedWidth, left, right);

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
      const [nextFront, nextRear] = distributeOffsetDelta(value, bowlDepth, front, rear);

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

  const selectedSinkName = config.bowl?.name ?? "UB-01";
  const productTitle = `Undermount Sink ${selectedSinkName}`;

  return (
    <main className="builder-page">
      <aside className="left-rail">
        <section className="brand-card">
          <img src="/Badeloft Logo.jpg" alt="Badeloft" />
          <span>Powered by <strong>Ikarus Delta</strong></span>
        </section>

        <section className="bowl-library">
          <h1>{productTitle}</h1>
          <h2>Bowl Type</h2>
          <div className="bowl-tile-grid">
            {bowlOptions.map((bowl) => (
              <Card
                key={bowl.id}
                image={bowl.image}
                label={bowl.name}
                selected={config.bowl?.id === bowl.id}
                onClick={() => updateBowl(bowl)}
              />
            ))}
          </div>
        </section>
      </aside>

      <section className="stage">
        <div className="stage-canvas">
          <Dimension3DPreview key={viewerResetToken} bowlColor={selectedBowlColor} bowlFinish={bowlFinish} config={config} drainFinish={drainFinish} />
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
          <button
            aria-label="Sink view selected"
            aria-pressed="true"
            className="toolbar-icon toolbar-product"
            onClick={() => setViewerResetToken((token) => token + 1)}
            title="Sink view"
            type="button"
          >
            <Bath size={24} />
          </button>
          <button className="toolbar-ar" disabled title="AR preview is not available in this prototype" type="button">
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
                  <span>Sink Type</span>
                  <strong>{config.mountingType === "wall_mounted" ? "Wall Mounted" : "Countertop"} · $350</strong>
                </div>
                <div className="sink-type-card-grid">
                  <Tooltip label="+$350">
                    <Card
                      image="/assets/wall-mounted.png"
                      label="Wall Mounted"
                      selected={config.mountingType === "wall_mounted"}
                      onClick={() => updateMountingType("wall_mounted")}
                    />
                  </Tooltip>
                  <Tooltip label="+$350">
                    <Card
                      image="/assets/countertop.png"
                      label="Countertop"
                      selected={config.mountingType === "countertop"}
                      onClick={() => updateMountingType("countertop")}
                    />
                  </Tooltip>
                </div>
              </section>

              <section className="control-section">
                <div className="section-heading">
                  <span>Number Of Bowls</span>
                  <strong>{quantityOptions.find((item) => item.quantity === config.bowlQuantity)?.price}</strong>
                </div>
                <div className="segmented-control">
                  <div
                    className="segmented-indicator"
                    style={{
                      transform: `translateX(${selectedQuantityIndex * 100}%)`,
                      width: "33.333%",
                    }}
                  />
                  {quantityOptions.map((item) => (
                    <Tooltip key={item.quantity} label={item.price}>
                      <button
                        className={config.bowlQuantity === item.quantity ? "active" : ""}
                        onClick={() => updateQuantity(item.quantity)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    </Tooltip>
                  ))}
                </div>

                {bowlCount > 1 && (
                  <div style={{ marginTop: "24px" }}>
                    <SliderRow
                      label="Spacing"
                      max={600}
                      min={0}
                      value={Number(config.dimensions.bowlSpacing ?? 0)}
                      onChange={(value) => updateDimension("bowlSpacing", value)}
                    />
                  </div>
                )}
              </section>

              <section className="control-section">
                <div className="section-heading dimensions-section-heading">
                  <span>Sink Dimensions (Overall)</span>
                  <strong>+$150</strong>
                </div>
                <SliderRow label="Length" max={maximumOverallWidth} min={fixedSinkWidth} value={Number(dims.L ?? 0)} onChange={updateOverallWidth} />
                <SliderRow label="Width" max={maximumOverallDepth} min={fixedSinkDepth} value={Number(dims.D ?? 0)} onChange={updateOverallDepth} />
                <SliderRow label="Height" max={500} min={80} value={Number(dims.H ?? 0)} onChange={(value) => updateDimension("H", value)} />
              </section>

              <section className="control-section side-spacing-section">
                <span className="section-label">Side Spacing</span>
                <SpacingDiagram
                  left={Number(config.dimensions.L2 ?? 0)}
                  right={Number(config.dimensions.L3 ?? 0)}
                  rear={Number(config.dimensions.D2 ?? 0)}
                />
                <div className="offset-grid">
                  <OffsetControl label="Left" value={Number(config.dimensions.L2 ?? 0)} onChange={(value) => updateDimension("L2", value)} />
                  <OffsetControl label="Right" value={Number(config.dimensions.L3 ?? 0)} onChange={(value) => updateDimension("L3", value)} />
                  <OffsetControl label="Front" value={Number(config.dimensions.D3 ?? 0)} onChange={(value) => updateDimension("D3", value)} />
                  <OffsetControl label="Rear" value={Number(config.dimensions.D2 ?? 0)} onChange={(value) => updateDimension("D2", value)} />
                </div>
              </section>

            </>
          ) : (
            <div className="finish-menu">
              <section className="finish-section">
                <span className="section-label">Bowl Finish</span>
                <div className="finish-segmented" role="group" aria-label="Bowl finish">
                  <div
                    className="segmented-indicator"
                    style={{
                      transform: `translateX(${selectedFinishIndex * 100}%)`,
                      width: "50%",
                    }}
                  />
                  {(["glossy", "matte"] as const).map((finish) => (
                    <button
                      aria-pressed={bowlFinish === finish}
                      className={bowlFinish === finish ? "active" : ""}
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
                  <span>Bowl Color</span>
                  <strong>{selectedBowlColorLabel}</strong>
                </div>
                <div className="finish-swatch-grid">
                  {bowlColorOptions.map((option) => (
                    <button
                      aria-pressed={bowlColor === option.id}
                      className={`finish-option ${bowlColor === option.id ? "selected" : ""}`}
                      key={option.id}
                      onClick={() => setBowlColor(option.id)}
                      type="button"
                    >
                      <span className={`finish-sample bowl-color-${option.id}`} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                  <label className={`finish-option custom-color-option ${bowlColor === "custom" ? "selected" : ""}`}>
                    <span className="finish-sample custom-color-sample">
                      <input
                        aria-label="Choose a custom bowl color"
                        onChange={(event) => {
                          setCustomBowlColor(event.target.value);
                          setBowlColor("custom");
                        }}
                        type="color"
                        value={customBowlColor}
                      />
                      <ColorWheelIcon />
                    </span>
                    <span>Custom</span>
                  </label>
                </div>
              </section>

              <section className="finish-section">
                <div className="section-heading">
                  <span>Drain Cap Finish</span>
                  <strong>{selectedDrainFinish.label}{selectedDrainFinish.price > 0 ? ` · +$${selectedDrainFinish.price}` : ""}</strong>
                </div>
                <div className="finish-swatch-grid drain-finish-grid">
                  {drainFinishOptions.map((option) => {
                    const buttonElement = (
                      <button
                        aria-pressed={drainFinish === option.id}
                        className={`finish-option ${drainFinish === option.id ? "selected" : ""}`}
                        onClick={() => setDrainFinish(option.id)}
                        type="button"
                      >
                        <span className={`finish-sample drain-${option.id}`} />
                        <span>{option.label}</span>
                      </button>
                    );

                    return option.price > 0 ? (
                      <Tooltip key={option.id} label={`+$${option.price}`}>
                        {buttonElement}
                      </Tooltip>
                    ) : (
                      <div key={option.id} className="finish-option-wrapper">
                        {buttonElement}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="cart-footer">
          <div className="cart-total"><span>Total:</span><strong>${total}</strong></div>
          <div className="cart-actions">
            <button className="summary-button" onClick={() => setShowBuildSummary(true)} type="button">Build Summary</button>
            <button className="add-cart-button" type="button">Add to Cart</button>
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
              <SummaryItem label="Undermount Bowl" onEdit={() => editSummarySection("build")} price={350} />
              <SummaryItem label={`Number of Bowls: ${bowlCount}`} onEdit={() => editSummarySection("build")} price={quantityPrice} />
              <SummaryItem label="Dimensions (Overall)" onEdit={() => editSummarySection("build")} price={150}>
                <span className="summary-dimensions">{Math.round(Number(dims.L ?? 0) / 25.4)}in <b>x</b> {Math.round(Number(dims.D ?? 0) / 25.4)}in <b>x</b> {Math.round(Number(dims.H ?? 0) / 25.4)}in</span>
              </SummaryItem>
              <SummaryItem label={`${selectedBowlColorLabel} ${bowlFinish} Bowl`} onEdit={() => editSummarySection("finish")} price={0} />
              <SummaryItem label={`${selectedDrainFinish.label} Drain Cap`} onEdit={() => editSummarySection("finish")} price={selectedDrainFinish.price} />
            </div>

            <div className="summary-spacer" />

            <label className="summary-instructions">
              <span>Special Instructions</span>
              <textarea
                onChange={(event) => setSpecialInstructions(event.target.value)}
                placeholder="I would like to get my sink in a custom red wine finish"
                value={specialInstructions}
              />
            </label>
          </div>

          <div className="summary-footer">
            <div className="summary-totals">
              <div><span>Build</span><strong>${buildTotal}</strong></div>
              <div><span>Finish</span><strong>${selectedDrainFinish.price}</strong></div>
              <div className="summary-grand-total"><span>Total</span><strong>${total}</strong></div>
            </div>

            <button className="summary-add-cart" type="button">Add to Cart</button>
          </div>
        </section>
      </div>
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
        <span>${price}</span>
        <button aria-label={`Edit ${label}`} onClick={onEdit} title={`Edit ${label}`} type="button">
          <img src="/assets/edit.svg" alt="Edit" style={{ width: "16px", height: "16px" }} />
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
  const valInInches = Math.round(value / 25.4);
  const minInInches = Math.round(min / 25.4);
  const maxInInches = Math.round(max / 25.4);

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
    <label className="slider-row">
      <span>{label}</span>
      <div>
        <input max={maxInInches} min={minInInches} style={sliderStyle} type="range" value={sliderValue} onChange={handleSliderChange} />
        <NumericInput ariaLabel={`${label} in inches`} max={maxInInches} min={minInInches} onCommit={handleNumericCommit} suffix="in" value={valInInches} />
      </div>
    </label>
  );
}

interface OffsetControlProps {
  label: string;
  onChange: (value: number) => void;
  value: number;
}

function OffsetControl({ label, onChange, value }: OffsetControlProps) {
  const valInInches = Math.round(value / 25.4);
  const minInInches = 0;
  const maxInInches = 48; // 1200 mm / 25.4 is ~47.2, so 48in max is perfect!

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inchVal = Number(event.target.value);
    onChange(inchVal * 25.4);
  };

  const handleNumericCommit = (inchVal: number) => {
    onChange(inchVal * 25.4);
  };

  const sliderValue = clamp(valInInches, minInInches, maxInInches);
  const progress = (sliderValue / maxInInches) * 100;
  const sliderStyle = { "--range-progress": `${progress}%` } as CSSProperties;

  return (
    <label className="offset-control">
      <span>{label}</span>
      <input
        max={maxInInches}
        min={minInInches}
        style={sliderStyle}
        type="range"
        value={sliderValue}
        onChange={handleSliderChange}
      />
      <NumericInput
        ariaLabel={`${label} offset in inches`}
        max={maxInInches}
        min={minInInches}
        onCommit={handleNumericCommit}
        suffix="in"
        value={valInInches}
      />
    </label>
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
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const nextValue = clamp(parsed, min, max);
    setDraft(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <span className="number-input-shell">
      <input
        aria-label={ariaLabel}
        className="number-box"
        inputMode="numeric"
        max={max}
        min={min}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        step="0.5"
        type="number"
        value={draft}
      />
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </span>
  );
}

export default App;
