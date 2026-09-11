# Badeloft Sink Configurator: Complete Pricing Logic Specification

> **Audience:** Shopify Engineering, Merchandising & E-Commerce Teams  
> **Purpose:** Functional pricing specification of all formulas, dimensional calculations, option surcharges, markups, and end-to-end examples implemented in the Badeloft sink configurator.

---

## Executive Summary

The Badeloft sink configurator calculates prices dynamically based on **continuous linear millimeter dimensions**, **bowl count**, **mounting type**, **color selection**, and **drain cap finish**.

The final price is composed of two primary sub-totals:
1. **Build Subtotal:** Encompasses the physical sink body (width, depth, height), additional bowl units, packaging, width surcharges, and mounting hardware, adjusted by factory and retail markups.
2. **Finish Subtotal:** Encompasses bowl color premiums and drain cap finish upgrades, adjusted by a retail markup.

$$\mathbf{Total\ Price} = \mathbf{Build\ Subtotal} + \mathbf{Finish\ Subtotal}$$

All customer-facing prices are calculated and finalized in whole USD dollars ($).

---

## 1. Complete Pricing Calculation Chain

The complete execution flow from user selections to the final total price is:

```text
User Selections:
  ├─ Bowl Model (outer length, outer depth, outer height, color rate)
  ├─ Bowl Quantity (Single, Double, or Triple) → Bowl Count = 1, 2, or 3
  ├─ Custom Offsets (Left Deck, Right Deck, Rear Deck, Front Apron, Height, Bowl Spacing)
  ├─ Mounting Type (Wall Mounted or Countertop)
  ├─ Bowl Color (White, Black, or Gray)
  ├─ Bowl Surface Finish (Glossy or Matte)
  └─ Drain Cap Finish (Chrome, Black, Brushed Nickel, Glossy White, or Matte White)
            ↓
Physical Dimension Synthesis:
  ├─ Overall Width  = clamp(Count × Bowl Length + (Count - 1) × Spacing + Left + Right)
  ├─ Overall Depth  = clamp(Bowl Depth + Rear Deck + Front Apron, Min Depth, 600 mm)
  └─ Overall Height = clamp(Selected Height, Bowl Min Height, 254 mm)
            ↓
Linear Meter Conversion:
  ├─ Width in Meters  = Overall Width (mm) / 1000
  ├─ Depth in Meters  = Overall Depth (mm) / 1000
  └─ Height in Meters = Overall Height (mm) / 1000
            ↓
Factory Cost Calculation:
  ├─ Base Width Cost  = Width in Meters × $210
  ├─ Base Depth Cost  = Depth in Meters × $210
  ├─ Base Height Cost = Height in Meters × $210
  ├─ Extra Bowl Cost  = (Bowl Count > 1 ? Bowl Count - 1 : 0) × $80
  └─ Packaging Cost   = $50 (Flat)
  ── Factory Cost = Base Width + Base Depth + Base Height + Extra Bowl Cost + Packaging
            ↓
Factory Markup (1.85x) & Build Surcharges:
  ├─ Factory Markup Total = Math.round(Factory Cost × 1.85)
  ├─ Width Surcharge      = (Overall Width / 25.4 ≥ 40.00 inches) ? $50 : $0
  └─ Mounting Surcharge   = Wall Mounted ? (Count = 1: $150 | Count = 2: $200 | Count = 3: $250) : $0
  ── Base Build Subtotal  = Factory Markup Total + Width Surcharge + Mounting Surcharge
            ↓
Retail Markup (1.7x) for Build Subtotal:
  └─ Build Subtotal = Math.round(Base Build Subtotal × 1.7)
            ↓
Finish Subtotal Calculation:
  ├─ Bowl Color Cost   = White: $0 | Black/Gray: $100 (Model UB-05-L: $130)
  ├─ Drain Cap Cost    = Ramp Sink: $0 (Chrome) | Non-Ramp: Chrome $0, All Other Finishes $29
  ── Base Finish Total = Bowl Color Cost + Drain Cap Cost
  └─ Finish Subtotal   = Math.round(Base Finish Total × 1.7)
            ↓
Final Grand Total:
  └─ Total Price = Build Subtotal + Finish Subtotal
```

