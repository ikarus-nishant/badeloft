import { RotateCcw, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Dimension3DPreview } from "./components/Dimension3DPreview";
import { DimensionDiagram } from "./components/DimensionDiagram";
import { bowlOptions } from "./data/bowlOptions";
import type { BowlOption, BowlQuantity, SinkConfiguration, SinkDimensions } from "./types/configurator";
import { calculateDepth, calculateLength, mergedDimensions } from "./utils/calculations";

const selectedStartBowl = bowlOptions.find((bowl) => bowl.id === "UB-04-M") ?? bowlOptions[0];

const initialConfig: SinkConfiguration = {
  bowl: selectedStartBowl,
  bowlQuantity: "double",
  mountingType: "countertop",
  sinkType: "CUSTOM_DOUBLE",
  dimensions: {
    L2: 250,
    L3: 250,
    D2: 300,
    D3: 30,
    H: selectedStartBowl.size.height,
  },
};

const sinkTypes = [
  { id: "freestanding", label: "Freestanding", price: "$350", image: "/bowls/UB-05-M.jpg" },
  { id: "wall", label: "Wall Mounted", price: "$350", image: "/bowls/UB-04-L.jpg" },
  { id: "countertop", label: "Countertop", price: "$350", image: "/bowls/UB-04-M.jpg" },
  { id: "undermount", label: "Undermount", price: "$350", image: "/bowls/UB-01.jpg" },
];

