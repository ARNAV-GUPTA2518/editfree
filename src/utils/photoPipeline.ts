import type {
  CropRect,
  PhotoAdjustments,
  PhotoEditState,
  PhotoExportFormat,
  PhotoExportSizePreset,
  PhotoPresetId,
} from '../types/editor';

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  warmth: 0,
  sharpness: 0,
  blur: 0,
  vignette: 0,
};

export const PHOTO_PRESETS: { id: PhotoPresetId; label: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'bw', label: 'B&W' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'cool', label: 'Cool' },
  { id: 'warm', label: 'Warm' },
  { id: 'high-contrast', label: 'Punch' },
  { id: 'faded', label: 'Faded' },
];

export function createInitialPhotoState(width: number, height: number): PhotoEditState {
  return {
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotate90: 0,
    fineRotate: 0,
    flipH: false,
    flipV: false,
    targetWidth: width,
    targetHeight: height,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    preset: 'none',
    border: { width: 0, color: '#ffffff' },
    textLayers: [],
    strokes: [],
  };
}

/**
 * Computes base oriented dimensions (after 90-degree rotation steps)
 * before crop and resize are applied.
 */
export function getOrientedDimensions(
  srcWidth: number,
  srcHeight: number,
  rotate90: number
): { width: number; height: number } {
  const normalized = ((rotate90 % 360) + 360) % 360;
  if (normalized === 90 || normalized === 270) {
    return { width: srcHeight, height: srcWidth };
  }
  return { width: srcWidth, height: srcHeight };
}

/**
 * Rotates a normalized crop rectangle by +90 deg CW or -90 deg CCW
 * so existing crops stay locked to the same visual region on rotation.
 */
export function rotateCropRect(crop: CropRect, direction: 'cw' | 'ccw'): CropRect {
  if (direction === 'cw') {
    return {
      x: clamp01(1 - (crop.y + crop.height)),
      y: clamp01(crop.x),
      width: clamp01(crop.height),
      height: clamp01(crop.width),
    };
  }
  return {
    x: clamp01(crop.y),
    y: clamp01(1 - (crop.x + crop.width)),
    width: clamp01(crop.height),
    height: clamp01(crop.width),
  };
}