---

## 2. Bowl Type & Model Pricing Table

The sink configurator supports 14 sink models across 3 distinct basin shapes:

| Model ID | Model Name | Basin Shape | Configurator Category | Outer Size (L×D×H mm) | Inner Basin (L×D mm) | Color Base Cost | Pricing Rule |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| `UB-01` | UB-01 | Rectangle | Trough | 600 × 410 × 155 | 550 × 360 | $100 | Linear dimension dynamic formula ($210/m) |
| `UB-02` | UB-02 | Oval | Round / Oval | 600 × 410 × 155 | 550 × 360 | $100 | Linear dimension dynamic formula ($210/m) |
| `UB-03` | UB-03 | Oval | Round / Oval | 510 × 430 × 165 | 460 × 380 | $100 | Linear dimension dynamic formula ($210/m) |
| `UB-04-M` | UB-04-M | Rectangle | Ramp (Tilt) | 500 × 410 × 135 | 460 × 370 | $100 | Linear formula ($210/m); Drain locked to Chrome ($0) |
| `UB-04-L` | UB-04-L | Rectangle | Ramp (Tilt) | 640 × 410 × 135 | 600 × 370 | $100 | Linear formula ($210/m); Drain locked to Chrome ($0) |
| `UB-04-RL`| UB-04-RL| Rectangle | Ramp (Tilt) | 640 × 410 × 150 | 600 × 370 | $100 | Linear formula ($210/m); Left drain, Chrome ($0) |
| `UB-04-LR`| UB-04-LR| Rectangle | Ramp (Tilt) | 640 × 410 × 150 | 600 × 370 | $100 | Linear formula ($210/m); Right drain, Chrome ($0) |
| `UB-04-32`| UB-04-32| Rectangle | Ramp (Tilt) | 827 × 410 × 155 | 787 × 370 | $100 | Linear formula ($210/m); Drain locked to Chrome ($0) |
| `UB-04-40`| UB-04-40| Rectangle | Ramp (Tilt) | 1030 × 410 × 155| 990 × 370 | $100 | Linear formula ($210/m); Drain locked to Chrome ($0) |
| `UB-04-XL`| UB-04-XL| Rectangle | Ramp (Tilt) | 1240 × 410 × 135| 1200 × 370 | $100 | Linear formula ($210/m); Drain locked to Chrome ($0) |
| `UB-04-XXL`| UB-04-XXL| Rectangle| Ramp (Tilt) | 1524 × 410 × 160| 1464 × 360 | $100 | Linear formula ($210/m); Drain locked to Chrome ($0) |
| `UB-05-M` | UB-05-M | Rectangle | Trough | 600 × 415 × 155 | 550 × 360 | $100 | Linear dimension dynamic formula ($210/m) |
| `UB-05-L` | UB-05-L | Rectangle | Trough | 800 × 425 × 180 | 740 × 365 | **$130** | Linear formula ($210/m); Special Color Base Cost $130 |
| `UB-05-XL`| UB-05-XL| Rectangle | Trough | 1000 × 425 × 180| 940 × 365 | $100 | Linear dimension dynamic formula ($210/m) |

---

## 3. Dimensions Pricing

Pricing is calculated continuously based on **linear millimeter dimensions** rather than discrete size brackets or square-inch surface area.

$$\text{Factory Rate} = \$210\text{ per linear meter} = \$0.210\text{ per millimeter}$$

### Configurable Dimensions Breakdown

