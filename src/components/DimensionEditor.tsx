import type { SinkConfiguration, SinkDimensions } from "../types/configurator";
import { editableDepthFields, editableLengthFields, mergedDimensions } from "../utils/calculations";
import type { ValidationError } from "../utils/validation";
import { firstErrorFor } from "../utils/validation";
import { Dimension3DPreview } from "./Dimension3DPreview";
import { DimensionDiagram } from "./DimensionDiagram";

interface DimensionEditorProps {
  config: SinkConfiguration;
  errors: ValidationError[];
  onDimensionChange: (field: keyof SinkDimensions, value: number) => void;
}

export function DimensionEditor({ config, errors, onDimensionChange }: DimensionEditorProps) {
  const dims = mergedDimensions(config);
  const editableFields: Array<keyof SinkDimensions> = [...editableLengthFields(), ...editableDepthFields()];

  return (
    <section className="dimension-workspace">
      <Dimension3DPreview config={config} />
      <aside className="dimension-2d-panel">
        <div className="dimension-2d-header">
          <span>2D View</span>
          <strong>Edit dimensions</strong>
        </div>
        <DimensionDiagram config={config} errors={errors} />
        <div className="form-panel">
          <div className="calculated-strip">
            <span>Overall L <strong>{dims.L ?? "-"} mm</strong></span>
            <span>Overall D <strong>{dims.D ?? "-"} mm</strong></span>
            <span>Height <strong>{dims.H ?? "-"} mm</strong></span>
          </div>
          <div className="locked-grid">
            <div><span>L1</span><strong>{dims.L1 ?? "-"} mm</strong><small>standard, cannot customize</small></div>
            <div><span>D1</span><strong>{dims.D1 ?? "-"} mm</strong><small>standard, cannot customize</small></div>
          </div>
          <div className="field-grid">
            {editableFields.map((field) => {
              const error = firstErrorFor(errors, field);
              return (
                <label className={`field ${error ? "invalid" : ""}`} key={field}>
                  <span>{field} <em>(mm)</em></span>
                  <input min="0" type="number" value={config.dimensions[field] ?? ""} onChange={(event) => onDimensionChange(field, Number(event.target.value))} />
                  {error && <small>{error}</small>}
                </label>
              );
            })}
          </div>
        </div>
      </aside>
    </section>
  );
}
