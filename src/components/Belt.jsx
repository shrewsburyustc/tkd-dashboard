// Belt.jsx — a small picture of a taekwondo belt (an SVG drawing).
// Why it exists: decided v0.64 — Classes and ranks shows a tiny belt next to every rank name and
// next to its "Testing for" name, so the belt change is visible at a glance. The NAME is always
// written next to it as text, so the picture is decoration for screen readers (aria-hidden) and
// meaning is never shown by color alone (guidelines 4).
//
// The patterns (horizontal bands, like a belt seen from the front):
//   solid   one color
//   stripe  outer color on the top and bottom thirds, the second color in the middle third
//           (Little Tiger belts: white with a colored stripe; "High" belts: color with a white
//           stripe; Bo Dan: black with a white stripe; Deputy: black with a yellow stripe)
//   half    top half one color, bottom half the second color (Red / Black)
// plus 0–3 "end stripes": short vertical bars near the right end (Bo Dan - 1/2/3 Big Stripe).
//
// Colors come from tokens.css (--belt-white, --belt-yellow, …). These are the real belt colors —
// including red: a recorded exception to the "red means delete" rule, because these are
// pictures of belts, not buttons or warnings (v0.64).
//
// Props:
//   belt   { beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor } — a rank
//          (or anything with those fields). Missing → nothing is drawn.
//   size   'row' (40×12, in the list) | 'dialog' (56×14, the preview in the rank dialog)
import { useId } from 'react';

const SIZES = {
  row: { width: 40, height: 12, bar: 3, barGap: 2, inset: 5 },
  dialog: { width: 56, height: 14, bar: 4, barGap: 3, inset: 7 },
};

// The CSS variable for a belt color key, e.g. 'yellow' → var(--belt-yellow).
// An unknown key draws neutral gray instead of nothing.
const fillOf = (key) => (key ? `var(--belt-${key}, var(--belt-unknown))` : 'var(--belt-unknown)');

export default function Belt({ belt, size = 'row', className = '' }) {
  const clipId = useId();
  if (!belt || !belt.beltColor) return null;
  const { width, height, bar, barGap, inset } = SIZES[size] ?? SIZES.row;
  const pattern = belt.beltPattern ?? 'solid';
  const first = fillOf(belt.beltColor);
  const second = fillOf(belt.beltColor2 ?? belt.beltColor);

  // The horizontal bands: [y, height, fill]. Whole pixels only, so the edges stay crisp:
  // 12px tall → 4/4/4; 14px tall → 5/4/5 (the outer bands get the extra pixel).
  let bands;
  if (pattern === 'stripe') {
    const outer = Math.ceil(height / 3);
    const middle = height - outer * 2;
    bands = [
      [0, outer, first],
      [outer, middle, second],
      [outer + middle, outer, first],
    ];
  } else if (pattern === 'half') {
    bands = [
      [0, height / 2, first],
      [height / 2, height / 2, second],
    ];
  } else {
    bands = [[0, height, first]];
  }

  // End stripes: bars counted from the right end inward.
  const count = Math.max(0, Math.min(3, Number(belt.beltEndStripes) || 0));
  const bars = Array.from({ length: count }, (_, index) => width - inset - bar - index * (bar + barGap));

  return (
    <svg
      className={`belt belt--${size} ${className}`.trim()}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Rounded 2px corners. The SAME rectangle as the outline below (0.5px in from the
            edge), so no color shows outside the outline at the corners. */}
        <clipPath id={clipId}>
          <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx="2" />
        </clipPath>
      </defs>
      {/* crispEdges: draw the bands on whole pixels, never blurred half-pixels */}
      <g clipPath={`url(#${clipId})`} shapeRendering="crispEdges">
        {bands.map(([y, h, fill]) => (
          <rect key={y} x="0" y={y} width={width} height={h} style={{ fill }} />
        ))}
        {bars.map((x) => (
          <rect key={x} x={x} y="0" width={bar} height={height} style={{ fill: fillOf(belt.beltEndStripeColor ?? 'yellow') }} />
        ))}
      </g>
      {/* The 1px outline (so a white belt shows on a white page) */}
      <rect
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        rx="2"
        style={{ fill: 'none', stroke: 'var(--belt-outline)' }}
        strokeWidth="1"
      />
    </svg>
  );
}