| Dimension | Role / Description | Default Value | Min Value | Max Value | Price Impact | Formula / Pricing Effect |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **L1** | Outer Bowl Length | Fixed per model | Model size | Model size | **Yes** | Expands overall width |
| **L2** | Left Deck Offset | 131 mm (approx.) | 100 mm (~3.94 in) | Dynamic limit | **Yes** | Expands overall width |
| **L3** | Right Deck Offset| 131 mm (approx.) | 100 mm (~3.94 in) | Dynamic limit | **Yes** | Expands overall width |
| **D1** | Outer Bowl Depth | Fixed per model | Model depth | Model depth | **Yes** | Expands overall depth |
| **D2** | Rear Faucet Deck | 100 mm (~3.94 in) | 50 mm (~1.97 in) | `600 - D1 - 50` mm | **Yes** | Expands overall depth |
| **D3** | Front Apron Deck | 50 mm (~1.97 in) | 50 mm (~1.97 in) | `600 - D1 - 50` mm | **Yes** | Expands overall depth |
| **H** | Apron Height | Model height | Model height | 254 mm (10.0 in) | **Yes** | `(H / 1000) × $210` |
| **Bowl Spacing**| Gap between basins | 100 mm (~3.94 in) | 100 mm (~3.94 in) | Dynamic limit | **Yes** | Expands width for multi-bowl |
| **Overall Width (L)**| Total Sink Width | Calculated | Min based on bowls | `max(3000, min + 381)` | **Yes** | `(L / 1000) × $210` + $50 if L>=40 inches |
| **Overall Depth (D)**| Total Sink Depth | Calculated | `D1 + 100 mm` | 600 mm (~23.62 in) | **Yes** | `(D / 1000) × $210` |

### Effective Retail Dimension Rates
Because dimensions pass through the 1.85x Factory Markup and 1.7x Retail Markup:
- **Retail Rate per Linear Meter:** $\$210 \times 1.85 \times 1.7 \approx \$660.45\text{/meter} \approx \$16.78\text{/inch}$
- **Width Surcharge ($\ge 40$ in):** $\$50 \times 1.7 = \mathbf{\$85\text{ retail}}$

---

## 4. Surface Finish Pricing

| Surface Finish Selection | Base Additional Cost | Multiplier | Retail Added Price | Conditions |
| :--- | :---: | :---: | :---: | :--- |
| **Glossy** | **$0** | 1.0x | **+$0** | Included free (standard finish) |
| **Matte** | **$0** | 1.0x | **+$0** | Included free (no surcharge) |

---

## 5. Colour Pricing

| Colour Option | Base Surcharge | Retail Multiplier | Retail Added Price (`Math.round(base × 1.7)`) | Conditions |
| :--- | :---: | :---: | :---: | :--- |
| **White** | **$0** | 1.7x | **+$0** | Standard included finish |
| **Black** | **$100** | 1.7x | **+$170** | Standard rate for all models except `UB-05-L` |
| **Black (`UB-05-L`)** | **$130** | 1.7x | **+$221** | Model `UB-05-L` uses $130 base surcharge |
| **Gray** | **$100** | 1.7x | **+$170** | Standard rate for all models except `UB-05-L` |
| **Gray (`UB-05-L`)** | **$130** | 1.7x | **+$221** | Model `UB-05-L` uses $130 base surcharge |

---

## 6. Drain Cap & Drain Edge Pricing

### Drain Cap Finishes

| Option Selection | Base Cost | Retail Added Price (`Math.round(base × 1.7)`) | Conditions |
| :--- | :---: | :---: | :--- |
| **Chrome** | **$0** | **+$0** | Standard included drain finish |
| **Black** | **$29** | **+$49** | Trough and Oval models only |
| **Brushed Nickel** | **$29** | **+$49** | Trough and Oval models only |
| **Glossy White** | **$29** | **+$49** | Trough and Oval models only |
| **Matte White** | **$29** | **+$49** | Trough and Oval models only |

### Special Ramp Sink Rule
For all Ramp models (`UB-04` series):
- Drain finish is **permanently locked to Chrome ($0)**.
- Alternative drain finishes cannot be selected.
- Drain finish surcharge is always **$0**.

### Drain Edge Orientation
- Left Drain (`UB-04-RL`), Right Drain (`UB-04-LR`), Rear Drain (All other models): **+$0** (Orientation is included at no extra cost).

---

## 7. Installation / Mounting Pricing