export function flipCropRect(crop: CropRect, axis: 'h' | 'v'): CropRect {
  if (axis === 'h') {
    return {
      ...crop,
      x: clamp01(1 - (crop.x + crop.width)),
    };
  }
  return {
    ...crop,
    y: clamp01(1 - (crop.y + crop.height)),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Renders the oriented, cropped, and resized base image onto a destination canvas
 * without adjustments or overlays. Used as the base stage and for Before/After comparison.
 */
export function renderOrientedCroppedBase(
  img: HTMLImageElement,
  state: PhotoEditState,
  destCanvas: HTMLCanvasElement,
  maxDimension?: number
): { width: number; height: number } {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const oriented = getOrientedDimensions(srcW, srcH, state.rotate90);

  // Target output pixel dimensions
  let outW = Math.max(1, Math.round(state.targetWidth));
  let outH = Math.max(1, Math.round(state.targetHeight));

  if (maxDimension && (outW > maxDimension || outH > maxDimension)) {
    const scale = maxDimension / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  destCanvas.width = outW;
  destCanvas.height = outH;
  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { width: outW, height: outH };

  ctx.clearRect(0, 0, outW, outH);

  // Build an oriented intermediate canvas at proportional resolution to avoid sampling loss
  const cropW = Math.max(0.01, state.crop.width);
  const cropH = Math.max(0.01, state.crop.height);
  const fullOrientedW = Math.max(1, Math.round(outW / cropW));
  const fullOrientedH = Math.max(1, Math.round(outH / cropH));

  const orientCanvas = document.createElement('canvas');
  orientCanvas.width = fullOrientedW;
  orientCanvas.height = fullOrientedH;
  const oCtx = orientCanvas.getContext('2d');
  if (oCtx) {
    oCtx.save();
    oCtx.translate(fullOrientedW / 2, fullOrientedH / 2);

    const totalAngleRad = ((state.rotate90 + state.fineRotate) * Math.PI) / 180;
    oCtx.rotate(totalAngleRad);

    // Zoom slightly when fineRotate != 0 so corners don't show blank triangles
    if (Math.abs(state.fineRotate) > 0.05) {
      const rad = (Math.abs(state.fineRotate) * Math.PI) / 180;
      const w = oriented.width;
      const h = oriented.height;
      const scale = Math.max(
        (w * Math.cos(rad) + h * Math.sin(rad)) / w,
        (w * Math.sin(rad) + h * Math.cos(rad)) / h
      );
      oCtx.scale(scale, scale);
    }

    oCtx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);

    // Draw image centered in rotated coordinates
    const normalizedRot = ((state.rotate90 % 360) + 360) % 360;
    const drawW = normalizedRot === 90 || normalizedRot === 270 ? fullOrientedH : fullOrientedW;
    const drawH = normalizedRot === 90 || normalizedRot === 270 ? fullOrientedW : fullOrientedH;
    oCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    oCtx.restore();

    // Crop from oriented canvas into destCanvas
    const sx = state.crop.x * fullOrientedW;
    const sy = state.crop.y * fullOrientedH;
    const sw = state.crop.width * fullOrientedW;
    const sh = state.crop.height * fullOrientedH;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(orientCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
  }

  return { width: outW, height: outH };
}

/**
 * Applies blur (if > 0) using Canvas filter when available, or box blur fallback.
 */
function applyBlurPass(canvas: HTMLCanvasElement, blurAmount: number) {
  if (blurAmount <= 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  // Scale blur relative to 1000px base width for consistent preview/export appearance
  const scaledRadius = (blurAmount * canvas.width) / 1000;
  if (scaledRadius < 0.25) return;

  if (typeof ctx.filter === 'string') {
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tCtx = temp.getContext('2d');
    if (!tCtx) return;
    tCtx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.filter = `blur(${scaledRadius.toFixed(2)}px)`;
    // Draw slightly oversized or clamped to avoid dark edge halo
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
  }
}

/**
 * Applies pixel-level color adjustments & preset filter in one deterministic pass.
 */
function applyColorAndPresetPass(
  canvas: HTMLCanvasElement,
  adjustments: PhotoAdjustments,
  preset: PhotoPresetId
) {
  const hasAdj =
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.exposure !== 0 ||
    adjustments.warmth !== 0 ||
    preset !== 'none';

  if (!hasAdj) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const expMult = Math.pow(2, adjustments.exposure / 66.6);
  const brightOffset = adjustments.brightness * 1.2;

  const cVal = adjustments.contrast * 2.55;
  const contrastFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));

  const satFactor = 1 + adjustments.saturation / 100;
  const warmR = adjustments.warmth * 0.45;
  const warmG = adjustments.warmth * 0.08;
  const warmB = -adjustments.warmth * 0.45;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Exposure
    if (adjustments.exposure !== 0) {
      r *= expMult;
      g *= expMult;
      b *= expMult;
    }

    // 2. Brightness
    if (adjustments.brightness !== 0) {
      r += brightOffset;
      g += brightOffset;
      b += brightOffset;
    }

    // 3. Contrast
    if (adjustments.contrast !== 0) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }

    // 4. Warmth
    if (adjustments.warmth !== 0) {
      r += warmR;
      g += warmG;
      b += warmB;
    }

    // 5. Saturation
    if (adjustments.saturation !== 0) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * satFactor;
      g = lum + (g - lum) * satFactor;
      b = lum + (b - lum) * satFactor;
    }

    // 6. Preset filter
    switch (preset) {
      case 'bw': {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const bwC = 1.12 * (lum - 128) + 128;
        r = g = b = bwC;
        break;
      }
      case 'sepia': {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = sr;
        g = sg;
        b = sb;
        break;
      }
      case 'vintage': {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = (r * 0.62 + sr * 0.38) * 0.92 + 16;
        g = (g * 0.62 + sg * 0.38) * 0.92 + 12;
        b = (b * 0.62 + sb * 0.38) * 0.88 + 14;
        break;
      }
      case 'cool': {
        r = 1.06 * (r * 0.92 - 128) + 128;
        g = 1.06 * (g * 0.99 - 128) + 128;
        b = 1.06 * (b * 1.12 - 128) + 128;
        break;
      }
      case 'warm': {
        r = r * 1.1 + 6;
        g = g * 1.03 + 2;
        b = b * 0.88;
        break;
      }
      case 'high-contrast': {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = 1.38 * (lum + (r - lum) * 1.15 - 128) + 128;
        g = 1.38 * (lum + (g - lum) * 1.15 - 128) + 128;
        b = 1.38 * (lum + (b - lum) * 1.15 - 128) + 128;
        break;
      }
      case 'faded': {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = (lum + (r - lum) * 0.82) * 0.86 + 24;
        g = (lum + (g - lum) * 0.82) * 0.86 + 24;
        b = (lum + (b - lum) * 0.82) * 0.86 + 26;
        break;
      }
      default:
        break;
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Applies a 3x3 unsharp mask convolution kernel for crisp sharpness.
 */
function applySharpnessPass(canvas: HTMLCanvasElement, sharpness: number) {
  if (sharpness <= 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  if (w < 3 || h < 3) return;

  const srcData = ctx.getImageData(0, 0, w, h);
  const dstData = ctx.createImageData(w, h);
  const s = srcData.data;
  const d = dstData.data;

  const amount = (sharpness / 100) * 0.65;
  const center = 1 + 4 * amount;
  const side = -amount;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        d[idx] = s[idx];
        d[idx + 1] = s[idx + 1];
        d[idx + 2] = s[idx + 2];
        d[idx + 3] = s[idx + 3];
        continue;
      }

      const up = ((y - 1) * w + x) * 4;
      const down = ((y + 1) * w + x) * 4;
      const left = (y * w + (x - 1)) * 4;
      const right = (y * w + (x + 1)) * 4;

      d[idx] = clampByte(s[idx] * center + (s[up] + s[down] + s[left] + s[right]) * side);
      d[idx + 1] = clampByte(
        s[idx + 1] * center + (s[up + 1] + s[down + 1] + s[left + 1] + s[right + 1]) * side
      );
      d[idx + 2] = clampByte(
        s[idx + 2] * center + (s[up + 2] + s[down + 2] + s[left + 2] + s[right + 2]) * side
      );
      d[idx + 3] = s[idx + 3];
    }
  }

  ctx.putImageData(dstData, 0, 0);
}

