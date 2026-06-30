import type { SinkConfiguration, SinkDimensions } from "../types/configurator";

export function calculateLength(config: SinkConfiguration): number | null {
  const { bowl, bowlQuantity, dimensions } = config;
  if (!bowl || !bowlQuantity) return null;

  const L1 = bowl.size.length;
  const count = bowlQuantity === "triple" ? 3 : bowlQuantity === "double" ? 2 : 1;
  return count * L1 + Number(dimensions.L2 || 0) + Number(dimensions.L3 || 0);
}

export function calculateDepth(config: SinkConfiguration): number | null {
  const { bowl, dimensions } = config;
  if (!bowl) return null;
  return bowl.size.depth + Number(dimensions.D2 || 0) + Number(dimensions.D3 || 0);
}

export function lockedDimensions(config: SinkConfiguration): SinkDimensions {
  return {
    L1: config.bowl?.size.length,
    D1: config.bowl?.size.depth,
    H: config.dimensions.H ?? config.bowl?.size.height,
  };
}

export function editableLengthFields(): Array<keyof SinkDimensions> {
  return ["L2", "L3"];
}

export function editableDepthFields(): Array<keyof SinkDimensions> {
  return ["D2", "D3"];
}

export function mergedDimensions(config: SinkConfiguration): SinkDimensions {
  return {
    ...config.dimensions,
    ...lockedDimensions(config),
    L: calculateLength(config) ?? config.dimensions.L,
    D: calculateDepth(config) ?? config.dimensions.D,
  };
}
