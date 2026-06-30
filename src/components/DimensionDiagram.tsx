import type { SinkConfiguration, SinkDimensions } from "../types/configurator";
import type { ValidationError } from "../utils/validation";
import { mergedDimensions } from "../utils/calculations";

interface DimensionDiagramProps {
  config: SinkConfiguration;
  errors: ValidationError[];
}

export function DimensionDiagram({ config, errors }: DimensionDiagramProps) {
  const dims = mergedDimensions(config);
  const quantity = config.bowlQuantity ?? "single";
  const count = quantity === "triple" ? 3 : quantity === "double" ? 2 : 1;
  const hasError = (field: keyof SinkDimensions) => errors.some((error) => error.field === field);

  const canvasWidth = 760;
  const canvasHeight = 420;
  const body = { x: 72, y: 86, width: 610, height: 238 };
  const depthTotal = Number(dims.D || 1);
  const lengthTotal = Number(dims.L || 1);
  const scaleX = body.width / Math.max(lengthTotal, 1);
  const scaleY = body.height / Math.max(depthTotal, 1);

  const d2 = Number(dims.D2 || 0) * scaleY;
  const d3 = Number(dims.D3 || 0) * scaleY;
  const bowlDepth = Number(dims.D1 || 0) * scaleY;
  const l2 = Number(dims.L2 || 0) * scaleX;
  const l3 = Number(dims.L3 || 0) * scaleX;
  const bowlWidth = Number(dims.L1 || 0) * scaleX;
  const internalGap = count > 1 ? Math.max(0, (body.width - l2 - l3 - count * bowlWidth) / (count - 1)) : 0;

  const bowlRects = Array.from({ length: count }, (_, index) => ({
    x: body.x + l2 + index * (bowlWidth + internalGap),
    y: body.y + d2,
    width: bowlWidth,
    height: bowlDepth,
  }));

  const firstBowl = bowlRects[0] ?? body;
  const lastBowl = bowlRects[bowlRects.length - 1] ?? firstBowl;
  const l2Y = firstBowl.y + firstBowl.height / 2;
  const l3Y = lastBowl.y + lastBowl.height / 2;
  const d2X = firstBowl.x + firstBowl.width / 2;
  const d3X = d2X;
  const d1X = body.x + body.width + 34;
  const l1Y = body.y + body.height + 24;
  const l1Start = firstBowl.x;
  const l1End = lastBowl.x + lastBowl.width;
  const labelColor = (field: keyof SinkDimensions) => (hasError(field) ? "#9f1f1f" : "#111111");
  return (
    <div className="diagram-shell">
      <svg viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} role="img" aria-label="Top view sink dimension diagram">
        <defs>
          <pattern id="locked-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 8 L8 0" stroke="#b9bec7" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect className="sink-body" x={body.x} y={body.y} width={body.width} height={body.height} rx="8" />
        {bowlRects.map((rect, index) => (
          <g key={index}>
            <rect className="bowl-outer" x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="10" />
            <rect className="bowl-inner" x={rect.x + 14} y={rect.y + 14} width={Math.max(rect.width - 28, 20)} height={Math.max(rect.height - 28, 20)} rx="8" />
          </g>
        ))}
        <rect x={bowlRects[0]?.x ?? body.x} y={bowlRects[0]?.y ?? body.y} width={bowlWidth} height={bowlDepth} fill="url(#locked-hatch)" opacity="0.35" />

        <line className="dimension-line" x1={body.x} y1="48" x2={body.x + body.width} y2="48" />
        <text className="overall-label" x={body.x + body.width / 2} y="36">L {dims.L ?? "-"} mm</text>
        <line className="dimension-line" x1="36" y1={body.y} x2="36" y2={body.y + body.height} />
        <text className="overall-label vertical" x="22" y={body.y + body.height / 2}>D {dims.D ?? "-"} mm</text>

        <g className="custom-dim" style={{ color: labelColor("L2") }}>
          <line x1={body.x} y1={l2Y} x2={firstBowl.x} y2={l2Y} />
          <line className="graduation-tick" x1={body.x} y1={l2Y - 10} x2={body.x} y2={l2Y + 10} />
          <line className="graduation-tick" x1={firstBowl.x} y1={l2Y - 10} x2={firstBowl.x} y2={l2Y + 10} />
          <text x={body.x + Math.max(l2 / 2, 24)} y={l2Y - 24}>L2</text>
        </g>
        <g className="custom-dim" style={{ color: labelColor("L3") }}>
          <line x1={lastBowl.x + lastBowl.width} y1={l3Y} x2={body.x + body.width} y2={l3Y} />
          <line className="graduation-tick" x1={lastBowl.x + lastBowl.width} y1={l3Y - 10} x2={lastBowl.x + lastBowl.width} y2={l3Y + 10} />
          <line className="graduation-tick" x1={body.x + body.width} y1={l3Y - 10} x2={body.x + body.width} y2={l3Y + 10} />
          <text x={body.x + body.width - Math.max(l3 / 2, 36)} y={l3Y - 24}>L3</text>
        </g>
        <g className="custom-dim locked-dim">
          <path d={`M ${l1Start} ${l1Y + 4} V ${l1Y + 18} M ${l1Start} ${l1Y + 11} C ${l1Start + 130} ${l1Y + 13}, ${l1End - 130} ${l1Y + 13}, ${l1End} ${l1Y + 11} M ${l1End} ${l1Y + 4} V ${l1Y + 18}`} />
          <text x={(l1Start + l1End) / 2} y={l1Y + 28}>L1</text>
        </g>
        <g className="custom-dim" style={{ color: labelColor("D2") }}>
          <line x1={d2X} y1={body.y} x2={d2X} y2={firstBowl.y} />
          <line className="graduation-tick" x1={d2X - 10} y1={body.y} x2={d2X + 10} y2={body.y} />
          <line className="graduation-tick" x1={d2X - 10} y1={firstBowl.y} x2={d2X + 10} y2={firstBowl.y} />
          <text x={d2X + 22} y={body.y + Math.max(d2 / 2, 18)}>D2</text>
        </g>
        <g className="custom-dim" style={{ color: labelColor("D3") }}>
          <line x1={d3X} y1={firstBowl.y + firstBowl.height} x2={d3X} y2={body.y + body.height} />
          <line className="graduation-tick" x1={d3X - 10} y1={firstBowl.y + firstBowl.height} x2={d3X + 10} y2={firstBowl.y + firstBowl.height} />
          <line className="graduation-tick" x1={d3X - 10} y1={body.y + body.height} x2={d3X + 10} y2={body.y + body.height} />
          <text x={d3X + 22} y={body.y + body.height - Math.max(d3 / 2, 12)}>D3</text>
        </g>
        <g className="custom-dim locked-dim">
          <path d={`M ${d1X - 10} ${firstBowl.y} H ${d1X + 10} M ${d1X} ${firstBowl.y} V ${firstBowl.y + firstBowl.height} M ${d1X - 10} ${firstBowl.y + firstBowl.height} H ${d1X + 10}`} />
          <text x={d1X + 22} y={firstBowl.y + firstBowl.height / 2 + 6}>D1</text>
        </g>
      </svg>
    </div>
  );
}