/**
 * Applies a smooth radial gradient vignette darkening around corners.
 */
function applyVignettePass(canvas: HTMLCanvasElement, vignette: number) {
  if (vignette <= 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const outerRadius = Math.hypot(cx, cy);
  const innerRadius = outerRadius * 0.35;
  const alpha = (vignette / 100) * 0.85;

  const grad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.65, `rgba(0,0,0,${(alpha * 0.35).toFixed(3)})`);
  grad.addColorStop(1, `rgba(0,0,0,${alpha.toFixed(3)})`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Draws brush strokes on a separate isolated transparent layer first so eraser strokes
 * erase only brush ink rather than cutting holes in the photo underneath.
 */
function applyStrokesPass(canvas: HTMLCanvasElement, state: PhotoEditState) {
  if (state.strokes.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  const strokeCanvas = document.createElement('canvas');
  strokeCanvas.width = w;
  strokeCanvas.height = h;
  const sCtx = strokeCanvas.getContext('2d');
  if (!sCtx) return;

  for (const stroke of state.strokes) {
    if (stroke.points.length === 0) continue;
    sCtx.save();
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';
    sCtx.lineWidth = Math.max(1, (stroke.size / 1000) * w);

    if (stroke.isEraser) {
      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.globalAlpha = 1;
      sCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      sCtx.globalCompositeOperation = 'source-over';
      sCtx.globalAlpha = stroke.opacity;
      sCtx.strokeStyle = stroke.color;
    }

    sCtx.beginPath();
    const first = stroke.points[0];
    sCtx.moveTo(first.x * w, first.y * h);
    if (stroke.points.length === 1) {
      sCtx.lineTo(first.x * w + 0.01, first.y * h + 0.01);
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        sCtx.lineTo(pt.x * w, pt.y * h);
      }
    }
    sCtx.stroke();
    sCtx.restore();
  }

  ctx.drawImage(strokeCanvas, 0, 0);
}

/**
 * Draws text layers scaled proportionally to canvas width.
 */
function applyTextLayersPass(canvas: HTMLCanvasElement, state: PhotoEditState) {
  if (state.textLayers.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  for (const layer of state.textLayers) {
    if (!layer.text.trim()) continue;
    const pxSize = Math.max(8, (layer.fontSize / 1000) * w);
    const weight = layer.bold ? '700' : '400';
    const style = layer.italic ? 'italic' : 'normal';

    ctx.save();
    ctx.font = `${style} ${weight} ${pxSize}px ${layer.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = layer.x * w;
    const cy = layer.y * h;
    const lines = layer.text.split('\n');
    const lineHeight = pxSize * 1.25;
    const totalH = lines.length * lineHeight;

    if (layer.bgColor && layer.bgColor !== 'transparent') {
      let maxLineW = 0;
      for (const line of lines) {
        maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
      }
      const padX = pxSize * 0.4;
      const padY = pxSize * 0.25;
      ctx.fillStyle = layer.bgColor;
      ctx.beginPath();
      ctx.roundRect(
        cx - maxLineW / 2 - padX,
        cy - totalH / 2 - padY,
        maxLineW + padX * 2,
        totalH + padY * 2,
        pxSize * 0.18
      );
      ctx.fill();
    }

    ctx.fillStyle = layer.color;
    lines.forEach((line, idx) => {
      const ly = cy - totalH / 2 + lineHeight * (idx + 0.5);
      ctx.fillText(line, cx, ly);
    });

    ctx.restore();
  }
}

/**
 * Draws an optional solid frame/border inside or framing the outer edge of the image.
 * Scales proportionally to canvas width so preview and full-res export match identically.
 */
function applyBorderPass(canvas: HTMLCanvasElement, state: PhotoEditState) {
  if (!state.border || state.border.width <= 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const px = Math.max(1, Math.round((state.border.width / 1000) * Math.min(w, h)));

  ctx.save();
  ctx.fillStyle = state.border.color || '#ffffff';
  // Top, bottom, left, right frame bars
  ctx.fillRect(0, 0, w, px);
  ctx.fillRect(0, h - px, w, px);
  ctx.fillRect(0, px, px, Math.max(0, h - px * 2));
  ctx.fillRect(w - px, px, px, Math.max(0, h - px * 2));
  ctx.restore();
}

/**
 * Full deterministic photo rendering pipeline.
 * Pass `maxDimension` for fast 60fps interactive preview, or omit it for full-resolution export.
 */
export function renderPhotoToCanvas(
  img: HTMLImageElement,
  state: PhotoEditState,
  destCanvas: HTMLCanvasElement,
  maxDimension?: number
): { width: number; height: number } {
  const dims = renderOrientedCroppedBase(img, state, destCanvas, maxDimension);

  applyBlurPass(destCanvas, state.adjustments.blur);
  applyColorAndPresetPass(destCanvas, state.adjustments, state.preset);
  applySharpnessPass(destCanvas, state.adjustments.sharpness);
  applyVignettePass(destCanvas, state.adjustments.vignette);
  applyStrokesPass(destCanvas, state);
  applyBorderPass(destCanvas, state);
  applyTextLayersPass(destCanvas, state);

  return dims;
}

export function getExportDimensions(
  targetWidth: number,
  targetHeight: number,
  sizePreset: PhotoExportSizePreset
): { width: number; height: number } {
  if (sizePreset === 'original') {
    return { width: targetWidth, height: targetHeight };
  }
  const maxDim = sizePreset === '1080' ? 1080 : 720;
  if (targetWidth <= maxDim && targetHeight <= maxDim) {
    return { width: targetWidth, height: targetHeight };
  }
  const scale = maxDim / Math.max(targetWidth, targetHeight);
  return {
    width: Math.max(1, Math.round(targetWidth * scale)),
    height: Math.max(1, Math.round(targetHeight * scale)),
  };
}

/**
 * Exports the edited photo to a Blob at the selected size preset.
 */
export function exportPhotoBlob(
  img: HTMLImageElement,
  state: PhotoEditState,
  format: PhotoExportFormat,
  quality: number,
  sizePreset: PhotoExportSizePreset = 'original'
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const maxDim = sizePreset === '1080' ? 1080 : sizePreset === '720' ? 720 : undefined;
    renderPhotoToCanvas(img, state, canvas, maxDim);

    // JPEG does not support transparency; composite over white if needed
    if (format === 'jpeg') {
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fCtx = flat.getContext('2d');
      if (fCtx) {
        fCtx.fillStyle = '#ffffff';
        fCtx.fillRect(0, 0, flat.width, flat.height);
        fCtx.drawImage(canvas, 0, 0);
        flat.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode JPEG image.'))),
          'image/jpeg',
          quality
        );
        return;
      }
    }

    const mime =
      format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to encode ${format.toUpperCase()} image.`));
        }
      },
      mime,
      format === 'png' ? undefined : quality
    );
  });
}

