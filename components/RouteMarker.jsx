/**
 * RouteMarker
 *
 * SVG map marker for a climbing route with optional variants.
 *
 * Visual structure (cross-section, center → outward):
 *   [center circle r=12, filled with route color]
 *   [4px white gap]
 *   [6px colored ring — variant 1]
 *   [4px white gap]
 *   [6px colored ring — variant 2]
 *   ...
 *
 * @param {string}   color          - Hex color for the main route
 * @param {{ color: string }[]} [variants=[]] - Hex color per variant ring
 */
export function RouteMarker({ color, variants = [] }) {
  const CENTER_R    = 12;  // px — radius of the center filled circle
  const RING_STROKE = 6;   // px — stroke width of each variant ring
  const GAP         = 4;   // px — white gap between each concentric element
  const PADDING     = 2;   // px — breathing room around the outermost edge

  const N = variants.length;

  // Outer edge of the last ring (or center circle when N=0)
  const outerR = CENTER_R + N * (GAP + RING_STROKE);
  const totalR = outerR + PADDING;
  const size   = totalR * 2;
  const cx     = totalR;
  const cy     = totalR;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {/* ── Center circle ─────────────────────────────────── */}
      <circle cx={cx} cy={cy} r={CENTER_R} fill={color} />

      {/* ── Variant rings ─────────────────────────────────── */}
      {variants.map((variant, i) => {
        // White gap ring: its stroke is centered exactly on the boundary
        // between the previous element and this ring.
        //   center = CENTER_R + GAP/2 + i*(GAP + RING_STROKE)
        //          = 14 + 10*i
        const gapR  = CENTER_R + GAP / 2 + i * (GAP + RING_STROKE);

        // Colored ring: centered in the middle of its stroke band.
        //   center = CENTER_R + GAP + RING_STROKE/2 + i*(GAP + RING_STROKE)
        //          = 19 + 10*i
        const ringR = CENTER_R + GAP + RING_STROKE / 2 + i * (GAP + RING_STROKE);

        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={gapR}  fill="none" stroke="white"        strokeWidth={GAP}         />
            <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={variant.color} strokeWidth={RING_STROKE} />
          </g>
        );
      })}
    </svg>
  );
}

export default RouteMarker;