const quantityOptions: Array<{ label: string; quantity: BowlQuantity; price: string }> = [
  { label: "1", quantity: "single", price: "+$0" },
  { label: "2", quantity: "double", price: "+$280" },
  { label: "3", quantity: "triple", price: "+$420" },
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

function App() {
  const [config, setConfig] = useState<SinkConfiguration>(initialConfig);
  const [activeBuildMode, setActiveBuildMode] = useState<"build" | "finish">("build");
  const [stageMode, setStageMode] = useState<"3d" | "2d">("3d");
  const dims = useMemo(() => mergedDimensions(config), [config]);
  const total = useMemo(() => {
    const quantityPrice = config.bowlQuantity === "double" ? 280 : config.bowlQuantity === "triple" ? 420 : 0;
    return 350 + quantityPrice + 150;
  }, [config.bowlQuantity]);

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

  const updateOverallLength = (value: number) => {
    setConfig((previous) => {
      const bowlLength = previous.bowl?.size.length ?? 500;
      const count = countByQuantity[previous.bowlQuantity ?? "single"];
      const left = Number(previous.dimensions.L2 ?? 0);
      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          L3: Math.max(0, value - count * bowlLength - left),
        },
      };
    });
  };

  const updateOverallDepth = (value: number) => {
    setConfig((previous) => {
      const bowlDepth = previous.bowl?.size.depth ?? 410;
      const rear = Number(previous.dimensions.D2 ?? 0);
      return {
        ...previous,
        dimensions: {
          ...previous.dimensions,
          D3: Math.max(0, value - bowlDepth - rear),
        },
      };
    });
  };

  const productTitle = "Countertop Sink WB-02";

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
              <button
                className={`bowl-tile ${config.bowl?.id === bowl.id ? "selected" : ""}`}
                key={bowl.id}
                onClick={() => updateBowl(bowl)}
                type="button"
              >
                <img src={bowl.image} alt={bowl.name} />
                <span>{bowl.name}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="stage">
        <div className="view-mode-toggle" aria-label="View mode">
          <button className={stageMode === "3d" ? "active" : ""} onClick={() => setStageMode("3d")} type="button">3D</button>
          <button className={stageMode === "2d" ? "active" : ""} onClick={() => setStageMode("2d")} type="button">2D</button>
        </div>
        <div className="stage-canvas">
          {stageMode === "3d" ? (
            <Dimension3DPreview config={config} />
          ) : (
            <div className="stage-2d-view">
              <DimensionDiagram config={config} errors={[]} />
            </div>
          )}
        </div>
        <div className="history-controls" aria-label="History controls">
          <button type="button" aria-label="Undo"><RotateCcw size={34} /></button>
          <button type="button" aria-label="Redo"><RotateCw size={34} /></button>
        </div>
      </section>

      <aside className="right-panel">
        <div className="build-tabs" role="tablist" aria-label="Configurator mode">
          <button className={activeBuildMode === "build" ? "active" : ""} onClick={() => setActiveBuildMode("build")} type="button">Build</button>
          <button className={activeBuildMode === "finish" ? "active" : ""} onClick={() => setActiveBuildMode("finish")} type="button">Finish</button>
        </div>

        <div className="panel-scroll">
          <section className="control-section sink-type-section">
            <div className="section-heading">
              <span>Sink Type</span>
              <strong>Countertop · $350</strong>
            </div>
            <div className="sink-type-grid">
              {sinkTypes.map((type) => (
                <button
                  className={`sink-type-card ${type.id === "countertop" ? "selected" : ""}`}
                  key={type.id}
                  type="button"
                >
                  <img src={type.image} alt="" />
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span>Number Of Bowls</span>
              <strong>{quantityOptions.find((item) => item.quantity === config.bowlQuantity)?.price}</strong>
            </div>
            <div className="segmented-control">
              {quantityOptions.map((item) => (
                <button
                  className={config.bowlQuantity === item.quantity ? "active" : ""}
                  key={item.quantity}
                  onClick={() => updateQuantity(item.quantity)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section className="control-section">
            <span className="section-label">Bowl Alignment</span>
            <div className="segmented-control">
              <button type="button">Left</button>
              <button className="active" type="button">Center</button>
              <button type="button">Right</button>
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span>Dimensions (Overall)</span>
              <strong>+$150</strong>
            </div>
            <SliderRow label="Length" max={2400} min={600} value={Number(dims.L ?? 0)} onChange={updateOverallLength} />
            <SliderRow label="Width" max={1200} min={350} value={Number(dims.D ?? 0)} onChange={updateOverallDepth} />
            <SliderRow label="Height" max={500} min={80} value={Number(dims.H ?? 0)} onChange={(value) => updateDimension("H", value)} />
          </section>

          <section className="control-section dimension-card-section">
            <span className="section-label">Dimensions (Overall)</span>
            <div className="mini-diagram">
              <DimensionDiagram config={config} errors={[]} />
            </div>
            <div className="offset-grid">
              <OffsetControl label="Left" value={Number(config.dimensions.L2 ?? 0)} onChange={(value) => updateDimension("L2", value)} />
              <OffsetControl label="Right" selected value={Number(config.dimensions.L3 ?? 0)} onChange={(value) => updateDimension("L3", value)} />
              <OffsetControl label="Front" value={Number(config.dimensions.D3 ?? 0)} onChange={(value) => updateDimension("D3", value)} />
              <OffsetControl label="Rear" value={Number(config.dimensions.D2 ?? 0)} onChange={(value) => updateDimension("D2", value)} />
            </div>
          </section>
        </div>

        <footer className="cart-footer">
          <div><span>Total</span><strong>${total}</strong></div>
          <button type="button">Add to Cart <span>+</span></button>
        </footer>
      </aside>
    </main>
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
  const sliderValue = clamp(value, min, max);

  return (
    <label className="slider-row">
      <span>{label}</span>
      <div>
        <input max={max} min={min} type="range" value={sliderValue} onChange={(event) => onChange(Number(event.target.value))} />
        <strong>{Math.round(value)}mm</strong>
      </div>
    </label>
  );
}

interface OffsetControlProps {
  label: string;
  onChange: (value: number) => void;
  selected?: boolean;
  value: number;
}

function OffsetControl({ label, onChange, selected, value }: OffsetControlProps) {
  return (
    <label className={`offset-control ${selected ? "selected" : ""}`}>
      <span>{label}</span>
      <input max="500" min="0" type="range" value={clamp(value, 0, 500)} onChange={(event) => onChange(Number(event.target.value))} />
      <input className="number-box" min="0" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default App;
