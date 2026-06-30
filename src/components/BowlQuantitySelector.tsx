import type { BowlQuantity } from "../types/configurator";

const quantities: Array<{ id: BowlQuantity; title: string; formula: string }> = [
  { id: "single", title: "Single", formula: "L = L1 + L2 + L3" },
  { id: "double", title: "Double", formula: "L = (2 x L1) + L2 + L3" },
  { id: "triple", title: "Triple", formula: "L = (3 x L1) + L2 + L3" },
];

interface BowlQuantitySelectorProps {
  selected?: BowlQuantity;
  onSelect: (quantity: BowlQuantity) => void;
}

export function BowlQuantitySelector({ selected, onSelect }: BowlQuantitySelectorProps) {
  return (
    <section className="option-grid three">
      {quantities.map((quantity) => (
        <button className={`choice-card ${selected === quantity.id ? "selected" : ""}`} key={quantity.id} onClick={() => onSelect(quantity.id)} type="button">
          <strong>{quantity.title}</strong>
          <span>{quantity.formula}</span>
        </button>
      ))}
    </section>
  );
}
