import type { SinkType } from "../types/configurator";

const sinkTypes: Array<{ id: SinkType; title: string; description: string }> = [
  { id: "WT_04", title: "WT-04 Series Sink", description: "Uses the selected bowl shape with fixed L1 and D1; edit L2, L3, D2, and D3." },
  { id: "CUSTOM_SINGLE", title: "Custom Single Sink", description: "One fixed bowl shape with customizable side and depth spacing." },
  { id: "CUSTOM_DOUBLE", title: "Custom Double Sink", description: "Two fixed bowls; edit L2, L3, D2, and D3." },
  { id: "CUSTOM_TRIPLE", title: "Custom Triple Sink", description: "Three fixed bowls; edit L2, L3, D2, and D3." },
];

interface SinkTypeSelectorProps {
  selected?: SinkType;
  onSelect: (sinkType: SinkType) => void;
}

export function SinkTypeSelector({ selected, onSelect }: SinkTypeSelectorProps) {
  return (
    <section className="option-grid">
      {sinkTypes.map((sinkType) => (
        <button
          className={`choice-card ${selected === sinkType.id ? "selected" : ""}`}
          key={sinkType.id}
          onClick={() => onSelect(sinkType.id)}
          type="button"
        >
          <strong>{sinkType.title}</strong>
          <span>{sinkType.description}</span>
        </button>
      ))}
    </section>
  );
}
