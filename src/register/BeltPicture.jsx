// BeltPicture.jsx — a small picture of a taekwondo belt (40×12), for the family page.
// Why it exists: the form shows each belt button and "Testing for" with a belt picture
// (rulebook v0.131, Q2). The drawing is a copy of the dashboard's src/components/Belt.jsx
// (decided v0.64/v0.65) because the public page must not import dashboard components
// (contract 0005 §4.1). If the belt drawing changes there, change it here too.
//
// The belt NAME is always written next to the picture, so the picture is hidden from screen
// readers (aria-hidden) and meaning is never shown by color alone.
//   solid   one color
//   stripe  outer color top and bottom, the second color in the middle third
//   half    top half one color, bottom half the second color
//   plus 0–3 short "end stripes" near the right end.
// Colors come from tokens.css (--belt-white, --belt-yellow, …).
import { useId } from 'react';

const WIDTH = 40;
const HEIGHT = 12;
const BAR = 3; // end-stripe width
const BAR_GAP = 2;
const INSET = 5; // distance of the first end stripe from the right end

// 'yellow' → var(--belt-yellow); unknown keys draw neutral gray.
const fillOf = (key) => (key ? `var(--belt-${key}, var(--belt-unknown))` : 'var(--belt-unknown)');

export default function BeltPicture({ belt }) {
  const clipId = useId();
  if (!belt || !belt.beltColor) return null;
  const first = fillOf(belt.beltColor);
  const second = fillOf(belt.beltColor2 ?? belt.beltColor);

  // The horizontal bands: [y, height, fill], whole pixels so edges stay crisp (4/4/4).
  let bands;
  if (belt.beltPattern === 'stripe') {
    const outer = Math.ceil(HEIGHT / 3);
    const middle = HEIGHT - outer * 2;
    bands = [[0, outer, first], [outer, middle, second], [outer + middle, outer, first]];
  } else if (belt.beltPattern === 'half') {
    bands = [[0, HEIGHT / 2, first], [HEIGHT / 2, HEIGHT / 2, second]];
  } else {
    bands = [[0, HEIGHT, first]];
  }
  const count = Math.max(0, Math.min(3, Number(belt.beltEndStripes) || 0));
  const bars = Array.from({ length: count }, (_, i) => WIDTH - INSET - BAR - i * (BAR + BAR_GAP));

  return (
    <svg className="reg-belt" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" focusable="false">
      <defs>
        {/* Rounded corners: the same rectangle as the outline, so no color shows outside it. */}
        <clipPath id={clipId}>
          <rect x="0.5" y="0.5" width={WIDTH - 1} height={HEIGHT - 1} rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} shapeRendering="crispEdges">
        {bands.map(([y, h, fill]) => (
          <rect key={y} x="0" y={y} width={WIDTH} height={h} style={{ fill }} />
        ))}
        {bars.map((x) => (
          <rect key={x} x={x} y="0" width={BAR} height={HEIGHT} style={{ fill: fillOf(belt.beltEndStripeColor ?? 'yellow') }} />
        ))}
      </g>
      {/* 1px outline so a white belt shows on a white page */}
      <rect x="0.5" y="0.5" width={WIDTH - 1} height={HEIGHT - 1} rx="2" style={{ fill: 'none', stroke: 'var(--belt-outline)' }} strokeWidth="1" />
    </svg>
  );
}
