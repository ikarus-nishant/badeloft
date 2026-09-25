export const STOREFRONT_CONFIG_ELEMENT_ID = "badeloft-sink-config";
export const ADD_TO_CART_EVENT = "badeloft:sink:add-to-cart";
export const CLOSE_EVENT = "badeloft:sink:close";

export interface StorefrontConfig {
  assetBaseUrl: string;
  modelBaseUrl: string;
  productHandle: string;
  currency: string;
}

export interface SinkCartPayload {
  version: 1;
  productHandle: string;
  currency: string;
  price: {
    build: number;
    finish: number;
    total: number;
  };
  selection: {
    bowl: {
      count: number;
      modelId: string;
      modelName: string;
      quantityId: "single" | "double" | "triple";
      shape: "oval" | "ramp" | "trough";
      size: "S" | "M" | "L" | "XL" | "XXL";
    };
    installation: {
      id: "countertop" | "wall_mounted";
      label: string;
      sinkMount: "undermount";
    };
    color: {
      hex: string;
      id: "white" | "black" | "gray";
      label: string;
    };
    finish: "glossy" | "matte";
    drainCapFinish?: "chrome" | "black" | "brushed-nickel" | "glossy-white" | "matte-white";
    drainEdge: "left" | "rear" | "right";
    dimensionsInches: {
      overall: {
        width: number;
        depth: number;
        height: number;
      };
      bowl: {
        width: number;
        depth: number;
        height: number;
        innerWidth: number;
        innerDepth: number;
      };
      offsets: {
        left: number;
        right: number;
        front: number;
        rear: number;
        betweenBowls: number;
      };
      codes: {
        L: number;
        L1: number;
        L2: number;
        L3: number;
        D: number;
        D1: number;
        D2: number;
        D3: number;
        H: number;
        bowlSpacing: number;
      };
    };
  };
  specialInstructions: string;
}

const defaultConfig: StorefrontConfig = {
  assetBaseUrl: "/",
  modelBaseUrl: "/models-new",
  productHandle: "custom-undermount-sink",
  currency: "USD",
};

function readStorefrontConfig(): StorefrontConfig {
  const element = document.getElementById(STOREFRONT_CONFIG_ELEMENT_ID);
  if (!element?.textContent?.trim()) return defaultConfig;

  try {
    const supplied = JSON.parse(element.textContent) as Partial<StorefrontConfig>;
    return {
      assetBaseUrl: typeof supplied.assetBaseUrl === "string" ? supplied.assetBaseUrl : defaultConfig.assetBaseUrl,
      modelBaseUrl: typeof supplied.modelBaseUrl === "string" ? supplied.modelBaseUrl : defaultConfig.modelBaseUrl,
      productHandle: typeof supplied.productHandle === "string" ? supplied.productHandle : defaultConfig.productHandle,
      currency: typeof supplied.currency === "string" ? supplied.currency.toUpperCase() : defaultConfig.currency,
    };
  } catch {
    return defaultConfig;
  }
}

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const relativePath = path.replace(/^\/+/, "");
  return base ? `${base}/${relativePath}` : `/${relativePath}`;
}

export const storefrontConfig = readStorefrontConfig();

export function assetUrl(path: string) {
  return joinUrl(storefrontConfig.assetBaseUrl, path);
}

export function modelUrl(path: string) {
  return joinUrl(storefrontConfig.modelBaseUrl, path);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    currency: storefrontConfig.currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

export function applyStorefrontAssetVariables() {
  const root = document.documentElement;
  const images = {
    "--drain-chrome-image": assetUrl("assets/chrome.png"),
    "--drain-black-image": assetUrl("assets/black.png"),
    "--drain-nickel-image": assetUrl("assets/nickel.png"),
    "--drain-glossy-image": assetUrl("assets/glossy.png"),
    "--drain-matte-image": assetUrl("assets/matte.png"),
  };

  Object.entries(images).forEach(([name, url]) => {
    root.style.setProperty(name, `url(${JSON.stringify(url)})`);
  });
}

export function handoffAddToCart(payload: SinkCartPayload) {
  console.log("[Badeloft Sink Configurator] Add to cart payload:", payload);
  window.dispatchEvent(new CustomEvent<SinkCartPayload>(ADD_TO_CART_EVENT, { detail: payload }));
}
