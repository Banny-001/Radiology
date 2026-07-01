// reconstructPlane.ts
//
// Given a DicomVolume (a stack of axial slices decoded into one grayscale
// buffer, see useDicomVolume.ts), resample it along the coronal and sagittal
// planes. This is the actual "restacking" step MPR refers to: instead of
// showing another axial slice, we cut through the volume along a different
// axis entirely.
import type { DicomVolume } from "./useDicomVolume";

export interface PlaneImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray; // grayscale, length = width * height
}

/**
 * Coronal: fixes a Y row and stacks that same row from every axial slice
 * into a new (width x depth) image — an anterior-to-posterior cut through
 * the volume, viewed front-on.
 */
export function reconstructCoronal(volume: DicomVolume, yIndex: number): PlaneImage {
  const { width, height, depth, data } = volume;
  const y = Math.max(0, Math.min(height - 1, yIndex));
  const pixels = new Uint8ClampedArray(width * depth);
  for (let z = 0; z < depth; z++) {
    const rowStart = z * width * height + y * width;
    pixels.set(data.subarray(rowStart, rowStart + width), z * width);
  }
  return { width, height: depth, pixels };
}

/**
 * Sagittal: fixes an X column and stacks that column from every axial slice
 * into a new (height x depth) image — a left-to-right cut through the
 * volume, viewed from the side.
 */
export function reconstructSagittal(volume: DicomVolume, xIndex: number): PlaneImage {
  const { width, height, depth, data } = volume;
  const x = Math.max(0, Math.min(width - 1, xIndex));
  const pixels = new Uint8ClampedArray(height * depth);
  for (let z = 0; z < depth; z++) {
    const sliceBase = z * width * height;
    for (let y = 0; y < height; y++) {
      pixels[z * height + y] = data[sliceBase + y * width + x];
    }
  }
  return { width: height, height: depth, pixels };
}
