import type { SinkConfiguration } from "../types/configurator";
import { editableDepthFields, editableLengthFields } from "./calculations";

export interface ValidationError {
  field: string;
  message: string;
}

export function validateConfiguration(config: SinkConfiguration): ValidationError[] {
  const errors: ValidationError[] = [];
  const { bowl, bowlQuantity, mountingType, dimensions } = config;

  if (!config.sinkType) errors.push({ field: "sinkType", message: "Please select a sink type." });
  if (!bowl) errors.push({ field: "bowl", message: "Please select a bowl model." });
  if (!bowlQuantity) errors.push({ field: "bowlQuantity", message: "Please select bowl quantity." });
  if (!mountingType) errors.push({ field: "mountingType", message: "Please select mounting type." });

  [...editableLengthFields(), ...editableDepthFields()].forEach((field) => {
    const value = dimensions[field];
    if (value === undefined || Number.isNaN(value) || value <= 0) {
      errors.push({ field, message: `${field} must be a positive number.` });
    }
  });

  if (!dimensions.L2 || dimensions.L2 < 100) {
    errors.push({ field: "L2", message: "Left offset must be at least 3.94 in (100 mm)." });
  }
  if (!dimensions.L3 || dimensions.L3 < 100) {
    errors.push({ field: "L3", message: "Right offset must be at least 3.94 in (100 mm)." });
  }
  if (bowlQuantity && bowlQuantity !== "single" && (!dimensions.bowlSpacing || dimensions.bowlSpacing < 100)) {
    errors.push({ field: "bowlSpacing", message: "Bowl spacing must be at least 3.94 in (100 mm)." });
  }

  if (!dimensions.D3 || dimensions.D3 < 50) {
    errors.push({ field: "D3", message: "Front offset must be at least 1.9685 in (50 mm)." });
  }
  if (!dimensions.D2 || dimensions.D2 < 50) {
    errors.push({ field: "D2", message: "Rear offset must be at least 1.9685 in (50 mm)." });
  }

  return errors;
}

export function firstErrorFor(errors: ValidationError[], field: string): string | undefined {
  return errors.find((error) => error.field === field)?.message;
}