/**
 * Copies the edited photo as a PNG image directly to the user's clipboard.
 */
export async function copyPhotoToClipboard(
  img: HTMLImageElement,
  state: PhotoEditState,
  sizePreset: PhotoExportSizePreset = 'original'
): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser.');
  }
  const blob = await exportPhotoBlob(img, state, 'png', 1, sizePreset);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/**
 * Generates a clean client-side sample photograph onto a canvas data URL
 * (zero external requests) for quick exploration.
 */
export function generateSamplePhotoDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1066;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, '#1e3a5f');
  sky.addColorStop(0.5, '#4b79a1');
  sky.addColorStop(0.85, '#e89c6a');
  sky.addColorStop(1, '#f4c694');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1600, 1066);

  // Sun glow
  const sun = ctx.createRadialGradient(1120, 420, 10, 1120, 420, 260);
  sun.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  sun.addColorStop(0.3, 'rgba(255, 210, 145, 0.45)');
  sun.addColorStop(1, 'rgba(255, 190, 120, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(800, 120, 640, 600);

  // Far mountain ridge
  ctx.fillStyle = '#3b4e6b';
  ctx.beginPath();
  ctx.moveTo(0, 680);
  ctx.lineTo(240, 520);
  ctx.lineTo(480, 610);
  ctx.lineTo(790, 460);
  ctx.lineTo(1080, 580);
  ctx.lineTo(1360, 490);
  ctx.lineTo(1600, 600);
  ctx.lineTo(1600, 1066);
  ctx.lineTo(0, 1066);
  ctx.closePath();
  ctx.fill();

  // Mid ridge
  ctx.fillStyle = '#263449';
  ctx.beginPath();
  ctx.moveTo(0, 740);
  ctx.lineTo(310, 620);
  ctx.lineTo(620, 700);
  ctx.lineTo(960, 580);
  ctx.lineTo(1290, 670);
  ctx.lineTo(1600, 610);
  ctx.lineTo(1600, 1066);
  ctx.lineTo(0, 1066);
  ctx.closePath();
  ctx.fill();

  // Foreground lake reflection
  const lake = ctx.createLinearGradient(0, 740, 0, 1066);
  lake.addColorStop(0, '#2c3d55');
  lake.addColorStop(0.5, '#1b2636');
  lake.addColorStop(1, '#111822');
  ctx.fillStyle = lake;
  ctx.fillRect(0, 740, 1600, 326);

  // Warm reflection shimmer on water
  ctx.fillStyle = 'rgba(244, 198, 148, 0.28)';
  for (let i = 0; i < 16; i++) {
    const y = 760 + i * 18;
    const w = 220 - i * 8;
    ctx.fillRect(1120 - w / 2 + Math.sin(i * 1.4) * 14, y, w, 4);
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}
