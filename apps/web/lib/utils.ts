import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function normalizeHexColor(value: string | undefined, fallback = "9A9A9A") {
  const normalized = (value ?? fallback).replace(/^#/, "").trim();

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase();
  }

  return fallback;
}

function hexToRgb(value: string) {
  const normalized = normalizeHexColor(value);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixChannels(left: number, right: number, amount: number) {
  return Math.round(left * (1 - amount) + right * amount);
}

export function getSoftTeamColor(value: string | undefined) {
  const { r, g, b } = hexToRgb(value ?? "9A9A9A");
  const lifted = {
    r: mixChannels(r, 255, 0.22),
    g: mixChannels(g, 255, 0.22),
    b: mixChannels(b, 255, 0.22),
  };
  const grounded = {
    r: mixChannels(lifted.r, 26, 0.06),
    g: mixChannels(lifted.g, 26, 0.06),
    b: mixChannels(lifted.b, 34, 0.06),
  };

  return `#${[grounded.r, grounded.g, grounded.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getSoftTeamColorRgba(value: string | undefined, alpha: number) {
  const { r, g, b } = hexToRgb(getSoftTeamColor(value));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
