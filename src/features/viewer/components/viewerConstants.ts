import {
  Move,
  ZoomIn,
  SunMedium,
  Layers,
  Ruler,
  Triangle,
  Square,
  ArrowUpRight,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Play,
  Grid,
  Maximize,
  RotateCcw,
  Minus,
} from "lucide-react";

type SeriesEntry = {
  label: string;
  count: number;
  type: string;
};

export const SERIES_MAP: { [modality: string]: SeriesEntry[] } = {
  CT: [
    { label: "Axial Brain", count: 128, type: "ct" },
    { label: "Coronal", count: 64, type: "ct" },
    { label: "Sagittal", count: 64, type: "ct" },
    { label: "Scout", count: 1, type: "ct" },
  ],
  MRI: [
    { label: "Sag T1", count: 20, type: "mri" },
    { label: "Sag T2", count: 20, type: "mri" },
    { label: "Axial T2", count: 18, type: "mri" },
    { label: "STIR", count: 20, type: "mri" },
  ],
  "X-RAY": [
    { label: "AP View", count: 1, type: "xray" },
    { label: "PA View", count: 1, type: "xray" },
    { label: "Lateral", count: 1, type: "xray" },
    { label: "Oblique", count: 1, type: "xray" },
  ],
  ULTRASOUND: [
    { label: "Liver", count: 12, type: "us" },
    { label: "GB/CBD", count: 8, type: "us" },
    { label: "Kidneys", count: 10, type: "us" },
  ],
};

export const TOOLS = [
  { id: "pan", icon: Move, label: "Pan" },
  { id: "zoom", icon: ZoomIn, label: "Zoom" },
  { id: "wl", icon: SunMedium, label: "W/L" },
  { id: "scroll", icon: Layers, label: "Scroll" },
  { id: "length", icon: Ruler, label: "Length" },
  { id: "angle", icon: Triangle, label: "Angle" },
  { id: "area", icon: Square, label: "Area" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow" },
  { id: "fliph", icon: FlipHorizontal, label: "Flip H" },
  { id: "flipv", icon: FlipVertical, label: "Flip V" },
  { id: "rotate", icon: RotateCw, label: "Rotate" },
  { id: "cine", icon: Play, label: "Cine" },
  { id: "mpr", icon: Grid, label: "MPR" },
  { id: "full", icon: Maximize, label: "Full" },
  { id: "invert", icon: Minus, label: "Invert" },
  { id: "reset", icon: RotateCcw, label: "Reset" },
];

export const ROLE_COLORS: { [role: string]: string } = {
  radiologist: "#16a34a",
  radiographer: "#1A73E8",
  referring_doctor: "#ea580c",
  admin: "#7c3aed",
};