| Mounting Option | Base Cost | Retail Multiplier | Retail Added Price (`Math.round(base × 1.7)`) | Conditions |
| :--- | :---: | :---: | :---: | :--- |
| **Countertop** | **$0** | 1.7x | **+$0** | Free. Vanity / counter resting. |
| **Wall Mounted (Single Bowl)** | **$150** | 1.7x | **+$255** | Single basin configuration |
| **Wall Mounted (Double Bowl)** | **$200** | 1.7x | **+$340** | Double basin configuration |
| **Wall Mounted (Triple Bowl)** | **$250** | 1.7x | **+$425** | Triple basin configuration |

---

## 8. Multiple Bowl Configuration Pricing

Multi-bowl configurations increase the price through three cumulative factors:

1. **Extra Bowl Base Fee:**
   - Single Bowl: **$0**
   - Double Bowl: **+$80** base fee (effective retail increase $\approx \mathbf{+\$252}$)
   - Triple Bowl: **+$160** base fee (effective retail increase $\approx \mathbf{+\$503}$)
2. **Width Expansion:**
   Each additional bowl adds the basin's length (500–1524 mm) plus spacing (minimum 100 mm) to overall width, which scales with the linear rate ($210/meter).
3. **Escalating Wall Mount Bracket:**
   Wall mounting increases by +$50 base for a second bowl and +$100 base for a third bowl.

| Configuration | Extra Bowl Base Cost | Wall Mount Base Cost | Typical Min Overall Width |
| :--- | :---: | :---: | :--- |
| **Single Bowl** | $0 | $150 (Retail +$255) | `Bowl Length + 200 mm` |
| **Double Bowl** | $80 | $200 (Retail +$340) | `2 × Bowl Length + 100 + 200 mm` |
| **Triple Bowl** | $160 | $250 (Retail +$425) | `3 × Bowl Length + 200 + 200 mm` |

---

## 9. Multipliers & Internal Adjustments

| Parameter / Factor | Value | Applied To | Order of Application |
| :--- | :---: | :--- | :---: |
| **Linear Dimension Rate** | `$210 / meter` | Width, Depth, and Height in meters | 1 |
| **Extra Bowl Fee** | `$80 / bowl` | Each bowl beyond the first | 1 |
| **Packaging Flat Fee** | `$50` | Flat fee added to factory cost | 1 |
| **Factory Markup** | `1.85x` | Multiplied by Factory Cost, then rounded | 2 |
| **Width Surcharge** | `$50` | Added to Base Build if Width $\ge 40.00$ in | 3 |
| **Mounting Surcharge**| `$150` / `$200` / `$250` | Added to Base Build if Wall Mounted | 3 |
| **Retail Markup (Build)**| `1.7x` | Multiplied by Base Build Subtotal, then rounded | 4 |
| **Color Base Surcharge** | `$100` (or `$130`) | Added to Base Finish for Black/Gray | 1 (Finish) |
| **Drain Cap Surcharge** | `$29` | Added to Base Finish for premium finish | 1 (Finish) |
| **Retail Markup (Finish)**| `1.7x` | Multiplied by Base Finish Subtotal, then rounded | 2 (Finish) |

---

## 10. Stacking Rules & Final Calculation Formula

The pricing system uses **two independently marked-up cost buckets**:

```text
// 1. Factory Cost (Linear Dimensions + Multi-bowl + Packaging)
Factory Cost = ((Overall Width + Overall Depth + Overall Height) / 1000) × 210
             + (Bowl Count > 1 ? (Bowl Count - 1) × 80 : 0)
             + 50

// 2. Build Subtotal (Factory Markup + Surcharges + Retail Markup)
Base Build Subtotal = Math.round(Factory Cost × 1.85)
                    + (Width in Inches ≥ 40.00 ? 50 : 0)
                    + (Wall Mounted ? (Count = 1: 150 | Count = 2: 200 | Count = 3: 250) : 0)

Build Subtotal = Math.round(Base Build Subtotal × 1.7)

// 3. Finish Subtotal (Color + Drain Cap + Retail Markup)
Base Finish Subtotal = Bowl Color Base Cost + Drain Cap Base Cost

Finish Subtotal = Math.round(Base Finish Subtotal × 1.7)

// 4. Final Total Price
Total Price = Build Subtotal + Finish Subtotal
```

