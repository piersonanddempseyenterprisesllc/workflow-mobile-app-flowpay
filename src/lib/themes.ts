export type ThemeId =
  | "canva-lux"
  | "midnight"
  | "sunset"
  | "ocean"
  | "rose-gold"
  | "noir-gold";

export type Theme = {
  id: ThemeId;
  name: string;
  description: string;
  swatch: string[]; // hex stops for the picker swatch
};

export const THEMES: Theme[] = [
  {
    id: "canva-lux",
    name: "Canva Lux",
    description: "Purple · Magenta · Pink",
    swatch: ["#7C3AED", "#A855F7", "#EC4899", "#F472B6"],
  },
  {
    id: "midnight",
    name: "Midnight Indigo",
    description: "Indigo · Violet",
    swatch: ["#1E1B4B", "#4F46E5", "#7C3AED", "#A78BFA"],
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Coral · Magenta · Amber",
    swatch: ["#FB923C", "#F43F5E", "#D946EF", "#FBBF24"],
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Blue · Teal · Mint",
    swatch: ["#0EA5E9", "#06B6D4", "#10B981", "#6EE7B7"],
  },
  {
    id: "rose-gold",
    name: "Rose Gold",
    description: "Rose · Champagne",
    swatch: ["#E11D48", "#F472B6", "#FBBF24", "#FDE68A"],
  },
  {
    id: "noir-gold",
    name: "Noir Gold",
    description: "Black · Charcoal · Gold",
    swatch: ["#0A0A0A", "#27272A", "#C9A84C", "#F0D78C"],
  },
];

export const DEFAULT_THEME: ThemeId = "canva-lux";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}
