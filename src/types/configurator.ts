export type SinkType = "WT_04" | "CUSTOM_SINGLE" | "CUSTOM_DOUBLE" | "CUSTOM_TRIPLE";

export type BowlQuantity = "single" | "double" | "triple";

export type MountingType = "wall_mounted" | "countertop" | "undermount";

export interface BowlOption {
  id: string;
  name: string;
  image?: string;
  size: {
    length: number;
    depth: number;
    height: number;
  };
  innerSize: {
    length: number;
    depth: number;
  };
}

export interface SinkDimensions {
  L?: number;
  D?: number;
  H?: number;
  L1?: number;
  L2?: number;
  L3?: number;
  D1?: number;
  D2?: number;
  D3?: number;
}

export interface SinkConfiguration {
  sinkType?: SinkType;
  bowl?: BowlOption;
  bowlQuantity?: BowlQuantity;
  mountingType?: MountingType;
  dimensions: SinkDimensions;
}
