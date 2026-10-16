// Avatar.jsx — the initials circle (e.g. "JB" for Jeffrey Berg).
// Why it exists: shown small (28px) in the top bar to open the account menu, and large
// (56px) on the lock screen so everyone can see whose screen is locked.

// "Jeffrey Berg" → "JB", "Jeffrey" → "J", "" → "?"
export function getInitials(fullName) {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// size: 'small' | 'large'. open: draws the blue ring while the account menu is open.
// aria-hidden because the button around it (or the name next to it) already says who it is.
export default function Avatar({ name, size = 'small', open = false }) {
  const classes = ['avatar'];
  if (size === 'large') classes.push('avatar--large');
  if (open) classes.push('avatar--open');
  return (
    <span className={classes.join(' ')} aria-hidden="true">
      {getInitials(name)}
    </span>
  );
}
