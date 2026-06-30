import { bowlOptions } from "../data/bowlOptions";
import type { BowlOption } from "../types/configurator";

const shapeIds = ["UB-01", "UB-02", "UB-03", "UB-04-M", "UB-05-M"];

const bowlShapes = shapeIds
  .map((id) => bowlOptions.find((bowl) => bowl.id === id))
  .filter((bowl): bowl is BowlOption => Boolean(bowl));

function isSelectedShape(selected: BowlOption | undefined, shape: BowlOption) {
  if (!selected) return false;
  if (shape.id === "UB-05-M") return selected.id.startsWith("UB-05");
  return selected.id === shape.id;
}

function displayName(shape: BowlOption) {
  return shape.id === "UB-05-M" ? "UB-05" : shape.name;
}

export interface BowlShapeSelectorProps {
  selected?: BowlOption;
  onSelect: (bowl: BowlOption) => void;
}

export function BowlShapeSelector({ selected, onSelect }: BowlShapeSelectorProps) {
  return (
    <section className="shape-step" aria-label="Choose bowl shape">
      <div className="shape-intro">
        <h3>Choose Bowl Shape</h3>
      </div>
      <div className="shape-grid">
        {bowlShapes.map((shape) => (
          <button
            className={`shape-card ${isSelectedShape(selected, shape) ? "selected" : ""}`}
            key={shape.id}
            onClick={() => onSelect(shape)}
            type="button"
          >
            <span className="shape-image" aria-hidden="true">
              {shape.image ? <img src={shape.image} alt="" /> : <span />}
            </span>
            <strong>{displayName(shape)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
