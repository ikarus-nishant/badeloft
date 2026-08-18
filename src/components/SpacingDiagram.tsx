interface SpacingDiagramProps {
  left: number; // in mm
  right: number; // in mm
  rear: number; // in mm
}

export function SpacingDiagram({ left, right, rear }: SpacingDiagramProps) {
  const leftInches = Math.round(left / 25.4);
  const rightInches = Math.round(right / 25.4);
  const rearInches = Math.round(rear / 25.4);

  return (
    <div className="spacing-diagram-container">
      <svg viewBox="0 0 400 220" className="spacing-diagram-svg">
        {/* Countertop Outer Box */}
        <rect
          x="40"
          y="20"
          width="320"
          height="180"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="1.5"
        />

        {/* Basin Cutout Lines */}
        {/* Left Cutout Line */}
        <line x1="80" y1="60" x2="80" y2="200" stroke="#1a1a1a" strokeWidth="1.5" />
        {/* Right Cutout Line */}
        <line x1="320" y1="60" x2="320" y2="200" stroke="#1a1a1a" strokeWidth="1.5" />
        {/* Top Cutout Line */}
        <line x1="80" y1="60" x2="320" y2="60" stroke="#1a1a1a" strokeWidth="1.5" />

        {/* Inner Rim Bevel Lines */}
        <line x1="83" y1="63" x2="83" y2="200" stroke="#dcdbd7" strokeWidth="1" />
        <line x1="317" y1="63" x2="317" y2="200" stroke="#dcdbd7" strokeWidth="1" />
        <line x1="83" y1="63" x2="317" y2="63" stroke="#dcdbd7" strokeWidth="1" />

        {/* Miter Lines at top corners */}
        <line x1="80" y1="60" x2="83" y2="63" stroke="#1a1a1a" strokeWidth="1" />
        <line x1="320" y1="60" x2="317" y2="63" stroke="#1a1a1a" strokeWidth="1" />

        {/* Left Spacing Measurement Line */}
        <line x1="40" y1="110" x2="80" y2="110" stroke="#1a1a1a" strokeWidth="1" />
        {/* Left Arrowheads */}
        <path d="M 45 106 L 40 110 L 45 114 M 75 106 L 80 110 L 75 114" fill="none" stroke="#1a1a1a" strokeWidth="1" />
        {/* Left Label */}
        <text
          x="60"
          y="114"
          transform="rotate(-90 60 110)"
          textAnchor="middle"
          fontSize="14"
          fontWeight="500"
          fill="#1a1a1a"
          stroke="#ffffff"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {leftInches}in
        </text>

        {/* Right Spacing Measurement Line */}
        <line x1="320" y1="110" x2="360" y2="110" stroke="#1a1a1a" strokeWidth="1" />
        {/* Right Arrowheads */}
        <path d="M 325 106 L 320 110 L 325 114 M 355 106 L 360 110 L 355 114" fill="none" stroke="#1a1a1a" strokeWidth="1" />
        {/* Right Label */}
        <text
          x="340"
          y="114"
          transform="rotate(-90 340 110)"
          textAnchor="middle"
          fontSize="14"
          fontWeight="500"
          fill="#1a1a1a"
          stroke="#ffffff"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {rightInches}in
        </text>

        {/* Top (Rear) Spacing Measurement Line */}
        <line x1="200" y1="20" x2="200" y2="60" stroke="#1a1a1a" strokeWidth="1" />
        {/* Top Arrowheads */}
        <path d="M 196 25 L 200 20 L 204 25 M 196 55 L 200 60 L 204 55" fill="none" stroke="#1a1a1a" strokeWidth="1" />
        {/* Top Label */}
        <text
          x="200"
          y="45"
          textAnchor="middle"
          fontSize="14"
          fontWeight="500"
          fill="#1a1a1a"
          stroke="#ffffff"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {rearInches}in
        </text>
      </svg>
    </div>
  );
}

export default SpacingDiagram;
