// Utility functions - defined first to avoid use-before-define errors
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex) => {
  if (!hex || typeof hex !== "string") return { r: 0, g: 0, b: 0 };
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = Math.floor(bigint / 65536) % 256;
  const g = Math.floor(bigint / 256) % 256;
  const b = bigint % 256;
  return { r, g, b };
};

const rgbToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((c) => {
      const clamped = clamp(Math.round(c), 0, 255);
      const s = clamped.toString(16);
      return s.length === 1 ? `0${s}` : s;
    })
    .join("")}`;

const interpolate = (a, b, t) => a + (b - a) * t;

const interpolateHexColor = (hexA, hexB, t) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(
    interpolate(a.r, b.r, t),
    interpolate(a.g, b.g, t),
    interpolate(a.b, b.b, t)
  );
};

// Blend two hex colors by t in [0,1]
export const mixHexColors = (hexA, hexB, t) =>
  interpolateHexColor(hexA, hexB, clamp(t, 0, 1));

const LETTER_TO_COLOR = {
  A: "green",
  B: "yellow",
  C: "orange",
  D: "red",
  F: "red",
  W: "pink",
  P: "purple",
  S: "blue",
  U: "red",
  V: "gray",
  I: "gray",
};

export const GPA_MAP = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};


// Text colors (approximate) matching Chakra's 800 tone per scheme
const SCHEME_TEXT_HEX_800 = {
  blue: "#2A4365", // blue.800
  green: "#22543D", // green.800
  yellow: "#975A16", // yellow.800
  orange: "#9C4221", // orange.800
  red: "#822727", // red.800
  gray: "#1A202C", // gray.800
};

export const letterToColor = (letter) => {
  if (letter === undefined || !LETTER_TO_COLOR[letter]) return "blackAlpha";
  return LETTER_TO_COLOR[letter];
};


// RMP rating to pastel background hex (5-point scale shifted up from 4-point GPA scale)
export const rmpToPastelHex = (rating) => {
  const x = clamp(Number(rating), 1, 5); // 5-point scale
  const PASTEL = {
    blue: "#90CDF4", // blue.100
    green: "#C6F6D5", // green.100
    yellow: "#FEFCBF", // yellow.100
    orange: "#FEEBC8", // orange.100
    red: "#FED7D7", // red.100
  };
  const stops = [
    { pos: 1, color: PASTEL.red },
    { pos: 2.5, color: PASTEL.red },
    { pos: 3, color: PASTEL.orange },
    { pos: 3.5, color: PASTEL.yellow },
    { pos: 4, color: PASTEL.green },
    { pos: 5, color: PASTEL.blue },
  ];
  let baseColor = stops[0].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const left = stops[i];
    const right = stops[i + 1];
    if (x >= left.pos && x <= right.pos) {
      const span = right.pos - left.pos || 1;
      const t = (x - left.pos) / span;
      baseColor = mixHexColors(left.color, right.color, t);
      break;
    }
  }
  return baseColor;
};

// RMP rating to text hex (5-point scale shifted up from 4-point GPA scale)
export const rmpToTextHex = (rating) => {
  const x = clamp(Number(rating), 1, 5); // 5-point scale
  const stops = [
    { pos: 1, color: SCHEME_TEXT_HEX_800.red },
    { pos: 2.5, color: SCHEME_TEXT_HEX_800.red },
    { pos: 3, color: SCHEME_TEXT_HEX_800.orange },
    { pos: 3.5, color: SCHEME_TEXT_HEX_800.yellow },
    { pos: 4, color: SCHEME_TEXT_HEX_800.green },
    { pos: 5, color: SCHEME_TEXT_HEX_800.blue },
  ];
  let baseColor = stops[0].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const left = stops[i];
    const right = stops[i + 1];
    if (x >= left.pos && x <= right.pos) {
      const span = right.pos - left.pos || 1;
      const t = (x - left.pos) / span;
      baseColor = mixHexColors(left.color, right.color, t);
      break;
    }
  }
  return baseColor;
};



/**
 * Converts a term code to a pretty name
 * Term codes are in format YYYYMM where:
 * - MM=02 corresponds to Spring
 * - MM=05 corresponds to Summer
 * - MM=08 corresponds to Fall
 * @param {string|number} term - The term code
 * @returns {string} - Formatted term name (e.g., "Spring 2025")
 */
export const termToName = (term) => {
  if (!term) return "Invalid Term";

  // Convert to string to ensure proper handling
  const termStr = String(term);

  // Check if the term code is in the expected format
  if (termStr.length !== 6) return "Invalid Term";

  // Extract year and month
  const year = termStr.substring(0, 4);
  const month = termStr.substring(4, 6);

  // Convert month code to term name
  switch (month) {
    case "02":
      return `Spring ${year}`;
    case "05":
      return `Summer ${year}`;
    case "08":
      return `Fall ${year}`;
    default:
      return "Invalid Term";
  }
};





// Pastel-anchored version that matches Chakra's subtle Tag backgrounds more closely
// Anchors use 100-scale tokens from Chakra default palette
// Bias slightly toward the nearest whole-grade checkpoint for stability
export const gpaToPastelAnchoredHex = (gpa, biasStrength = 0.15) => {
  const x = clamp(Number(gpa), 0, 4);
  const PASTEL = {
    green: "#C6F6D5", // green.100
    yellow: "#FEFCBF", // yellow.100
    orange: "#FEEBC8", // orange.100
    red: "#FED7D7", // red.100
  };
  const stops = [
    { pos: 0, color: PASTEL.red },
    { pos: 1, color: PASTEL.red },
    { pos: 2, color: PASTEL.orange },
    { pos: 3, color: PASTEL.yellow },
    { pos: 4, color: PASTEL.green },
  ];
  let baseColor = stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const left = stops[i];
    const right = stops[i + 1];
    if (x >= left.pos && x <= right.pos) {
      const span = right.pos - left.pos || 1;
      const t = (x - left.pos) / span;
      baseColor = mixHexColors(left.color, right.color, t);
      break;
    }
  }
  // Slight bias toward nearest anchor color for stability
  const nearestAnchor = clamp(Math.round(x), 1, 4);
  let targetColor;
  if (nearestAnchor === 4) {
    targetColor = stops[4].color;
  } else if (nearestAnchor === 3) {
    targetColor = stops[3].color;
  } else if (nearestAnchor === 2) {
    targetColor = stops[2].color;
  } else {
    targetColor = stops[1].color; // 1
  }

  const proximity = clamp(1 - Math.abs(x - nearestAnchor) / 0.5, 0, 1);
  const tBias = biasStrength * proximity * proximity;
  return mixHexColors(baseColor, targetColor, tBias);
};

// GPA → text hex with anchors at whole-grade checkpoints using 800 tones
export const gpaToTextAnchoredHex = (gpa, biasStrength = 0.3) => {
  const x = clamp(Number(gpa), 0, 4);
  const stops = [
    { pos: 0, color: SCHEME_TEXT_HEX_800.red },
    { pos: 1, color: SCHEME_TEXT_HEX_800.red },
    { pos: 2, color: SCHEME_TEXT_HEX_800.orange },
    { pos: 3, color: SCHEME_TEXT_HEX_800.yellow },
    { pos: 4, color: SCHEME_TEXT_HEX_800.green },
  ];
  let baseColor = stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const left = stops[i];
    const right = stops[i + 1];
    if (x >= left.pos && x <= right.pos) {
      const span = right.pos - left.pos || 1;
      const t = (x - left.pos) / span;
      baseColor = mixHexColors(left.color, right.color, t);
      break;
    }
  }
  // Bias toward nearest 800-tone anchor color for stability
  const nearestAnchor = clamp(Math.round(x), 1, 4);
  let targetColor;
  if (nearestAnchor === 4) {
    targetColor = stops[4].color;
  } else if (nearestAnchor === 3) {
    targetColor = stops[3].color;
  } else if (nearestAnchor === 2) {
    targetColor = stops[2].color;
  } else {
    targetColor = stops[1].color; // 1
  }

  const proximity = clamp(1 - Math.abs(x - nearestAnchor) / 0.5, 0, 1);
  const tBias = biasStrength * proximity * proximity;
  return mixHexColors(baseColor, targetColor, tBias);
};
