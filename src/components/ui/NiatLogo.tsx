/**
 * NIAT shield mark — inline SVG (crisp at any size, no image asset, themable).
 * A maroon shield split into four quadrants: N · I / A · T.
 */
export function NiatLogo({
  size = 40,
  className,
  fill = "#7A0016",
}: {
  size?: number;
  className?: string;
  fill?: string;
}) {
  return (
    <svg
      width={size}
      height={size * 1.16}
      viewBox="0 0 100 116"
      className={className}
      role="img"
      aria-label="NIAT"
    >
      <path
        d="M8 10 Q8 5 13 5 H87 Q92 5 92 10 V64 Q92 92 50 112 Q8 92 8 64 Z"
        fill={fill}
      />
      {/* dividing cross */}
      <line x1="50" y1="7" x2="50" y2="94" stroke="#fff" strokeWidth="3.5" />
      <line x1="11" y1="52" x2="89" y2="52" stroke="#fff" strokeWidth="3.5" />
      {/* quadrant letters */}
      <g fill="#fff" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize="30" textAnchor="middle">
        <text x="30" y="40">N</text>
        <text x="70" y="40">I</text>
        <text x="30" y="83">A</text>
        <text x="70" y="83">T</text>
      </g>
    </svg>
  );
}
