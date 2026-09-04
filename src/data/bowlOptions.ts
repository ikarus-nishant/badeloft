import type { BowlOption } from "../types/configurator";
import { assetUrl } from "../integrations/storefront";

export const bowlOptions: BowlOption[] = [
  { id: "UB-01", name: "UB-01", image: assetUrl("bowls/UB-01.png"), size: { length: 600, depth: 410, height: 155 }, innerSize: { length: 550, depth: 360 }, basePrice: 340, colorPrice: 100 },
  { id: "UB-02", name: "UB-02", image: assetUrl("bowls/UB-02.png"), size: { length: 600, depth: 410, height: 155 }, innerSize: { length: 550, depth: 360 }, basePrice: 340, colorPrice: 100 },
  { id: "UB-03", name: "UB-03", image: assetUrl("bowls/UB-03.png"), size: { length: 510, depth: 430, height: 165 }, innerSize: { length: 460, depth: 380 }, basePrice: 340, colorPrice: 100 },
  { id: "UB-04-M", name: "UB-04-M", image: assetUrl("bowls/UB-04-M.png"), size: { length: 500, depth: 410, height: 135 }, innerSize: { length: 460, depth: 370 }, basePrice: 340, colorPrice: 100 },
  { id: "UB-04-L", name: "UB-04-L", image: assetUrl("bowls/UB-04-L.png"), size: { length: 640, depth: 410, height: 135 }, innerSize: { length: 600, depth: 370 }, basePrice: 360, colorPrice: 100 },
  { id: "UB-04-RL", name: "UB-04-RL", image: assetUrl("bowls/UB-04-RL.png"), size: { length: 640, depth: 410, height: 150 }, innerSize: { length: 600, depth: 370 }, basePrice: 360, colorPrice: 100 },
  { id: "UB-04-LR", name: "UB-04-LR", image: assetUrl("bowls/UB-04-LR.png"), size: { length: 640, depth: 410, height: 150 }, innerSize: { length: 600, depth: 370 }, basePrice: 360, colorPrice: 100 },
  { id: "UB-04-32", name: "UB-04-32", image: assetUrl("bowls/UB-04-32.png"), size: { length: 827, depth: 410, height: 155 }, innerSize: { length: 787, depth: 370 }, basePrice: 380, colorPrice: 100 },
  { id: "UB-04-40", name: "UB-04-40", image: assetUrl("bowls/UB-04-40.png"), size: { length: 1030, depth: 410, height: 155 }, innerSize: { length: 990, depth: 370 }, basePrice: 400, colorPrice: 100 },
  { id: "UB-04-XL", name: "UB-04-XL", image: assetUrl("bowls/UB-04-XL.png"), size: { length: 1240, depth: 410, height: 135 }, innerSize: { length: 1200, depth: 370 }, basePrice: 490, colorPrice: 100 },
  { id: "UB-04-XXL", name: "UB-04-XXL", image: assetUrl("bowls/UB-04-XL.png"), size: { length: 1524, depth: 410, height: 160 }, innerSize: { length: 1464, depth: 360 }, basePrice: 790, colorPrice: 100 },
  { id: "UB-05-M", name: "UB-05-M", image: assetUrl("bowls/UB-05-M.png"), size: { length: 600, depth: 415, height: 155 }, innerSize: { length: 550, depth: 360 }, basePrice: 340, colorPrice: 100 },
  { id: "UB-05-L", name: "UB-05-L", image: assetUrl("bowls/UB-05-L.png"), size: { length: 800, depth: 425, height: 180 }, innerSize: { length: 740, depth: 365 }, basePrice: 390, colorPrice: 130 },
  { id: "UB-05-XL", name: "UB-05-XL", image: assetUrl("bowls/UB-05-XL.png"), size: { length: 1000, depth: 425, height: 180 }, innerSize: { length: 940, depth: 365 }, basePrice: 490, colorPrice: 100 },
];
