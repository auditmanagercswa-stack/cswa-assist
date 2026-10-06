/**
 * Procedural vehicle "studio renders" (SVG). Used for seed/demo imagery and brand illustrations
 * where real dealer photography is not yet available. Dealer uploads replace these.
 */

export type BodyKind = "HATCHBACK" | "SEDAN" | "SUV" | "MUV" | "COUPE" | "CONVERTIBLE" | "PICKUP" | "COMMERCIAL";
export type Scene = "studio" | "showroom" | "dusk" | "coastal";

type Profile = {
  rearX: number;
  frontX: number;
  bottomY: number;
  deckY: number;
  rearWinX: number;
  roofStartX: number;
  roofEndX: number;
  roofY: number;
  wsBaseX: number;
  hoodY: number;
  beltY: number;
  wheelR: number;
  rearWheelX: number;
  frontWheelX: number;
  groundY: number;
  cladding: boolean;
  rails: boolean;
  openTop: boolean;
  bed: boolean;
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function hashString(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function profileFor(kind: BodyKind, seed: number): Profile {
  const r = rng(seed);
  const j = (n: number) => (r() - 0.5) * n;
  const groundY = 600;
  switch (kind) {
    case "HATCHBACK":
      return { rearX: 90 + j(10), frontX: 930 + j(14), bottomY: 528, deckY: 395, rearWinX: 118, roofStartX: 205 + j(14), roofEndX: 560 + j(20), roofY: 278 + j(14), wsBaseX: 712 + j(14), hoodY: 398 + j(8), beltY: 400, wheelR: 84, rearWheelX: 235 + j(8), frontWheelX: 770 + j(8), groundY, cladding: false, rails: false, openTop: false, bed: false };
    case "SEDAN":
      return { rearX: 40 + j(10), frontX: 968 + j(10), bottomY: 526, deckY: 404 + j(6), rearWinX: 222 + j(16), roofStartX: 375 + j(16), roofEndX: 600 + j(16), roofY: 292 + j(10), wsBaseX: 758 + j(14), hoodY: 410 + j(6), beltY: 404, wheelR: 86, rearWheelX: 205 + j(8), frontWheelX: 790 + j(8), groundY, cladding: false, rails: false, openTop: false, bed: false };
    case "SUV":
      return { rearX: 55 + j(10), frontX: 955 + j(10), bottomY: 512, deckY: 352 + j(8), rearWinX: 80, roofStartX: 140 + j(12), roofEndX: 615 + j(18), roofY: 222 + j(12), wsBaseX: 742 + j(12), hoodY: 360 + j(8), beltY: 355, wheelR: 100, rearWheelX: 220 + j(8), frontWheelX: 780 + j(8), groundY, cladding: true, rails: true, openTop: false, bed: false };
    case "MUV":
      return { rearX: 35 + j(8), frontX: 965 + j(8), bottomY: 520, deckY: 372, rearWinX: 58, roofStartX: 102 + j(10), roofEndX: 625 + j(14), roofY: 245 + j(10), wsBaseX: 760 + j(10), hoodY: 382 + j(6), beltY: 376, wheelR: 90, rearWheelX: 205 + j(8), frontWheelX: 795 + j(8), groundY, cladding: false, rails: r() > 0.5, openTop: false, bed: false };
    case "COUPE":
      return { rearX: 40 + j(8), frontX: 975 + j(8), bottomY: 532, deckY: 398, rearWinX: 175 + j(14), roofStartX: 390 + j(18), roofEndX: 560 + j(14), roofY: 300 + j(8), wsBaseX: 735 + j(12), hoodY: 402 + j(6), beltY: 400, wheelR: 88, rearWheelX: 200 + j(6), frontWheelX: 805 + j(6), groundY, cladding: false, rails: false, openTop: false, bed: false };
    case "CONVERTIBLE":
      return { rearX: 40, frontX: 975, bottomY: 532, deckY: 398, rearWinX: 330, roofStartX: 420, roofEndX: 560, roofY: 385, wsBaseX: 700, hoodY: 402, beltY: 400, wheelR: 88, rearWheelX: 200, frontWheelX: 805, groundY, cladding: false, rails: false, openTop: true, bed: false };
    case "PICKUP":
      return { rearX: 25 + j(8), frontX: 970 + j(8), bottomY: 512, deckY: 368, rearWinX: 400 + j(10), roofStartX: 415 + j(10), roofEndX: 640 + j(12), roofY: 238 + j(8), wsBaseX: 760 + j(10), hoodY: 372 + j(6), beltY: 370, wheelR: 98, rearWheelX: 200 + j(8), frontWheelX: 800 + j(8), groundY, cladding: true, rails: false, openTop: false, bed: true };
    case "COMMERCIAL":
    default:
      return { rearX: 40 + j(8), frontX: 950 + j(8), bottomY: 520, deckY: 250, rearWinX: 48, roofStartX: 60, roofEndX: 700 + j(10), roofY: 175 + j(8), wsBaseX: 840 + j(10), hoodY: 360 + j(8), beltY: 330, wheelR: 86, rearWheelX: 210 + j(8), frontWheelX: 790 + j(8), groundY, cladding: false, rails: false, openTop: false, bed: false };
  }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  }
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function bodyPath(p: Profile) {
  const archR = p.wheelR + 14;
  const by = p.bottomY;
  const f = p.frontWheelX;
  const rr = p.rearWheelX;
  const wy = p.groundY - p.wheelR;
  // arch geometry: points where a circle (center wy) crosses y=by
  const dy = by - wy;
  const dx = Math.sqrt(Math.max(archR * archR - dy * dy, 0));
  const rearIsTall = p.rearWinX - p.rearX < 60; // hatch/SUV vertical tailgate
  const rearUp = rearIsTall
    ? `C ${p.rearX - 10},${by - 50} ${p.rearX - 6},${p.roofY + 90} ${p.rearX + 14},${p.roofY + 40} C ${p.rearX + 26},${p.roofY + 10} ${p.roofStartX - 40},${p.roofY} ${p.roofStartX},${p.roofY}`
    : `C ${p.rearX - 10},${by - 45} ${p.rearX - 6},${p.deckY + 34} ${p.rearX + 20},${p.deckY} L ${p.rearWinX},${p.deckY - 6} C ${(p.rearWinX + p.roofStartX) / 2},${p.roofY + 34} ${p.roofStartX - 34},${p.roofY} ${p.roofStartX},${p.roofY}`;
  return [
    `M ${p.rearX + 6},${by}`,
    rearUp,
    `L ${p.roofEndX},${p.roofY}`,
    `C ${p.roofEndX + 46},${p.roofY + 4} ${p.wsBaseX - 44},${p.hoodY - 26} ${p.wsBaseX},${p.hoodY}`,
    `L ${p.frontX - 42},${p.hoodY + 12}`,
    `C ${p.frontX - 12},${p.hoodY + 16} ${p.frontX + 2},${p.hoodY + 38} ${p.frontX},${p.hoodY + 66}`,
    `C ${p.frontX + 2},${by - 22} ${p.frontX - 10},${by} ${p.frontX - 34},${by}`,
    `L ${f + dx},${by}`,
    `A ${archR} ${archR} 0 0 0 ${f - dx},${by}`,
    `L ${rr + dx},${by}`,
    `A ${archR} ${archR} 0 0 0 ${rr - dx},${by}`,
    "Z",
  ].join(" ");
}

function glassPath(p: Profile) {
  if (p.openTop) {
    // Windscreen only
    return `M ${p.wsBaseX - 70},${p.beltY - 4} L ${p.wsBaseX - 120},${p.beltY - 70} L ${p.wsBaseX - 108},${p.beltY - 72} L ${p.wsBaseX - 40},${p.beltY - 4} Z`;
  }
  const inset = 14;
  const bottom = p.beltY - 6;
  const rearIsTall = p.rearWinX - p.rearX < 60;
  const startX = rearIsTall ? p.rearX + 30 : p.rearWinX + 22;
  const rearCurve = rearIsTall
    ? `M ${startX},${bottom} C ${startX - 2},${p.roofY + 70} ${startX + 8},${p.roofY + inset + 6} ${p.roofStartX + 4},${p.roofY + inset}`
    : `M ${startX},${bottom} C ${(startX + p.roofStartX) / 2},${p.roofY + 40} ${p.roofStartX - 20},${p.roofY + inset} ${p.roofStartX + 8},${p.roofY + inset}`;
  return `${rearCurve} L ${p.roofEndX - 6},${p.roofY + inset} C ${p.roofEndX + 34},${p.roofY + inset + 4} ${p.wsBaseX - 70},${bottom - 28} ${p.wsBaseX - 34},${bottom} Z`;
}

function wheel(cx: number, cy: number, R: number, style: number, id: string) {
  const spokes = [5, 10, 6][style % 3];
  const parts: string[] = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#121417"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.93}" fill="none" stroke="#24282e" stroke-width="3"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.7}" fill="url(#${id}-rim)"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.62}" fill="#1c2026"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.45}" fill="#3a3f47" opacity="0.8"/>`);
  for (let i = 0; i < spokes; i++) {
    const w = spokes === 10 ? R * 0.06 : R * 0.1;
    parts.push(
      `<path d="M ${-w},${-R * 0.12} L ${-w * 0.55},${-R * 0.63} L ${w * 0.55},${-R * 0.63} L ${w},${-R * 0.12} Z" transform="translate(${cx},${cy}) rotate(${(360 / spokes) * i + style * 7})" fill="url(#${id}-spoke)"/>`,
    );
  }
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.16}" fill="#aeb4bc"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.07}" fill="#2a2e35"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.69}" fill="none" stroke="#e7ebf0" stroke-opacity="0.55" stroke-width="2"/>`);
  return parts.join("");
}

function carGroup(kind: BodyKind, color: string, seed: number, id: string) {
  const p = profileFor(kind, seed);
  const wy = p.groundY - p.wheelR;
  const style = seed % 3;
  const body = bodyPath(p);
  const dark = shade(color, -0.45);
  const out: string[] = [];
  // arch wells
  out.push(`<clipPath id="${id}-bodyclip"><path d="${body}"/><rect x="0" y="${p.bottomY}" width="1100" height="200"/></clipPath>`);
  out.push(`<g clip-path="url(#${id}-bodyclip)"><circle cx="${p.rearWheelX}" cy="${wy}" r="${p.wheelR + 10}" fill="#07090c"/><circle cx="${p.frontWheelX}" cy="${wy}" r="${p.wheelR + 10}" fill="#07090c"/></g>`);
  out.push(wheel(p.rearWheelX, wy, p.wheelR, style, id));
  out.push(wheel(p.frontWheelX, wy, p.wheelR, style, id));
  // body
  out.push(`<path d="${body}" fill="url(#${id}-paint)"/>`);
  // lower body shade
  out.push(`<path d="${body}" fill="url(#${id}-lower)"/>`);
  if (p.bed) {
    out.push(`<rect x="${p.rearX + 20}" y="${p.deckY - 4}" width="${p.rearWinX - p.rearX - 30}" height="10" rx="4" fill="${dark}" opacity="0.6"/>`);
  }
  if (p.cladding) {
    out.push(`<path d="M ${p.rearX + 16},${p.bottomY - 30} L ${p.frontX - 40},${p.bottomY - 30} L ${p.frontX - 34},${p.bottomY} L ${p.rearX + 10},${p.bottomY} Z" fill="#1d2024" opacity="0.85"/>`);
  }
  // glass
  out.push(`<path d="${glassPath(p)}" fill="url(#${id}-glass)"/>`);
  if (!p.openTop) {
    // B / C pillars
    const bx = p.roofStartX + (p.roofEndX - p.roofStartX) * (kind === "MUV" || kind === "COMMERCIAL" ? 0.62 : 0.52);
    out.push(`<path d="M ${bx - 8},${p.roofY + 12} L ${bx + 8},${p.roofY + 12} L ${bx + 2},${p.beltY - 6} L ${bx - 14},${p.beltY - 6} Z" fill="#0d1014"/>`);
    if (kind === "MUV" || kind === "SUV" || kind === "COMMERCIAL") {
      const cx = p.roofStartX + (p.roofEndX - p.roofStartX) * 0.22;
      out.push(`<path d="M ${cx - 7},${p.roofY + 12} L ${cx + 7},${p.roofY + 12} L ${cx + 4},${p.beltY - 6} L ${cx - 10},${p.beltY - 6} Z" fill="#0d1014"/>`);
    }
    // reflection streak
    out.push(`<path d="M ${p.roofStartX + 40},${p.roofY + 16} L ${p.roofStartX + 110},${p.roofY + 16} L ${p.roofStartX + 30},${p.beltY - 8} L ${p.roofStartX - 30},${p.beltY - 8} Z" fill="#ffffff" opacity="0.08"/>`);
  }
  if (p.rails) out.push(`<rect x="${p.roofStartX + 20}" y="${p.roofY - 12}" width="${p.roofEndX - p.roofStartX - 50}" height="9" rx="4" fill="#1a1d22"/>`);
  // shoulder highlight & crease
  out.push(`<path d="M ${p.rearX + 24},${p.beltY + 16} C ${(p.rearX + p.frontX) / 2},${p.beltY + 10} ${p.frontX - 120},${p.beltY + 14} ${p.frontX - 34},${p.hoodY + 24}" fill="none" stroke="#ffffff" stroke-opacity="0.38" stroke-width="3"/>`);
  out.push(`<path d="M ${p.rearX + 30},${p.bottomY - 52} L ${p.frontX - 50},${p.bottomY - 56}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="3"/>`);
  // door lines + handles
  const d1 = p.wsBaseX - 40;
  const d2 = p.roofStartX + (p.roofEndX - p.roofStartX) * 0.52 - 4;
  if (kind !== "COMMERCIAL") {
    for (const x of [d1, d2]) out.push(`<path d="M ${x},${p.beltY - 4} L ${x + 4},${p.bottomY - 26}" stroke="${dark}" stroke-opacity="0.55" stroke-width="2"/>`);
    if (kind !== "COUPE" && kind !== "CONVERTIBLE" && kind !== "PICKUP") {
      const d3 = p.rearWinX - p.rearX < 60 ? p.roofStartX + 30 : p.rearWinX + 30;
      out.push(`<path d="M ${d3},${p.beltY - 4} C ${d3 + 10},${p.beltY + 40} ${d3 + 30},${p.bottomY - 60} ${p.rearWheelX + p.wheelR + 26},${p.bottomY - 26}" fill="none" stroke="${dark}" stroke-opacity="0.45" stroke-width="2"/>`);
    }
    out.push(`<rect x="${d1 - 70}" y="${p.beltY + 22}" width="38" height="8" rx="4" fill="${shade(color, 0.3)}" stroke="${dark}" stroke-opacity="0.4"/>`);
    out.push(`<rect x="${d2 - 66}" y="${p.beltY + 22}" width="38" height="8" rx="4" fill="${shade(color, 0.3)}" stroke="${dark}" stroke-opacity="0.4"/>`);
  } else {
    out.push(`<path d="M ${p.wsBaseX - 70},${p.roofY + 20} L ${p.wsBaseX - 66},${p.bottomY - 26}" stroke="${dark}" stroke-opacity="0.5" stroke-width="2"/>`);
    out.push(`<path d="M ${p.rearX + 380},${p.roofY + 20} L ${p.rearX + 380},${p.bottomY - 26}" stroke="${dark}" stroke-opacity="0.5" stroke-width="2"/>`);
  }
  // mirror
  if (!p.openTop) out.push(`<path d="M ${p.wsBaseX - 54},${p.beltY - 2} q 6,-30 34,-26 q 8,10 0,26 Z" fill="${shade(color, -0.15)}"/>`);
  // headlight / taillight
  out.push(`<path d="M ${p.frontX - 52},${p.hoodY + 18} L ${p.frontX - 4},${p.hoodY + 24} L ${p.frontX - 2},${p.hoodY + 42} L ${p.frontX - 46},${p.hoodY + 36} Z" fill="url(#${id}-head)"/>`);
  out.push(`<path d="M ${p.frontX - 50},${p.hoodY + 40} L ${p.frontX - 6},${p.hoodY + 44}" stroke="#ffffff" stroke-opacity="0.9" stroke-width="2.5"/>`);
  const tailY = p.rearWinX - p.rearX < 60 ? p.beltY - 10 : p.deckY + 8;
  out.push(`<path d="M ${p.rearX + 2},${tailY} L ${p.rearX + 34},${tailY + 2} L ${p.rearX + 30},${tailY + 24} L ${p.rearX},${tailY + 22} Z" fill="#b5121d"/>`);
  out.push(`<path d="M ${p.rearX + 4},${tailY + 4} L ${p.rearX + 30},${tailY + 6}" stroke="#ff6b6b" stroke-width="2"/>`);
  // grille hint & bumper
  out.push(`<path d="M ${p.frontX - 8},${p.hoodY + 52} L ${p.frontX - 4},${p.bottomY - 30}" stroke="#0e1013" stroke-width="7" stroke-linecap="round" opacity="0.8"/>`);
  out.push(`<path d="M ${p.frontX - 44},${p.bottomY - 8} L ${p.frontX - 10},${p.bottomY - 10}" stroke="#0e1013" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`);
  return { svg: out.join(""), p };
}

function defs(id: string, color: string) {
  return `
  <linearGradient id="${id}-paint" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${shade(color, 0.45)}"/>
    <stop offset="0.38" stop-color="${shade(color, 0.08)}"/>
    <stop offset="0.62" stop-color="${color}"/>
    <stop offset="1" stop-color="${shade(color, -0.5)}"/>
  </linearGradient>
  <linearGradient id="${id}-lower" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.7" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
  </linearGradient>
  <linearGradient id="${id}-glass" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="#55657a"/>
    <stop offset="0.5" stop-color="#1f2a38"/>
    <stop offset="1" stop-color="#0d131b"/>
  </linearGradient>
  <radialGradient id="${id}-rim" cx="0.4" cy="0.35" r="0.8">
    <stop offset="0" stop-color="#f4f6f8"/>
    <stop offset="0.6" stop-color="#9aa1aa"/>
    <stop offset="1" stop-color="#4b525b"/>
  </radialGradient>
  <linearGradient id="${id}-spoke" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e9edf1"/>
    <stop offset="1" stop-color="#8d949d"/>
  </linearGradient>
  <linearGradient id="${id}-head" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#cfd9e6"/>
    <stop offset="1" stop-color="#ffffff"/>
  </linearGradient>
  <filter id="${id}-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>`;
}

function sceneBackground(scene: Scene, W: number, H: number, horizon: number, id: string, seed: number) {
  const r = rng(seed + 7);
  switch (scene) {
    case "studio":
      return `
      <defs>
        <radialGradient id="${id}-bg" cx="0.5" cy="0.35" r="0.85"><stop offset="0" stop-color="#f7f8fa"/><stop offset="0.7" stop-color="#dfe4ea"/><stop offset="1" stop-color="#c9d0d9"/></radialGradient>
        <linearGradient id="${id}-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6eaef"/><stop offset="1" stop-color="#cdd3db"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#${id}-bg)"/>
      <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#${id}-floor)"/>
      <ellipse cx="${W / 2}" cy="${horizon + 40}" rx="${W * 0.55}" ry="60" fill="#ffffff" opacity="0.55" filter="url(#${id}-blur)"/>`;
    case "showroom":
      return `
      <defs>
        <radialGradient id="${id}-bg" cx="0.5" cy="0.25" r="0.9"><stop offset="0" stop-color="#34404f"/><stop offset="0.55" stop-color="#151b24"/><stop offset="1" stop-color="#07090d"/></radialGradient>
        <radialGradient id="${id}-spot" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#${id}-bg)"/>
      <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="#0b0f14"/>
      <ellipse cx="${W / 2}" cy="${horizon + 30}" rx="${W * 0.5}" ry="${H * 0.16}" fill="url(#${id}-spot)"/>
      <path d="M 0,${horizon} L ${W},${horizon}" stroke="#ffffff" stroke-opacity="0.07"/>
      ${[0.18, 0.5, 0.82].map((x) => `<rect x="${W * x - 70}" y="0" width="140" height="6" rx="3" fill="#fff" opacity="0.5"/><path d="M ${W * x - 70},6 L ${W * x - 260},${horizon} L ${W * x + 260},${horizon} L ${W * x + 70},6 Z" fill="#fff" opacity="0.025"/>`).join("")}`;
    case "dusk":
      return `
      <defs>
        <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2547"/><stop offset="0.45" stop-color="#6d4a86"/><stop offset="0.78" stop-color="#ee8c5a"/><stop offset="1" stop-color="#f8c27a"/></linearGradient>
        <linearGradient id="${id}-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3c45"/><stop offset="1" stop-color="#1b1c21"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>
      <circle cx="${W * (0.2 + r() * 0.6)}" cy="${horizon - 70}" r="54" fill="#ffd9a0" opacity="0.85"/>
      <path d="M 0,${horizon - 40} C ${W * 0.2},${horizon - 120} ${W * 0.35},${horizon - 20} ${W * 0.55},${horizon - 80} S ${W * 0.85},${horizon - 30} ${W},${horizon - 90} L ${W},${horizon} L 0,${horizon} Z" fill="#3b2b4f" opacity="0.85"/>
      <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#${id}-road)"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 220 + 30}" y="${horizon + (H - horizon) * 0.62}" width="120" height="8" fill="#e8e3d6" opacity="0.5"/>`).join("")}`;
    case "coastal":
    default: {
      const palm = (x: number, s: number, flip: number) => `
        <g transform="translate(${x},${horizon}) scale(${s * flip},${s})" fill="#1f3b2c">
          <path d="M -6,0 C -4,-120 10,-220 26,-300 L 34,-298 C 20,-210 8,-120 8,0 Z" fill="#3b3226"/>
          <path d="M 30,-300 C -40,-320 -110,-300 -150,-250 C -90,-290 -40,-290 30,-290 Z"/>
          <path d="M 30,-300 C 90,-330 160,-310 190,-260 C 140,-300 90,-300 30,-290 Z"/>
          <path d="M 30,-300 C 0,-360 -60,-380 -110,-370 C -50,-350 -10,-330 28,-296 Z"/>
          <path d="M 30,-300 C 70,-360 130,-380 170,-360 C 120,-350 70,-330 32,-296 Z"/>
          <path d="M 30,-300 C 10,-250 -30,-200 -60,-170 C -20,-220 0,-260 26,-298 Z"/>
          <path d="M 30,-300 C 60,-250 90,-210 120,-190 C 80,-230 56,-262 34,-298 Z"/>
        </g>`;
      return `
      <defs>
        <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5e8"/><stop offset="0.7" stop-color="#d8eef7"/><stop offset="1" stop-color="#f3f7ef"/></linearGradient>
        <linearGradient id="${id}-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9a92"/><stop offset="1" stop-color="#6c6c66"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>
      <path d="M 0,${horizon - 30} L ${W},${horizon - 30} L ${W},${horizon} L 0,${horizon} Z" fill="#5f9f9c" opacity="0.55"/>
      <path d="M 0,${horizon - 34} C ${W * 0.3},${horizon - 60} ${W * 0.6},${horizon - 40} ${W},${horizon - 58} L ${W},${horizon - 30} L 0,${horizon - 30} Z" fill="#3f6e4f" opacity="0.7"/>
      ${palm(W * 0.08, 0.9, 1)}${palm(W * 0.92, 1.05, -1)}${palm(W * 0.8, 0.7, 1)}
      <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#${id}-ground)"/>`;
    }
  }
}

