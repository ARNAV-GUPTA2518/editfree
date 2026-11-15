import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type {
  VideoEditState,
  VideoExportFormat,
  VideoExportQuality,
  VideoFilterPresetId,
} from '../types/editor';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

/**
 * Loads the single-threaded ffmpeg.wasm core from local static assets (`public/ffmpeg/`)
 * so it works without COOP/COEP headers on GitHub Pages and static hosts.
 */
async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }

  const base = new URL('ffmpeg', document.baseURI).href.replace(/\/$/, '');
  const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');

  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegInstance = ffmpeg;
  ffmpegLoaded = true;
  return ffmpeg;
}

export function cancelVideoExport(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // Ignore termination error
    }
    ffmpegInstance = null;
    ffmpegLoaded = false;
  }
}

/**
 * Renders the video text overlay onto a transparent PNG matching the rotated output frame
 * so FFmpeg composites crisp text without requiring external .ttf font files in MEMFS.
 */
async function createTextOverlayPng(
  state: VideoEditState,
  outWidth: number,
  outHeight: number
): Promise<Uint8Array | null> {
  if (!state.textOverlay.enabled || !state.textOverlay.text.trim()) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { textOverlay } = state;
  const pxSize = Math.max(12, Math.round((textOverlay.fontSize / 1080) * outHeight));
  const weight = textOverlay.bold ? '700' : '400';
  ctx.font = `${weight} ${pxSize}px ${textOverlay.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = textOverlay.x * outWidth;
  const cy = textOverlay.y * outHeight;
  const lines = textOverlay.text.split('\n');
  const lineHeight = pxSize * 1.25;
  const totalH = lines.length * lineHeight;

  if (textOverlay.bgColor && textOverlay.bgColor !== 'transparent') {
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    }
    const padX = pxSize * 0.45;
    const padY = pxSize * 0.25;
    ctx.fillStyle = textOverlay.bgColor;
    ctx.beginPath();
    ctx.roundRect(
      cx - maxW / 2 - padX,
      cy - totalH / 2 - padY,
      maxW + padX * 2,
      totalH + padY * 2,
      pxSize * 0.18
    );
    ctx.fill();
  }

  ctx.fillStyle = textOverlay.color;
  lines.forEach((line, idx) => {
    const ly = cy - totalH / 2 + lineHeight * (idx + 0.5);
    ctx.fillText(line, cx, ly);
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Builds chained `atempo` filter steps because FFmpeg's `atempo` only accepts 0.5..2.0.
 */
function buildAtempoChain(speed: number): string[] {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1.0) > 0.001) {
    filters.push(`atempo=${remaining.toFixed(4)}`);
  }
  return filters;
}

function buildColorFilters(
  preset: VideoFilterPresetId,
  brightness: number,
  contrast: number,
  saturation: number
): string[] {
  const filters: string[] = [];

  // Preset base
  if (preset === 'bw') {
    filters.push('hue=s=0,eq=contrast=1.1');
  } else if (preset === 'sepia') {
    filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
  } else if (preset === 'warm') {
    filters.push('colorchannelmixer=1.08:0:0:0:0:1.02:0:0:0:0:0.88');
  } else if (preset === 'cool') {
    filters.push('colorchannelmixer=0.92:0:0:0:0:0.99:0:0:0:0:1.12');
  } else if (preset === 'high-contrast') {
    filters.push('eq=contrast=1.35:saturation=1.15');
  }

  // Manual eq adjustments
  const hasManual = brightness !== 0 || contrast !== 0 || saturation !== 0;
  if (hasManual) {
    const bVal = (brightness / 100).toFixed(3); // -0.5 to 0.5
    const cVal = Math.max(0.2, Math.min(2.5, 1 + contrast / 50)).toFixed(3);
    const sVal = Math.max(0, Math.min(3, 1 + saturation / 100)).toFixed(3);
    filters.push(`eq=brightness=${bVal}:contrast=${cVal}:saturation=${sVal}`);
  }

  return filters;
}

export interface ExportVideoOptions {
  file: File;
  videoWidth: number;
  videoHeight: number;
  state: VideoEditState;
  format: VideoExportFormat;
  quality?: VideoExportQuality;
  onProgress: (percent: number, stage: string) => void;
}

export async function exportVideoWithFFmpeg({
  file,
  videoWidth,
  videoHeight,
  state,
  format,
  quality = 'medium',
  onProgress,
}: ExportVideoOptions): Promise<Blob> {
  onProgress(2, 'Loading video engine (ffmpeg.wasm)…');

  const logs: string[] = [];
  const ffmpeg = await getFFmpeg((msg) => {
    logs.push(msg);
  });

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.max(5, Math.min(99, Math.round(progress * 100)));
    onProgress(pct, 'Encoding video…');
  };
  ffmpeg.on('progress', progressHandler);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `input.${ext}`;
  const outputName = format === 'mp4' ? 'output.mp4' : 'output.webm';

  try {
    onProgress(5, 'Reading source file…');
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // Probe streams via FFmpeg stderr log to detect if audio track exists
    logs.length = 0;
    await ffmpeg.exec(['-i', inputName]);
    const hasAudioStream = logs.some((line) => /Stream #\d+:\d+.*Audio:/.test(line));
    const includeAudio = hasAudioStream && !state.muted && state.volume > 0;

    // Sort segments chronologically
    const segs = [...state.segments].sort((a, b) => a.start - b.start);
    if (segs.length === 0) {
      throw new Error('At least one timeline segment is required to export.');
    }

    // Calculate rotated dimensions (must be even for libx264/libvpx)
    const rot = ((state.rotate90 % 360) + 360) % 360;
    const rawOutW = rot === 90 || rot === 270 ? videoHeight : videoWidth;
    const rawOutH = rot === 90 || rot === 270 ? videoWidth : videoHeight;
    const outW = Math.max(2, Math.floor(rawOutW / 2) * 2);
    const outH = Math.max(2, Math.floor(rawOutH / 2) * 2);

    // Optional text overlay PNG
    const overlayPng = await createTextOverlayPng(state, outW, outH);
    if (overlayPng) {
      await ffmpeg.writeFile('overlay.png', overlayPng);
    }

    // Build filter_complex
    const filterParts: string[] = [];

    if (segs.length === 1) {
      const s = segs[0];
      filterParts.push(
        `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=PTS-STARTPTS[vcat]`
      );
      if (includeAudio) {
        filterParts.push(
          `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[acat]`
        );
      }
    } else {
      const vLabels: string[] = [];
      const aLabels: string[] = [];
      segs.forEach((s, idx) => {
        filterParts.push(
          `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=PTS-STARTPTS[v${idx}]`
        );
        vLabels.push(`[v${idx}]`);
        if (includeAudio) {
          filterParts.push(
            `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${idx}]`
          );
          aLabels.push(`[a${idx}]`);
        }
      });

      if (includeAudio) {
        const interleaved = segs.map((_, idx) => `[v${idx}][a${idx}]`).join('');
        filterParts.push(`${interleaved}concat=n=${segs.length}:v=1:a=1[vcat][acat]`);
      } else {
        filterParts.push(`${vLabels.join('')}concat=n=${segs.length}:v=1:a=0[vcat]`);
      }
    }

    // Video transforms, speed, filters, and even-dimension scaling
    const vChain: string[] = [];
    if (Math.abs(state.speed - 1) > 0.001) {
      vChain.push(`setpts=PTS/${state.speed.toFixed(4)}`);
    }
    if (rot === 90) vChain.push('transpose=1');
    else if (rot === 180) vChain.push('hflip,vflip');
    else if (rot === 270) vChain.push('transpose=2');

    vChain.push(
      ...buildColorFilters(
        state.preset,
        state.adjustments.brightness,
        state.adjustments.contrast,
        state.adjustments.saturation
      )
    );
    vChain.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

    if (overlayPng) {
      filterParts.push(`[vcat]${vChain.join(',')}[vpre]`);
      filterParts.push(`[vpre][1:v]overlay=0:0:format=auto[vout]`);
    } else {
      filterParts.push(`[vcat]${vChain.join(',')}[vout]`);
    }

    // Audio chain
    if (includeAudio) {
      const aChain: string[] = [];
      if (Math.abs(state.speed - 1) > 0.001) {
        aChain.push(...buildAtempoChain(state.speed));
      }
      if (Math.abs(state.volume - 1) > 0.01) {
        aChain.push(`volume=${state.volume.toFixed(2)}`);
      }
      if (aChain.length > 0) {
        filterParts.push(`[acat]${aChain.join(',')}[aout]`);
      } else {
        filterParts.push(`[acat]anull[aout]`);
      }
    }

    const args: string[] = ['-i', inputName];
    if (overlayPng) {
      args.push('-i', 'overlay.png');
    }
    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', '[vout]');

    if (includeAudio) {
      args.push('-map', '[aout]');
    } else {
      args.push('-an');
    }

    if (format === 'mp4') {
      const crf = quality === 'high' ? '18' : quality === 'low' ? '30' : '23';
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        crf,
        '-pix_fmt',
        'yuv420p'
      );
      if (includeAudio) {
        args.push('-c:a', 'aac', '-b:a', quality === 'low' ? '96k' : '128k');
      }
      args.push('-movflags', '+faststart', outputName);
    } else {
      const bitrate = quality === 'high' ? '2500k' : quality === 'low' ? '500k' : '1000k';
      args.push(
        '-c:v',
        'libvpx',
        '-b:v',
        bitrate,
        '-deadline',
        'realtime',
        '-cpu-used',
        '4',
        '-pix_fmt',
        'yuv420p'
      );
      if (includeAudio) {
        args.push('-c:a', 'libvorbis', '-b:a', quality === 'low' ? '96k' : '128k');
      }
      args.push(outputName);
    }

    onProgress(10, 'Encoding video…');
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      const tail = logs.slice(-6).join(' | ');
      throw new Error(`Video encoding failed (exit ${exitCode}). ${tail}`);
    }

    onProgress(99, 'Finalizing file…');
    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const bufferCopy = new Uint8Array(bytes.byteLength);
    bufferCopy.set(bytes);
    const mime = format === 'mp4' ? 'video/mp4' : 'video/webm';
    return new Blob([bufferCopy], { type: mime });
  } finally {
    ffmpeg.off('progress', progressHandler);
    // Cleanup virtual MEMFS files safely
    for (const f of [inputName, outputName, 'overlay.png']) {
      try {
        await ffmpeg.deleteFile(f);
      } catch {
        // File might not exist
      }
    }
  }
}

/**
 * Extracts the current paused/scrubbed frame from the HTMLVideoElement
 * at native resolution with rotation, CSS/canvas filter, and text overlay applied.
 */
export async function extractVideoFramePng(
  videoEl: HTMLVideoElement,
  state: VideoEditState,
  cssFilter: string
): Promise<Blob> {
  const srcW = videoEl.videoWidth || 1280;
  const srcH = videoEl.videoHeight || 720;
  const rot = ((state.rotate90 % 360) + 360) % 360;
  const isOdd = rot === 90 || rot === 270;
  const outW = isOdd ? srcH : srcW;
  const outH = isOdd ? srcW : srcH;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create canvas context for frame extraction.');

  ctx.save();
  if (typeof ctx.filter === 'string' && cssFilter && cssFilter !== 'none') {
    ctx.filter = cssFilter;
  }
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(videoEl, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();

  // Composite optional text overlay
  const overlayBytes = await createTextOverlayPng(state, outW, outH);
  if (overlayBytes) {
    const copy = new Uint8Array(overlayBytes.byteLength);
    copy.set(overlayBytes);
    const overlayBlob = new Blob([copy], { type: 'image/png' });
    const imgUrl = URL.createObjectURL(overlayBlob);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, outW, outH);
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to composite text overlay.'));
        img.src = imgUrl;
      });
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode extracted PNG frame.'));
    }, 'image/png');
  });
}
