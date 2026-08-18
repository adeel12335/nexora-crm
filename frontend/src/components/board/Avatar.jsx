const AVATAR_COLORS = ['#E07A3D', '#C45C26', '#7B5EA7', '#3D8B8B', '#C65A79', '#4E9A6A', '#2F6FED', '#B45309'];

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarColor(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Initials avatar. Replaces the illustrated placeholder faces, which all
 * rendered the same handful of drawings regardless of who the person was.
 */
export default function Avatar({ name, size = 28, className = '' }) {
  return (
    <span
      className={`avatar-initials${className ? ` ${className}` : ''}`}
      style={{ background: avatarColor(name), width: size, height: size, fontSize: Math.round(size * 0.4) }}
      title={name || undefined}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
