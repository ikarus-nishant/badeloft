import type { BowlQuantity, MountingType } from "../types/configurator";

interface MountingTypeSelectorProps {
  quantity?: BowlQuantity;
  selected?: MountingType;
  onSelect: (mountingType: MountingType) => void;
}

export function MountingTypeSelector({ quantity, selected, onSelect }: MountingTypeSelectorProps) {
  return (
    <section className="option-grid two">
      <button className={`choice-card ${selected === "wall_mounted" ? "selected" : ""}`} onClick={() => onSelect("wall_mounted")} type="button">
        <strong>Wall mounted</strong>
        <span>{quantity === "double" ? "Requires L2 and L3 bracket spaces of at least 100 mm." : "Applies minimum bracket spacing rules."}</span>
      </button>
      <button className={`choice-card ${selected === "countertop" ? "selected" : ""}`} onClick={() => onSelect("countertop")} type="button">
        <strong>Counter top</strong>
        <span>Bracket spacing rules are not enforced for this mounting type.</span>
      </button>
    </section>
  );
}
