export type EditorMode = 'home' | 'photo' | 'video';

export type ThemeMode = 'light' | 'dark';

export type PhotoToolTab = 'transform' | 'adjust' | 'filters' | 'text' | 'draw' | 'export';

export type PhotoPresetId =
  | 'none'
  | 'bw'
  | 'sepia'
  | 'vintage'
  | 'cool'
  | 'warm'
  | 'high-contrast'
  | 'faded';

export interface PhotoAdjustments {
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  exposure: number; // -100 to 100
  warmth: number; // -100 to 100
  sharpness: number; // 0 to 100
  blur: number; // 0 to 20
  vignette: number; // 0 to 100
}

export interface PhotoBorder {
  width: number; // 0 to 80 (relative to 1000px base)
  color: string;
}

export interface CropRect {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  width: number; // normalized 0..1
  height: number; // normalized 0..1
}

export interface TextLayer {
  id: string;
  text: string;
  x: number; // normalized 0..1 center position
  y: number; // normalized 0..1 center position
  fontSize: number; // relative to 1000px base width (e.g. 48)
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  bgColor: string; // 'transparent' or hex
}

export interface BrushPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface BrushStroke {
  id: string;
  points: BrushPoint[];
  color: string;
  size: number; // relative to 1000px base width
  opacity: number; // 0.1..1
  isEraser: boolean;
}

export interface PhotoEditState {
  crop: CropRect; // applied crop region in oriented source coordinates
  rotate90: number; // 0, 90, 180, 270
  fineRotate: number; // -45 to 45 degrees
  flipH: boolean;
  flipV: boolean;
  targetWidth: number;
  targetHeight: number;
  adjustments: PhotoAdjustments;
  preset: PhotoPresetId;
  border: PhotoBorder;
  textLayers: TextLayer[];
  strokes: BrushStroke[];
}

export type PhotoExportFormat = 'png' | 'jpeg' | 'webp';
export type PhotoExportSizePreset = 'original' | '1080' | '720';

// Video Editor Types

export type VideoToolTab = 'trim' | 'speed-audio' | 'filters' | 'text' | 'export';

export type VideoFilterPresetId =
  | 'none'
  | 'bw'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'high-contrast';

export interface VideoSegment {
  id: string;
  start: number; // seconds in source video
  end: number; // seconds in source video
}

export interface VideoAdjustments {
  brightness: number; // -50 to 50
  contrast: number; // -50 to 50
  saturation: number; // -100 to 100
}

export interface VideoTextOverlay {
  enabled: boolean;
  text: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  fontSize: number; // px relative to 1080p height
  color: string;
  bgColor: string; // 'transparent' or rgba/hex
  fontFamily: string;
  bold: boolean;
}

export interface VideoEditState {
  segments: VideoSegment[];
  speed: number; // 0.25 to 4
  volume: number; // 0 to 1.5
  muted: boolean;
  rotate90: number; // 0, 90, 180, 270
  preset: VideoFilterPresetId;
  adjustments: VideoAdjustments;
  textOverlay: VideoTextOverlay;
}

export type VideoExportFormat = 'mp4' | 'webm';
export type VideoExportQuality = 'low' | 'medium' | 'high';