---

## 11. Conditional Rules Matrix

| Condition | Effect on Price | Base Value | Effective Retail Price |
| :--- | :--- | :---: | :---: |
| `Mounting = Wall Mounted` (Single Bowl) | Increase Build | +$150 | **+$255** |
| `Mounting = Wall Mounted` (Double Bowl) | Increase Build | +$200 | **+$340** |
| `Mounting = Wall Mounted` (Triple Bowl) | Increase Build | +$250 | **+$425** |
| `Mounting = Countertop` | No Charge | $0 | **$0** |
| `Width ≥ 40.00 inches` | Increase Build | +$50 | **+$85** |
| `Width < 40.00 inches` | No Charge | $0 | **$0** |
| `Bowl Count = 2` | Increase Factory | +$80 | **+$252** *(approx)* |
| `Bowl Count = 3` | Increase Factory | +$160 | **+$503** *(approx)* |
| `Color = White` | No Charge | $0 | **$0** |
| `Color in [Black, Gray]` (Standard Models) | Increase Finish | +$100 | **+$170** |
| `Color in [Black, Gray]` (`UB-05-L`) | Increase Finish | +$130 | **+$221** |
| `Ramp Sink Selected` | Force Chrome Drain | $0 | **$0** |
| `Non-Ramp Sink` + `Drain = Chrome` | No Charge | $0 | **$0** |
| `Non-Ramp Sink` + `Drain in [Black, Nickel, White]` | Increase Finish | +$29 | **+$49** |
| `Surface Finish in [Glossy, Matte]` | No Charge | $0 | **$0** |

---

## 12. Rounding Rules

1. **Factory Markup Rounding:** `Math.round(Factory Cost × 1.85)` is rounded to the nearest integer prior to adding installation and width surcharges.
2. **Width Threshold Check:** Width is evaluated in inches to 2 decimal places: `Number((Width_mm / 25.4).toFixed(2))`.
3. **Subtotal Rounding:**
   - `Build Subtotal = Math.round(Base Build Subtotal × 1.7)` (nearest integer USD)
   - `Finish Subtotal = Math.round(Base Finish Subtotal × 1.7)` (nearest integer USD)
4. **Final Total:** Sum of whole-dollar integers (`Build Subtotal + Finish Subtotal`).
5. **No Cents:** The configurator produces clean whole-dollar figures with zero decimals.

---

## 13. Currency

- **Currency:** `USD` ($).
- **Presentation:** Displayed directly to the customer in the UI header, configuration drawer, and passed to checkout in whole dollars.

---

## 14. 5 End-to-End Verified Pricing Examples

### Example 1: Default Ramp Sink (`UB-04-M`)
- **Model:** `UB-04-M` Ramp (500 × 410 × 135 mm)
- **Dimensions:** 762 mm W (30.0 in) × 560 mm D (22.05 in) × 135 mm H (5.31 in)
- **Bowl Count:** 1 | **Mounting:** Wall Mounted | **Color:** White | **Finish:** Glossy | **Drain:** Chrome
- **Step-by-Step Calculation:**
  1. Dimension sum: $0.762 + 0.560 + 0.135 = 1.457\text{ m}$
  2. Dimension cost: $1.457 \times \$210 = \$305.97$
  3. Factory Cost: $\$305.97 + \$50\text{ (packing)} = \$355.97$
  4. Factory Markup: $\text{Math.round}(355.97 \times 1.85) = \$659$
  5. Surcharges: Width < 40 in ($0) + Wall Mount ($150) = $\$150$
  6. Base Build Subtotal: $\$659 + \$150 = \$809$
  7. **Build Subtotal:** $\text{Math.round}(809 \times 1.7) = \mathbf{\$1,375}$
  8. **Finish Subtotal:** White ($0) + Chrome ($0) = $\mathbf{\$0}$
  9. **Grand Total:** $\$1,375 + \$0 = \mathbf{\$1,375}$

---

