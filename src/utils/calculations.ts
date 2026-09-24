import type { SinkConfiguration, SinkDimensions } from "../types/configurator";

export const BASE_MAX_OVERALL_WIDTH = 3000; // 118.11 inches
export const EXTRA_WIDTH_ALLOWANCE = 15 * 25.4; // 15 inches (381 mm)
export const MIN_LEFT_RIGHT = 100; // 3.94 inches
export const MIN_SPACING = 100; // 3.94 inches

// 25% price reduction applied to all sinks across the configurator
export const SINK_PRICE_DISCOUNT = 0.25;
export const SINK_RETAIL_MARKUP = 1.7 * (1 - SINK_PRICE_DISCOUNT); // 1.7 * 0.75 = 1.275

export function getMinOverallWidth(config: SinkConfiguration): number {
  const { bowl, bowlQuantity } = config;
  const bowlLength = bowl?.size.length ?? 500;
  const count = bowlQuantity === "triple" ? 3 : bowlQuantity === "double" ? 2 : 1;
  const gaps = count > 1 ? count - 1 : 0;
  return (count * bowlLength) + (gaps * MIN_SPACING) + (MIN_LEFT_RIGHT * 2);
}

export function getMaxOverallWidth(config: SinkConfiguration): number {
  const minRequired = getMinOverallWidth(config);
  return Math.max(BASE_MAX_OVERALL_WIDTH, minRequired + EXTRA_WIDTH_ALLOWANCE);
}

export function calculateLength(config: SinkConfiguration): number | null {
  const { bowl, bowlQuantity, dimensions } = config;
  if (!bowl || !bowlQuantity) return null;

  const L1 = bowl.size.length;
  const count = bowlQuantity === "triple" ? 3 : bowlQuantity === "double" ? 2 : 1;
  const gap = count > 1 ? Math.max(MIN_SPACING, Number(dimensions.bowlSpacing || MIN_SPACING)) : 0;
  const left = Math.max(MIN_LEFT_RIGHT, Number(dimensions.L2 || MIN_LEFT_RIGHT));
  const right = Math.max(MIN_LEFT_RIGHT, Number(dimensions.L3 || MIN_LEFT_RIGHT));
  const total = count * L1 + (count - 1) * gap + left + right;
  const maxAllowed = getMaxOverallWidth(config);
  return Math.min(maxAllowed, total);
}

export function calculateDepth(config: SinkConfiguration): number | null {
  const { bowl, dimensions } = config;
  if (!bowl) return null;
  const rear = Math.max(50, Number(dimensions.D2 || 50));
  const front = Math.max(50, Number(dimensions.D3 || 50));
  const total = bowl.size.depth + rear + front;
  return Math.min(600, total);
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
    bowlSpacing: config.bowlQuantity && config.bowlQuantity !== "single" ? Math.max(100, Number(config.dimensions.bowlSpacing || 100)) : (config.dimensions.bowlSpacing ?? 0),
  };
}

export interface FormattedFraction {
  whole: number;
  fractionNumerator?: number;
  fractionDenominator?: number;
  fractionText?: string;
  formattedText: string;
}

export function toFractionalInches(mm: number, precision: number = 16): FormattedFraction {
  if (isNaN(mm) || mm <= 0) {
    return { whole: 0, formattedText: "0 in" };
  }
  const totalInches = mm / 25.4;
  let whole = Math.floor(totalInches);
  const remainder = totalInches - whole;
  let fraction = Math.round(remainder * precision);

  if (fraction === precision) {
    whole += 1;
    fraction = 0;
  }

  if (fraction === 0) {
    return {
      whole,
      formattedText: `${whole} in`,
    };
  }

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(fraction, precision);
  const num = fraction / divisor;
  const den = precision / divisor;
  const fractionText = `${num}/${den}`;

  return {
    whole,
    fractionNumerator: num,
    fractionDenominator: den,
    fractionText,
    formattedText: whole === 0 ? `${fractionText} in` : `${whole} ${fractionText} in`,
  };
}