/** Full scene: vehicle side profile in an environment. 1600×1200 by default. */
export function carSceneSvg(opts: { kind: BodyKind; color: string; scene: Scene; seed: number; width?: number; height?: number; id?: string }) {
  const W = opts.width ?? 1600;
  const H = opts.height ?? 1200;
  const id = opts.id ?? `c${opts.seed % 100000}`;
  const scale = (W * 0.86) / 1000;
  const groundY = H * 0.8;
  const tx = (W - 1000 * scale) / 2;
  const ty = groundY - 600 * scale;
  const { svg, p } = carGroup(opts.kind, opts.color, opts.seed, id);
  const horizon = opts.scene === "dusk" || opts.scene === "coastal" ? groundY - 40 * scale : groundY - 80 * scale;
  const shadow = `<ellipse cx="${(p.rearX + p.frontX) / 2}" cy="${p.groundY + 4}" rx="${(p.frontX - p.rearX) * 0.53}" ry="22" fill="#000" opacity="${opts.scene === "studio" || opts.scene === "coastal" ? 0.38 : 0.6}" filter="url(#${id}-blur)"/>`;
  const reflection = opts.scene === "showroom" || opts.scene === "studio" ? `<g transform="translate(0,${p.groundY * 2}) scale(1,-1)" opacity="${opts.scene === "showroom" ? 0.14 : 0.08}">${svg}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${defs(id, opts.color)}</defs>
  ${sceneBackground(opts.scene, W, H, horizon, id, opts.seed)}
  <g transform="translate(${tx},${ty}) scale(${scale})">${reflection}${shadow}${svg}</g>
</svg>`;
}