### Example 2: Wide Ramp Sink on Countertop (`UB-04-M`)
- **Model:** `UB-04-M` Ramp (500 × 410 × 135 mm)
- **Dimensions:** 1200 mm W (47.24 in) × 560 mm D (22.05 in) × 135 mm H (5.31 in)
- **Bowl Count:** 1 | **Mounting:** Countertop | **Color:** White | **Finish:** Matte | **Drain:** Chrome
- **Step-by-Step Calculation:**
  1. Dimension sum: $1.200 + 0.560 + 0.135 = 1.895\text{ m}$
  2. Dimension cost: $1.895 \times \$210 = \$397.95$
  3. Factory Cost: $\$397.95 + \$50 = \$447.95$
  4. Factory Markup: $\text{Math.round}(447.95 \times 1.85) = \$829$
  5. Surcharges: Width $\ge 40$ in (+$50) + Countertop ($0) = $\$50$
  6. Base Build Subtotal: $\$829 + \$50 = \$879$
  7. **Build Subtotal:** $\text{Math.round}(879 \times 1.7) = \mathbf{\$1,494}$
  8. **Finish Subtotal:** $\mathbf{\$0}$
  9. **Grand Total:** $\mathbf{\$1,494}$

---

### Example 3: Premium Trough Sink with Color and Upgrade Drain (`UB-01`)
- **Model:** `UB-01` Trough (600 × 410 × 155 mm)
- **Dimensions:** 762 mm W (30.0 in) × 560 mm D (22.05 in) × 155 mm H (6.10 in)
- **Bowl Count:** 1 | **Mounting:** Wall Mounted | **Color:** Black (`colorPrice: 100`) | **Drain:** Brushed Nickel (`price: 29`)
- **Step-by-Step Calculation:**
  1. Dimension sum: $0.762 + 0.560 + 0.155 = 1.477\text{ m}$
  2. Dimension cost: $1.477 \times \$210 = \$310.17$
  3. Factory Cost: $\$310.17 + \$50 = \$360.17$
  4. Factory Markup: $\text{Math.round}(360.17 \times 1.85) = \$666$
  5. Surcharges: Width < 40 in ($0) + Wall Mount ($150) = $\$150$
  6. Base Build Subtotal: $\$666 + \$150 = \$816$
  7. **Build Subtotal:** $\text{Math.round}(816 \times 1.7) = \mathbf{\$1,387}$
  8. Base Finish Subtotal: $\$100\text{ (black)} + \$29\text{ (nickel)} = \$129$
  9. **Finish Subtotal:** $\text{Math.round}(129 \times 1.7) = \mathbf{\$219}$
  10. **Grand Total:** $\$1,387 + \$219 = \mathbf{\$1,606}$

---

### Example 4: Double Ramp Sink (`UB-04-M`)
- **Model:** `UB-04-M` Ramp (500 × 410 × 135 mm)
- **Dimensions:** 1600 mm W (62.99 in) × 560 mm D (22.05 in) × 135 mm H (5.31 in)
- **Bowl Count:** 2 | **Mounting:** Wall Mounted | **Color:** White | **Finish:** Glossy | **Drain:** Chrome
- **Step-by-Step Calculation:**
  1. Dimension sum: $1.600 + 0.560 + 0.135 = 2.295\text{ m}$
  2. Dimension cost: $2.295 \times \$210 = \$481.95$
  3. Extra Bowl Fee: $(2 - 1) \times \$80 = \$80$
  4. Factory Cost: $\$481.95 + \$80 + \$50 = \$611.95$
  5. Factory Markup: $\text{Math.round}(611.95 \times 1.85) = \$1,132$
  6. Surcharges: Width $\ge 40$ in (+$50) + Wall Mount Double (+$200) = $\$250$
  7. Base Build Subtotal: $\$1,132 + \$250 = \$1,382$
  8. **Build Subtotal:** $\text{Math.round}(1382 \times 1.7) = \mathbf{\$2,349}$
  9. **Finish Subtotal:** $\mathbf{\$0}$
  10. **Grand Total:** $\mathbf{\$2,349}$

