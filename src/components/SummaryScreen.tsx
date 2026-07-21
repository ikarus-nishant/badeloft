import type { SinkConfiguration } from "../types/configurator";
import { mergedDimensions } from "../utils/calculations";
import type { ValidationError } from "../utils/validation";

interface SummaryScreenProps {
  config: SinkConfiguration;
  errors: ValidationError[];
  onBack: () => void;
  onSuccess: (message: string) => void;
}

const labels = {
  WT_04: "WT-04 Series Sink",
  CUSTOM_SINGLE: "Custom Single Sink",
  CUSTOM_DOUBLE: "Custom Double Sink",
  CUSTOM_TRIPLE: "Custom Triple Sink",
  wall_mounted: "Wall Mounted",
  countertop: "Countertop",
  undermount: "Undermount",
  single: "Single",
  double: "Double",
  triple: "Triple",
};

export function SummaryScreen({ config, errors, onBack, onSuccess }: SummaryScreenProps) {
  const dims = mergedDimensions(config);
  const valid = errors.length === 0;
  const fields = ["L1", "L2", "L3", "D1", "D2", "D3"] as const;

  return (
    <section className="summary-layout">
      <div className="summary-header">
        <span className={`status-pill ${valid ? "valid" : "invalid"}`}>{valid ? "Valid" : "Needs changes"}</span>
        <h2>{config.sinkType ? labels[config.sinkType] : "Custom Sink"}</h2>
      </div>
      <div className="summary-grid">
        <div><span>Bowl</span><strong>{config.bowl?.name ?? "-"}</strong></div>
        <div><span>Bowl Quantity</span><strong>{config.bowlQuantity ? labels[config.bowlQuantity] : "-"}</strong></div>
        <div><span>Mounting Type</span><strong>{config.mountingType ? labels[config.mountingType] : "-"}</strong></div>
        <div><span>Overall Width</span><strong>{dims.L ?? "-"} mm</strong></div>
        <div><span>Overall Depth</span><strong>{dims.D ?? "-"} mm</strong></div>
        <div><span>Height</span><strong>{dims.H ?? "-"} mm</strong></div>
      </div>
      <div className="dimension-list">
        {fields.filter((field) => dims[field] !== undefined).map((field) => (
          <div key={field}>
            <span>{field}{field === "L1" || field === "D1" ? " locked" : ""}</span>
            <strong>{dims[field]} mm</strong>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="error-box">
          {errors.map((error) => <p key={`${error.field}-${error.message}`}>{error.message}</p>)}
        </div>
      )}
      <div className="summary-actions">
        <button className="secondary-button" onClick={onBack} type="button">Back to Edit</button>
        <button className="secondary-button" onClick={() => onSuccess("Summary downloaded for this prototype.")} type="button">Download Summary</button>
        <button className="primary-button" disabled={!valid} onClick={() => onSuccess("Your configuration has been saved. Our team will contact you with a drawing.")} type="button">Request Drawing</button>
      </div>
    </section>
  );
}