/** Interior detail shot (dashboard). */
export function interiorSvg(opts: { seed: number; trim: "black" | "beige" | "tan"; accent: string; width?: number; height?: number }) {
  const W = opts.width ?? 1600;
  const H = opts.height ?? 1200;
  const trim = { black: ["#1a1c20", "#2a2d33"], beige: ["#cdbfa6", "#e6dcc8"], tan: ["#8a5a3b", "#b07a52"] }[opts.trim];
  const id = `i${opts.seed % 10000}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="${id}-ws" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc4de"/><stop offset="1" stop-color="#e7f1f6"/></linearGradient>
    <linearGradient id="${id}-dash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f36"/><stop offset="1" stop-color="#0e1013"/></linearGradient>
    <linearGradient id="${id}-screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d2338"/><stop offset="1" stop-color="#173f63"/></linearGradient>
    <radialGradient id="${id}-dial" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#1b2027"/><stop offset="1" stop-color="#05070a"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}-ws)"/>
  <path d="M 0,0 L ${W * 0.12},0 L ${W * 0.02},${H * 0.55} L 0,${H * 0.6} Z" fill="#111"/>
  <path d="M ${W},0 L ${W * 0.88},0 L ${W * 0.98},${H * 0.55} L ${W},${H * 0.6} Z" fill="#111"/>
  <path d="M 0,${H * 0.5} C ${W * 0.3},${H * 0.4} ${W * 0.7},${H * 0.4} ${W},${H * 0.5} L ${W},${H} L 0,${H} Z" fill="url(#${id}-dash)"/>
  <path d="M 0,${H * 0.62} C ${W * 0.3},${H * 0.55} ${W * 0.7},${H * 0.55} ${W},${H * 0.62} L ${W},${H * 0.68} C ${W * 0.7},${H * 0.61} ${W * 0.3},${H * 0.61} 0,${H * 0.68} Z" fill="${trim[1]}"/>
  <rect x="${W * 0.43}" y="${H * 0.47}" width="${W * 0.22}" height="${H * 0.14}" rx="18" fill="url(#${id}-screen)" stroke="#000" stroke-width="6"/>
  <rect x="${W * 0.45}" y="${H * 0.49}" width="${W * 0.08}" height="${H * 0.1}" rx="8" fill="${opts.accent}" opacity="0.35"/>
  <rect x="${W * 0.545}" y="${H * 0.495}" width="${W * 0.09}" height="${H * 0.018}" rx="6" fill="#fff" opacity="0.5"/>
  <rect x="${W * 0.545}" y="${H * 0.53}" width="${W * 0.06}" height="${H * 0.014}" rx="6" fill="#fff" opacity="0.3"/>
  <rect x="${W * 0.545}" y="${H * 0.56}" width="${W * 0.075}" height="${H * 0.014}" rx="6" fill="#fff" opacity="0.3"/>
  ${[0.17, 0.82].map((x) => `<rect x="${W * x - 50}" y="${H * 0.6}" width="100" height="40" rx="12" fill="#0b0c0e" stroke="#3a3f47" stroke-width="3"/>`).join("")}
  <g transform="translate(${W * 0.27},${H * 0.6})">
    <rect x="-190" y="-80" width="380" height="140" rx="60" fill="#0a0c0f"/>
    <circle cx="-85" cy="-10" r="62" fill="url(#${id}-dial)" stroke="${opts.accent}" stroke-width="4"/>
    <circle cx="85" cy="-10" r="62" fill="url(#${id}-dial)" stroke="${opts.accent}" stroke-width="4"/>
    <path d="M -85,-10 L -120,-40" stroke="#ff5a1f" stroke-width="4"/>
    <path d="M 85,-10 L 110,-48" stroke="#ff5a1f" stroke-width="4"/>
  </g>
  <g transform="translate(${W * 0.27},${H * 0.83})">
    <circle r="230" fill="none" stroke="#14161a" stroke-width="48"/>
    <circle r="230" fill="none" stroke="${trim[0]}" stroke-width="10" opacity="0.6"/>
    <path d="M -200,40 L -60,30 L 60,30 L 200,40" stroke="#14161a" stroke-width="56" fill="none"/>
    <circle r="62" fill="#1c1f24"/>
    <circle r="22" fill="#9aa0a8"/>
  </g>
  <rect x="${W * 0.7}" y="${H * 0.72}" width="${W * 0.3}" height="${H * 0.3}" fill="${trim[0]}"/>
  <path d="M ${W * 0.7},${H * 0.72} C ${W * 0.78},${H * 0.68} ${W * 0.92},${H * 0.68} ${W},${H * 0.7}" stroke="${trim[1]}" stroke-width="10" fill="none"/>
</svg>`;
}