---

### Example 5: High-Spec Large Double Trough Sink (`UB-05-L`)
- **Model:** `UB-05-L` Trough (800 × 425 × 180 mm, Special Color Base: $130)
- **Dimensions:** 1800 mm W (70.87 in) × 580 mm D (22.83 in) × 180 mm H (7.09 in)
- **Bowl Count:** 2 | **Mounting:** Wall Mounted | **Color:** Gray (Color Base: $130) | **Drain:** Matte White ($29)
- **Step-by-Step Calculation:**
  1. Dimension sum: $1.800 + 0.580 + 0.180 = 2.560\text{ m}$
  2. Dimension cost: $2.560 \times \$210 = \$537.60$
  3. Extra Bowl Fee: $(2 - 1) \times \$80 = \$80$
  4. Factory Cost: $\$537.60 + \$80 + \$50 = \$667.60$
  5. Factory Markup: $\text{Math.round}(667.60 \times 1.85) = \$1,235$
  6. Surcharges: Width $\ge 40$ in (+$50) + Wall Mount Double (+$200) = $\$250$
  7. Base Build Subtotal: $\$1,235 + \$250 = \$1,485$
  8. **Build Subtotal:** $\text{Math.round}(1485 \times 1.7) = \mathbf{\$2,525}$
  9. Base Finish Subtotal: $\$130\text{ (gray for UB-05-L)} + \$29\text{ (matte white drain)} = \$159$
  10. **Finish Subtotal:** $\text{Math.round}(159 \times 1.7) = \mathbf{\$270}$
  11. **Grand Total:** $\$2,525 + \$270 = \mathbf{\$2,795}$

---

## 15. Pricing Logic Architecture Overview

The configurator architecture separates physical manufacturing costs from retail merchandising markups through four functional layers:

1. **Manufacturing & Material Layer (Linear Dimension Engine):**
   Continuous physical dimensions (length, depth, height) determine the baseline raw material consumption calculated at **$210 per meter** ($0.21/mm). Multi-basin configurations introduce a secondary basin charge of **$80 per additional bowl**, and every custom order includes a baseline **$50 packaging charge**.
2. **Factory-to-Wholesale Multiplier Layer:**
   A standard **1.85x Factory Markup** is applied directly to the aggregated raw manufacturing cost and rounded to the nearest whole integer.
3. **Hardware & Dimensional Surcharges:**
   Hardware items and oversize allowances are injected into the wholesale layer:
   - Oversize surcharge of **$50** for overall widths $\ge 40$ inches.
   - Heavy-duty concealed wall-mount brackets: **$150** (single), **$200** (double), or **$250** (triple).
4. **Retail Transformation Layer:**
   A **1.7x Retail Markup** transforms both the Build bucket and Finish bucket into their final customer-facing retail subtotals, rounding each subtotal to whole dollars.

---

## 16. Shopify Integration & Verification Notes

1. **Customer-Facing Price:** The `price.total` emitted in the checkout payload is the exact customer-facing amount displayed in the configurator.
2. **Verification Strategy:** Shopify can accept `price.total` as the line item price and use the formulas in this document as a server-side cross-check (recommended tolerance of $\pm \$2$ for floating-point variations).
3. **Required Payload Inputs for Verification:**
   - Basin Model ID (to retrieve model height and color base rate)
   - Basin Quantity / Count (1, 2, or 3)
   - Dimensions (Overall Width, Overall Depth, Overall Height)
   - Mounting Type (`wall_mounted` vs `countertop`)
   - Bowl Color (`white`, `black`, `gray`)
   - Drain Cap Finish (`chrome`, `black`, `brushed-nickel`, `glossy-white`, `matte-white`)
4. **Key Verification Nuances:**
   - Separate rounding steps must be preserved: first round after the 1.85x factory multiplier, then round after the 1.7x retail multiplier. Do not merge them into a single 3.145x multiplier.
   - Ramp models always have a $0 drain cap fee (locked to Chrome).
   - Model `UB-05-L` has a base color rate of $130 instead of $100.
