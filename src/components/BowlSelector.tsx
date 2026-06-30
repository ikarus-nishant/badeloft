import { bowlOptions } from "../data/bowlOptions";
import type { BowlOption } from "../types/configurator";

interface BowlSelectorProps {
  selected?: BowlOption;
  onSelect: (bowl: BowlOption) => void;
}

export function BowlSelector({ selected, onSelect }: BowlSelectorProps) {
  return (
    <section className="bowl-grid">
      {bowlOptions.map((bowl) => (
        <button className={`bowl-card ${selected?.id === bowl.id ? "selected" : ""}`} key={bowl.id} onClick={() => onSelect(bowl)} type="button">
          <span className="bowl-image" aria-hidden="true">
            {bowl.image ? <img src={bowl.image} alt="" /> : <span />}
          </span>
          <strong>{bowl.name}</strong>
          <span>Outer: {bowl.size.length} x {bowl.size.depth} x {bowl.size.height} mm</span>
          <span>Inner: {bowl.innerSize.length} x {bowl.innerSize.depth} mm</span>
        </button>
      ))}
    </section>
  );
}
