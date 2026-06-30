import type { SinkDimensions, SinkType } from "../types/configurator";

interface SizeInputStepProps {
  dimensions: SinkDimensions;
  sinkType?: SinkType;
  onChange: (field: keyof SinkDimensions, value: number) => void;
}

export function SizeInputStep({ dimensions, sinkType, onChange }: SizeInputStepProps) {
  return (
    <section className="form-panel compact-panel">
      {sinkType === "WT_04" && <p className="reference-note">WT-04-A reference: standard size is 1000 x 500 x 125 mm. The PDF example customizes the length, then confirms L2 and L3.</p>}
      {sinkType !== "WT_04" && <p className="reference-note neutral">Confirm the size you want: length, width, and height.</p>}
      <div className="field-grid">
        {(["L", "D", "H"] as Array<keyof SinkDimensions>).map((field) => (
          <label className="field" key={field}>
            <span>{field === "D" ? "Depth / Width D" : field === "L" ? "Length L" : "Height H"}</span>
            <input min="1" type="number" value={dimensions[field] ?? ""} onChange={(event) => onChange(field, Number(event.target.value))} />
            <small>mm</small>
          </label>
        ))}
      </div>
    </section>
  );
}