/** Close-up of wheel & arch. */
export function wheelDetailSvg(opts: { color: string; seed: number; width?: number; height?: number }) {
  const W = opts.width ?? 1600;
  const H = opts.height ?? 1200;
  const id = `w${opts.seed % 10000}`;
  const R = H * 0.33;
  const cx = W * 0.5;
  const cy = H * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${defs(id, opts.color)}</defs>
  <rect width="${W}" height="${H}" fill="#2a2d33"/>
  <rect y="${H * 0.88}" width="${W}" height="${H * 0.12}" fill="#1a1b1f"/>
  <path d="M 0,0 L ${W},0 L ${W},${H * 0.62} L ${cx + R * 1.18},${H * 0.62} A ${R * 1.18} ${R * 1.18} 0 0 0 ${cx - R * 1.18},${H * 0.62} L 0,${H * 0.62} Z" fill="url(#${id}-paint)"/>
  <path d="M 0,${H * 0.2} L ${W},${H * 0.17}" stroke="#fff" stroke-opacity="0.35" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${R * 1.1}" fill="#07090c"/>
  ${wheel(cx, cy, R, opts.seed % 3, id)}
  <ellipse cx="${cx}" cy="${H * 0.93}" rx="${R * 1.1}" ry="24" fill="#000" opacity="0.5" filter="url(#${id}-blur)"/>
</svg>`;
}

export const PAINT_COLORS: Record<string, string> = {
  "Pearl White": "#e9ecef",
  "Arctic Silver": "#b8bec6",
  "Magma Grey": "#5d636b",
  "Midnight Black": "#22252a",
  "Fiery Red": "#b3202a",
  "Royal Blue": "#1f4fa3",
  "Ocean Teal": "#1e7a80",
  "Forest Green": "#2f5d43",
  "Sunset Orange": "#d9661f",
  "Champagne Gold": "#b89a63",
  "Deep Maroon": "#6b1f2a",
  "Graphite Blue": "#34465e",
};
