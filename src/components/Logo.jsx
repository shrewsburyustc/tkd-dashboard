// Logo.jsx — the school logo image (public/logo.png).
// Why it exists: the logo appears on sign-in (72px) and in the Home header (40px).
// The school red only ever appears inside this image, never in the UI itself.

// BASE_URL is "/" normally; using it keeps the path right if the app is ever served from a sub-folder.
const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

// alt: what a screen reader says. Pass alt="" when the school name is already written next to it.
export default function Logo({ size = 40, alt = 'U.S. Taekwondo Center' }) {
  return <img className="logo" src={LOGO_URL} width={size} height={size} alt={alt} />;
}
