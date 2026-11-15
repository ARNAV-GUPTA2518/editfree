import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crop,
  Sliders,
  Sparkles,
  Type,
  PenTool,
  Download,
  Undo2,
  Redo2,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Columns2,
  Eye,
  Trash2,
  Plus,
  ImagePlus,
  Eraser,
  Lock,
  Unlock,
  Check,
  X,
  AlertCircle,
  Loader2,
  Copy,
} from 'lucide-react';
import type {
  BrushStroke,
  CropRect,
  PhotoAdjustments,
  PhotoEditState,
  PhotoExportFormat,
  PhotoExportSizePreset,
  PhotoPresetId,
  PhotoToolTab,
  TextLayer,
} from '../../types/editor';
import {
  copyPhotoToClipboard,
  createInitialPhotoState,
  DEFAULT_ADJUSTMENTS,
  exportPhotoBlob,
  flipCropRect,
  generateSamplePhotoDataUrl,
  getExportDimensions,
  getOrientedDimensions,
  PHOTO_PRESETS,
  renderOrientedCroppedBase,
  renderPhotoToCanvas,
  rotateCropRect,
} from '../../utils/photoPipeline';
import { DropZone } from '../DropZone';
import { useToast } from '../Toast';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PREVIEW_DIM = 1400;

const FONT_OPTIONS = [
  { label: 'DM Sans', value: "'DM Sans', sans-serif" },
  { label: 'Plus Jakarta', value: "'Plus Jakarta Sans', sans-serif" },
  { label: 'Serif (Georgia)', value: 'Georgia, serif' },
  { label: 'Monospace', value: "'JetBrains Mono', monospace" },
  { label: 'Display Impact', value: 'Impact, Charcoal, sans-serif' },
];

const COLOR_SWATCHES = [
  '#ffffff',
  '#18181b',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

const ASPECT_PRESETS: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '4:3', ratio: 4 / 3 },
];

interface AdjustmentControlDef {
  key: keyof PhotoAdjustments;
  label: string;
  min: number;
  max: number;
}

const ADJUSTMENT_CONTROLS: AdjustmentControlDef[] = [
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 20 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
];

function cloneState(s: PhotoEditState): PhotoEditState {
  return {
    ...s,
    crop: { ...s.crop },
    adjustments: { ...s.adjustments },
    border: { ...s.border },
    textLayers: s.textLayers.map((t) => ({ ...t })),
    strokes: s.strokes.map((st) => ({ ...st, points: st.points.map((p) => ({ ...p })) })),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface PhotoEditorProps {
  isActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export const PhotoEditor: React.FC<PhotoEditorProps> = ({ isActive = true, onDirtyChange }) => {
  const { showToast } = useToast();
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState<string>('photo');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // History management (past, present, future) + transient liveState during continuous drags
  const [history, setHistory] = useState<{
    past: PhotoEditState[];
    present: PhotoEditState | null;
    future: PhotoEditState[];
  }>({ past: [], present: null, future: [] });

  const [liveState, setLiveState] = useState<PhotoEditState | null>(null);
  const [activeTab, setActiveTab] = useState<PhotoToolTab>('adjust');

  // Compare modes
  const [splitCompare, setSplitCompare] = useState(false);
  const [splitPosition, setSplitPosition] = useState(0.5);
  const [holdingOriginal, setHoldingOriginal] = useState(false);

  // Crop mode state (operates on full uncropped oriented frame while cropping)
  const [isCropping, setIsCropping] = useState(false);
  const [draftCrop, setDraftCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [cropAspect, setCropAspect] = useState<number | null>(null);

  // Resize inputs
  const [resizeW, setResizeW] = useState<string>('0');
  const [resizeH, setResizeH] = useState<string>('0');
  const [lockAspect, setLockAspect] = useState(true);

  // Text tool state
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Draw tool state
  const [brushColor, setBrushColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(14);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [isEraser, setIsEraser] = useState(false);
  const activeStrokeRef = useRef<BrushStroke | null>(null);

  // Export state
  const [exportFormat, setExportFormat] = useState<PhotoExportFormat>('jpeg');
  const [exportQuality, setExportQuality] = useState(0.9);
  const [exportSizePreset, setExportSizePreset] = useState<PhotoExportSizePreset>('original');
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [hasExportedSinceEdit, setHasExportedSinceEdit] = useState(false);

  // Preset thumbnails cache
  const [presetThumbs, setPresetThumbs] = useState<Record<string, string>>({});

  // Canvas & container refs
  const stageRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDisplaySize, setCanvasDisplaySize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  // Commit a new edit state onto undo history
  const commitState = useCallback((next: PhotoEditState) => {
    const cloned = cloneState(next);
    setLiveState(cloned);
    setHasExportedSinceEdit(false);
    setHistory((prev) => {
      if (!prev.present) {
        return { past: [], present: cloned, future: [] };
      }
      return {
        past: [...prev.past.slice(-39), prev.present],
        present: cloned,
        future: [],
      };
    });
  }, []);

  useEffect(() => {
    onDirtyChange?.(Boolean(imageEl) && history.past.length > 0 && !hasExportedSinceEdit);
  }, [imageEl, history.past.length, hasExportedSinceEdit, onDirtyChange]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0 || !prev.present) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      setLiveState(cloneState(previous));
      setResizeW(String(previous.targetWidth));
      setResizeH(String(previous.targetHeight));
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0 || !prev.present) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      setLiveState(cloneState(next));
      setResizeW(String(next.targetWidth));
      setResizeH(String(next.targetHeight));
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  // Load image from File or Data URL
  const loadImageSource = useCallback((src: string, name: string, revokeUrl?: string) => {
    const img = new Image();
    img.onload = () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const initial = createInitialPhotoState(w, h);
      setImageEl(img);
      setFileName(name);
      setLoadError(null);
      setExportError(null);
      setHistory({ past: [], present: initial, future: [] });
      setLiveState(cloneState(initial));
      setResizeW(String(w));
      setResizeH(String(h));
      setIsCropping(false);
      setSplitCompare(false);
      setSelectedTextId(null);
    };
    img.onerror = () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      setLoadError('Could not decode this image file. Please choose a valid JPG, PNG, or WebP.');
    };
    img.src = src;
  }, []);

  const handleFileSelected = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const validExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      if (!ACCEPTED_TYPES.includes(file.type) && !validExt) {
        setLoadError(
          `Unsupported file "${file.name}". Please upload a JPG, PNG, or WebP image.`
        );
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
      loadImageSource(objectUrl, baseName, objectUrl);
    },
    [loadImageSource]
  );

  const handleLoadSample = useCallback(() => {
    const dataUrl = generateSamplePhotoDataUrl();
    if (dataUrl) {
      loadImageSource(dataUrl, 'sample-landscape');
    }
  }, [loadImageSource]);

  // Keyboard shortcuts for PhotoEditor
  useEffect(() => {
    if (!isActive || !imageEl || !liveState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (isEditingInput) return;
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (isEditingInput) return;
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTextId && !isEditingInput) {
        e.preventDefault();
        const next = {
          ...liveState,
          textLayers: liveState.textLayers.filter((t) => t.id !== selectedTextId),
        };
        setSelectedTextId(null);
        commitState(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, imageEl, liveState, selectedTextId, handleUndo, handleRedo, commitState]);

  // Render preview & original canvases whenever liveState or crop mode changes
  useEffect(() => {
    if (!imageEl || !liveState || !previewCanvasRef.current) return;

    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      if (!previewCanvasRef.current) return;

      if (isCropping) {
        // When cropping, render full uncropped oriented frame so user can drag crop box
        const srcW = imageEl.naturalWidth;
        const srcH = imageEl.naturalHeight;
        const oriented = getOrientedDimensions(srcW, srcH, liveState.rotate90);
        const cropPreviewState: PhotoEditState = {
          ...liveState,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          targetWidth: oriented.width,
          targetHeight: oriented.height,
        };
        renderPhotoToCanvas(imageEl, cropPreviewState, previewCanvasRef.current, MAX_PREVIEW_DIM);
      } else {
        renderPhotoToCanvas(imageEl, liveState, previewCanvasRef.current, MAX_PREVIEW_DIM);
      }

      if ((splitCompare || holdingOriginal) && originalCanvasRef.current && !isCropping) {
        renderOrientedCroppedBase(imageEl, liveState, originalCanvasRef.current, MAX_PREVIEW_DIM);
      }

      const rect = previewCanvasRef.current.getBoundingClientRect();
      setCanvasDisplaySize({ w: rect.width, h: rect.height });
    });

    return () => cancelAnimationFrame(rafId);
  }, [imageEl, liveState, isCropping, splitCompare, holdingOriginal]);

  // Keep canvasDisplaySize updated on window resize
  useEffect(() => {
    const updateRect = () => {
      if (previewCanvasRef.current) {
        const rect = previewCanvasRef.current.getBoundingClientRect();
        setCanvasDisplaySize({ w: rect.width, h: rect.height });
      }
    };
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  // Generate preset thumbnails when image loads or orientation changes
  useEffect(() => {
    if (!imageEl) return;
    const base = createInitialPhotoState(imageEl.naturalWidth, imageEl.naturalHeight);
    if (liveState) {
      base.rotate90 = liveState.rotate90;
      base.flipH = liveState.flipH;
      base.flipV = liveState.flipV;
      base.crop = liveState.crop;
      const oriented = getOrientedDimensions(
        imageEl.naturalWidth,
        imageEl.naturalHeight,
        liveState.rotate90
      );
      base.targetWidth = Math.max(1, Math.round(oriented.width * liveState.crop.width));
      base.targetHeight = Math.max(1, Math.round(oriented.height * liveState.crop.height));
    }

    const thumbs: Record<string, string> = {};
    const thumbCanvas = document.createElement('canvas');
    for (const p of PHOTO_PRESETS) {
      renderPhotoToCanvas(imageEl, { ...base, preset: p.id }, thumbCanvas, 120);
      thumbs[p.id] = thumbCanvas.toDataURL('image/jpeg', 0.78);
    }
    setPresetThumbs(thumbs);
  }, [imageEl, liveState?.rotate90, liveState?.flipH, liveState?.flipV, liveState?.crop]);

  // Estimate export file size when on Export tab
  useEffect(() => {
    if (activeTab !== 'export' || !imageEl || !liveState) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      exportPhotoBlob(imageEl, liveState, exportFormat, exportQuality, exportSizePreset)
        .then((blob) => {
          if (!cancelled) setEstimatedSize(blob.size);
        })
        .catch(() => {
          if (!cancelled) setEstimatedSize(null);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, imageEl, liveState, exportFormat, exportQuality, exportSizePreset]);

  // Adjustment slider change (live preview) & commit
  const handleAdjustmentChange = (key: keyof PhotoAdjustments, value: number) => {
    if (!liveState) return;
    setLiveState({
      ...liveState,
      adjustments: {
        ...liveState.adjustments,
        [key]: value,
      },
    });
  };

  const commitLiveChanges = () => {
    if (!liveState || !history.present) return;
    if (JSON.stringify(liveState) !== JSON.stringify(history.present)) {
      commitState(liveState);
    }
  };

  // Transform actions
  const handleRotate90 = (direction: 'cw' | 'ccw') => {
    if (!liveState) return;
    const delta = direction === 'cw' ? 90 : -90;
    const nextRot = ((liveState.rotate90 + delta) % 360 + 360) % 360;
    const nextCrop = rotateCropRect(liveState.crop, direction);
    const next: PhotoEditState = {
      ...liveState,
      rotate90: nextRot,
      crop: nextCrop,
      targetWidth: liveState.targetHeight,
      targetHeight: liveState.targetWidth,
    };
    setResizeW(String(next.targetWidth));
    setResizeH(String(next.targetHeight));
    commitState(next);
  };

  const handleFlip = (axis: 'h' | 'v') => {
    if (!liveState) return;
    const next: PhotoEditState = {
      ...liveState,
      flipH: axis === 'h' ? !liveState.flipH : liveState.flipH,
      flipV: axis === 'v' ? !liveState.flipV : liveState.flipV,
      crop: flipCropRect(liveState.crop, axis),
    };
    commitState(next);
  };

  const startCropping = () => {
    if (!liveState) return;
    setDraftCrop({ ...liveState.crop });
    setCropAspect(null);
    setSplitCompare(false);
    setIsCropping(true);
  };

  const applyCrop = () => {
    if (!liveState || !imageEl) return;
    const oriented = getOrientedDimensions(
      imageEl.naturalWidth,
      imageEl.naturalHeight,
      liveState.rotate90
    );
    const newW = Math.max(1, Math.round(oriented.width * draftCrop.width));
    const newH = Math.max(1, Math.round(oriented.height * draftCrop.height));
    const next: PhotoEditState = {
      ...liveState,
      crop: { ...draftCrop },
      targetWidth: newW,
      targetHeight: newH,
    };
    setResizeW(String(newW));
    setResizeH(String(newH));
    setIsCropping(false);
    commitState(next);
  };

  const handleApplyAspectPreset = (ratio: number | null) => {
    setCropAspect(ratio);
    if (!ratio || !imageEl || !liveState) return;
    const oriented = getOrientedDimensions(
      imageEl.naturalWidth,
      imageEl.naturalHeight,
      liveState.rotate90
    );
    const frameAspect = oriented.width / oriented.height;
    // Normalized crop box dimensions that yield `ratio` in pixel space
    let w = 0.85;
    let h = (w * frameAspect) / ratio;
    if (h > 0.85) {
      h = 0.85;
      w = (h * ratio) / frameAspect;
    }
    setDraftCrop({
      x: (1 - w) / 2,
      y: (1 - h) / 2,
      width: w,
      height: h,
    });
  };

  // Interactive crop box pointer dragging
  const handleCropPointerDown = (
    e: React.PointerEvent,
    handle: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!previewCanvasRef.current || !imageEl || !liveState) return;

    const rect = previewCanvasRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initial = { ...draftCrop };
    const oriented = getOrientedDimensions(
      imageEl.naturalWidth,
      imageEl.naturalHeight,
      liveState.rotate90
    );
    const frameAspect = oriented.width / oriented.height;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      const minSize = 0.06;

      if (handle === 'move') {
        const nx = Math.max(0, Math.min(1 - initial.width, initial.x + dx));
        const ny = Math.max(0, Math.min(1 - initial.height, initial.y + dy));
        setDraftCrop({ ...initial, x: nx, y: ny });
        return;
      }

      let x = initial.x;
      let y = initial.y;
      let w = initial.width;
      let h = initial.height;

      if (handle.includes('e')) {
        w = Math.max(minSize, Math.min(1 - initial.x, initial.width + dx));
      }
      if (handle.includes('s')) {
        h = Math.max(minSize, Math.min(1 - initial.y, initial.height + dy));
      }
      if (handle.includes('w')) {
        const maxDx = initial.width - minSize;
        const clampedDx = Math.max(-initial.x, Math.min(maxDx, dx));
        x = initial.x + clampedDx;
        w = initial.width - clampedDx;
      }
      if (handle.includes('n')) {
        const maxDy = initial.height - minSize;
        const clampedDy = Math.max(-initial.y, Math.min(maxDy, dy));
        y = initial.y + clampedDy;
        h = initial.height - clampedDy;
      }

      if (cropAspect) {
        // Adjust height to satisfy target pixel aspect ratio
        const targetH = (w * frameAspect) / cropAspect;
        if (y + targetH <= 1 && targetH >= minSize) {
          h = targetH;
        } else {
          const clampedH = Math.min(1 - y, Math.max(minSize, h));
          h = clampedH;
          w = (h * cropAspect) / frameAspect;
          if (x + w > 1) w = 1 - x;
        }
      }

      setDraftCrop({ x, y, width: w, height: h });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Resize inputs handler
  const handleResizeInput = (axis: 'w' | 'h', raw: string) => {
    if (axis === 'w') {
      setResizeW(raw);
      const val = parseInt(raw, 10);
      if (lockAspect && liveState && !isNaN(val) && val > 0 && liveState.targetWidth > 0) {
        const ratio = liveState.targetHeight / liveState.targetWidth;
        setResizeH(String(Math.max(1, Math.round(val * ratio))));
      }
    } else {
      setResizeH(raw);
      const val = parseInt(raw, 10);
      if (lockAspect && liveState && !isNaN(val) && val > 0 && liveState.targetHeight > 0) {
        const ratio = liveState.targetWidth / liveState.targetHeight;
        setResizeW(String(Math.max(1, Math.round(val * ratio))));
      }
    }
  };

  const applyResize = () => {
    if (!liveState) return;
    const w = Math.max(16, Math.min(8000, parseInt(resizeW, 10) || liveState.targetWidth));
    const h = Math.max(16, Math.min(8000, parseInt(resizeH, 10) || liveState.targetHeight));
    setResizeW(String(w));
    setResizeH(String(h));
    commitState({ ...liveState, targetWidth: w, targetHeight: h });
  };

  // Text layer management
  const selectedText = useMemo(
    () => liveState?.textLayers.find((t) => t.id === selectedTextId) ?? null,
    [liveState, selectedTextId]
  );

  const handleAddText = () => {
    if (!liveState) return;
    const id = `txt_${Date.now()}`;
    const newLayer: TextLayer = {
      id,
      text: 'Double-tap or edit text',
      x: 0.5,
      y: 0.5,
      fontSize: 56,
      fontFamily: "'DM Sans', sans-serif",
      color: '#ffffff',
      bold: true,
      italic: false,
      bgColor: 'rgba(0,0,0,0.45)',
    };
    setSelectedTextId(id);
    commitState({
      ...liveState,
      textLayers: [...liveState.textLayers, newLayer],
    });
  };

  const updateSelectedText = (patch: Partial<TextLayer>, commit = false) => {
    if (!liveState || !selectedTextId) return;
    const next: PhotoEditState = {
      ...liveState,
      textLayers: liveState.textLayers.map((t) =>
        t.id === selectedTextId ? { ...t, ...patch } : t
      ),
    };
    if (commit) {
      commitState(next);
    } else {
      setLiveState(next);
    }
  };

  // Canvas pointer handlers for Drawing & Text dragging
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!liveState || !previewCanvasRef.current || isCropping) return;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (activeTab === 'draw') {
      e.preventDefault();
      const stroke: BrushStroke = {
        id: `stk_${Date.now()}`,
        points: [{ x: nx, y: ny }],
        color: brushColor,
        size: brushSize,
        opacity: brushOpacity,
        isEraser,
      };
      activeStrokeRef.current = stroke;
      setLiveState({
        ...liveState,
        strokes: [...liveState.strokes, stroke],
      });

      const onMove = (ev: PointerEvent) => {
        if (!activeStrokeRef.current || !previewCanvasRef.current) return;
        const r = previewCanvasRef.current.getBoundingClientRect();
        const px = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        const py = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
        activeStrokeRef.current = {
          ...activeStrokeRef.current,
          points: [...activeStrokeRef.current.points, { x: px, y: py }],
        };
        setLiveState((prev) => {
          if (!prev) return prev;
          const rest = prev.strokes.slice(0, -1);
          return { ...prev, strokes: [...rest, activeStrokeRef.current!] };
        });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (activeStrokeRef.current) {
          const finalStroke = activeStrokeRef.current;
          activeStrokeRef.current = null;
          setLiveState((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              strokes: [...prev.strokes.slice(0, -1), finalStroke],
            };
            commitState(updated);
            return updated;
          });
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    // Text dragging on canvas (available in Text tab or when clicking a text layer)
    if (liveState.textLayers.length > 0) {
      // Find closest text layer within hit threshold
      let hitLayer: TextLayer | null = null;
      let bestDist = 0.14;
      for (let i = liveState.textLayers.length - 1; i >= 0; i--) {
        const layer = liveState.textLayers[i];
        const dist = Math.hypot(layer.x - nx, layer.y - ny);
        if (dist < bestDist) {
          bestDist = dist;
          hitLayer = layer;
        }
      }

      if (hitLayer) {
        e.preventDefault();
        setSelectedTextId(hitLayer.id);
        const startNx = nx;
        const startNy = ny;
        const origX = hitLayer.x;
        const origY = hitLayer.y;
        const targetId = hitLayer.id;
        let latestState = liveState;

        const onMove = (ev: PointerEvent) => {
          if (!previewCanvasRef.current) return;
          const r = previewCanvasRef.current.getBoundingClientRect();
          const cx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
          const cy = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
          const dx = cx - startNx;
          const dy = cy - startNy;
          const nextX = Math.max(0.02, Math.min(0.98, origX + dx));
          const nextY = Math.max(0.02, Math.min(0.98, origY + dy));
          setLiveState((prev) => {
            if (!prev) return prev;
            latestState = {
              ...prev,
              textLayers: prev.textLayers.map((t) =>
                t.id === targetId ? { ...t, x: nextX, y: nextY } : t
              ),
            };
            return latestState;
          });
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          commitState(latestState);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }
    }
  };

  const handleResetAll = () => {
    if (!imageEl) return;
    const fresh = createInitialPhotoState(imageEl.naturalWidth, imageEl.naturalHeight);
    setResizeW(String(fresh.targetWidth));
    setResizeH(String(fresh.targetHeight));
    setSelectedTextId(null);
    setIsCropping(false);
    setSplitCompare(false);
    commitState(fresh);
  };

  const handleDownload = async () => {
    if (!imageEl || !liveState) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const blob = await exportPhotoBlob(
        imageEl,
        liveState,
        exportFormat,
        exportQuality,
        exportSizePreset
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
      const downloadName = `${fileName}-edited.${ext}`;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHasExportedSinceEdit(true);
      showToast(`Saved ${downloadName}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to export image.';
      setExportError(msg);
      showToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!imageEl || !liveState) return;
    setIsCopying(true);
    try {
      await copyPhotoToClipboard(imageEl, liveState, exportSizePreset);
      showToast('Edited photo copied to clipboard', 'success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not copy image to clipboard.';
      showToast(msg, 'error');
    } finally {
      setIsCopying(false);
    }
  };

  // Empty state when no photo is loaded
  if (!imageEl || !liveState) {
    return (
      <DropZone
        title="Open a photo to start editing"
        subtitle="Crop, adjust lighting, apply classic filters, add text or brush strokes — all locally on your device."
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        supportedLabel="Supports JPG · PNG · WebP"
        onFileSelected={handleFileSelected}
        errorMessage={loadError}
        secondaryActionLabel="Try sample photo"
        onSecondaryAction={handleLoadSample}
        icon={<ImagePlus className="w-6 h-6" aria-hidden="true" />}
      />
    );
  }

  const toolTabs: { id: PhotoToolTab; label: string; icon: React.ReactNode }[] = [
    { id: 'transform', label: 'Transform', icon: <Crop className="w-4 h-4" /> },
    { id: 'adjust', label: 'Adjust', icon: <Sliders className="w-4 h-4" /> },
    { id: 'filters', label: 'Filters', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'draw', label: 'Draw', icon: <PenTool className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Workspace Action Bar */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 sm:px-5 py-2 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-3 min-w-0">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer">
            <ImagePlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Open</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </label>

          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 truncate">
            <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-44">
              {fileName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {liveState.targetWidth} × {liveState.targetHeight} px
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          <button
            type="button"
            onMouseDown={() => setHoldingOriginal(true)}
            onMouseUp={() => setHoldingOriginal(false)}
            onMouseLeave={() => setHoldingOriginal(false)}
            onTouchStart={() => setHoldingOriginal(true)}
            onTouchEnd={() => setHoldingOriginal(false)}
            disabled={isCropping}
            title="Hold to view original"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Original</span>
          </button>

          <button
            type="button"
            onClick={() => setSplitCompare((v) => !v)}
            disabled={isCropping}
            aria-pressed={splitCompare}
            title="Toggle Before/After split wipe"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              splitCompare
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Compare</span>
          </button>

          <button
            type="button"
            onClick={handleResetAll}
            title="Reset all edits"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className="ml-1 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Main Editor Body: Left Rail (Desktop) + Canvas Stage + Inspector Panel */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Desktop Vertical Tool Rail */}
        <aside
          aria-label="Photo tools"
          className="hidden lg:flex flex-col w-20 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 gap-1"
        >
          {toolTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (isCropping && tab.id !== 'transform') setIsCropping(false);
                  setActiveTab(tab.id);
                }}
                className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Center Canvas Viewport */}
        <div
          ref={stageRef}
          className="flex-1 relative flex items-center justify-center p-4 sm:p-8 min-h-[260px] overflow-hidden bg-zinc-100 dark:bg-zinc-950 select-none"
        >
          <div className="relative inline-flex items-center justify-center max-w-full max-h-full shadow-lg rounded-sm overflow-hidden checkerboard-bg border border-zinc-200 dark:border-zinc-800">
            <canvas
              ref={previewCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              className={`block max-w-full max-h-[55vh] lg:max-h-[calc(100vh-170px)] w-auto h-auto ${
                activeTab === 'draw' && !isCropping
                  ? 'cursor-crosshair touch-none'
                  : liveState.textLayers.length > 0 && !isCropping
                    ? 'cursor-grab touch-none'
                    : ''
              }`}
            />

            {/* Before/After Original Canvas Overlay */}
            {(splitCompare || holdingOriginal) && !isCropping && (
              <canvas
                ref={originalCanvasRef}
                className="pointer-events-none absolute inset-0 w-full h-full"
                style={
                  holdingOriginal
                    ? undefined
                    : { clipPath: `inset(0 ${(1 - splitPosition) * 100}% 0 0)` }
                }
              />
            )}

            {/* Split Compare Interactive Handle */}
            {splitCompare && !holdingOriginal && !isCropping && (
              <div
                className="absolute inset-y-0 z-20 cursor-ew-resize touch-none"
                style={{ left: `${splitPosition * 100}%`, transform: 'translateX(-50%)' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const canvas = previewCanvasRef.current;
                  if (!canvas) return;
                  const onMove = (ev: PointerEvent) => {
                    const r = canvas.getBoundingClientRect();
                    setSplitPosition(Math.max(0.02, Math.min(0.98, (ev.clientX - r.left) / r.width)));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              >
                <div className="w-0.5 h-full bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)] mx-auto" />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-7 h-7 rounded-full bg-white text-zinc-900 shadow-md border border-zinc-300 flex items-center justify-center text-[10px] font-bold">
                  ⇄
                </div>
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium whitespace-nowrap">
                  Before
                </span>
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium whitespace-nowrap">
                  After
                </span>
              </div>
            )}

            {/* Hold-to-Compare Label */}
            {holdingOriginal && !isCropping && (
              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded bg-black/75 text-white text-xs font-medium pointer-events-none">
                Original
              </div>
            )}

            {/* Interactive Crop Box Overlay */}
            {isCropping && canvasDisplaySize.w > 0 && (
              <div className="absolute inset-0 z-20">
                {/* Dimmed outside regions */}
                <div
                  className="absolute bg-black/55 pointer-events-none"
                  style={{ top: 0, left: 0, right: 0, height: `${draftCrop.y * 100}%` }}
                />
                <div
                  className="absolute bg-black/55 pointer-events-none"
                  style={{
                    top: `${(draftCrop.y + draftCrop.height) * 100}%`,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                />
                <div
                  className="absolute bg-black/55 pointer-events-none"
                  style={{
                    top: `${draftCrop.y * 100}%`,
                    height: `${draftCrop.height * 100}%`,
                    left: 0,
                    width: `${draftCrop.x * 100}%`,
                  }}
                />
                <div
                  className="absolute bg-black/55 pointer-events-none"
                  style={{
                    top: `${draftCrop.y * 100}%`,
                    height: `${draftCrop.height * 100}%`,
                    left: `${(draftCrop.x + draftCrop.width) * 100}%`,
                    right: 0,
                  }}
                />

                {/* Crop frame */}
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                  className="absolute border-2 border-white cursor-move touch-none"
                  style={{
                    left: `${draftCrop.x * 100}%`,
                    top: `${draftCrop.y * 100}%`,
                    width: `${draftCrop.width * 100}%`,
                    height: `${draftCrop.height * 100}%`,
                  }}
                >
                  {/* Rule of thirds grid */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <div key={idx} className="border border-white/25" />
                    ))}
                  </div>

                  {/* Corner Handles */}
                  {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                    const posClass =
                      corner === 'nw'
                        ? '-top-2 -left-2 cursor-nwse-resize'
                        : corner === 'ne'
                          ? '-top-2 -right-2 cursor-nesw-resize'
                          : corner === 'sw'
                            ? '-bottom-2 -left-2 cursor-nesw-resize'
                            : '-bottom-2 -right-2 cursor-nwse-resize';
                    return (
                      <div
                        key={corner}
                        onPointerDown={(e) => handleCropPointerDown(e, corner)}
                        className={`absolute w-4 h-4 bg-white border-2 border-blue-600 rounded-xs shadow-sm touch-none ${posClass}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Tool Tabs Bar */}
        <div className="lg:hidden shrink-0 border-t border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center overflow-x-auto px-2 py-1.5 gap-1">
          {toolTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (isCropping && tab.id !== 'transform') setIsCropping(false);
                  setActiveTab(tab.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right / Bottom Inspector Panel */}
        <aside className="w-full lg:w-80 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto max-h-[38vh] lg:max-h-none p-4 space-y-5">
          {/* TRANSFORM TAB */}
          {activeTab === 'transform' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5">
                  Crop
                </h2>
                {!isCropping ? (
                  <button
                    type="button"
                    onClick={startCropping}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-sm font-medium text-zinc-800 dark:text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Crop className="w-4 h-4" />
                    <span>Crop Image</span>
                  </button>
                ) : (
                  <div className="space-y-3 p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30">
                    <div className="grid grid-cols-3 gap-1.5">
                      {ASPECT_PRESETS.map((ap) => (
                        <button
                          key={ap.label}
                          type="button"
                          onClick={() => handleApplyAspectPreset(ap.ratio)}
                          className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                            cropAspect === ap.ratio
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          {ap.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={applyCrop}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Apply Crop</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCropping(false)}
                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-medium cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5">
                  Rotate & Flip
                </h2>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => handleRotate90('ccw')}
                    title="Rotate 90° left"
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-medium cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>-90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotate90('cw')}
                    title="Rotate 90° right"
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-medium cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span>+90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFlip('h')}
                    title="Flip horizontal"
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      liveState.flipH
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    <FlipHorizontal2 className="w-4 h-4" />
                    <span>Flip H</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFlip('v')}
                    title="Flip vertical"
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      liveState.flipV
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    <FlipVertical2 className="w-4 h-4" />
                    <span>Flip V</span>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <button
                      type="button"
                      onDoubleClick={() => commitState({ ...liveState, fineRotate: 0 })}
                      className="font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Straighten
                    </button>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {liveState.fineRotate > 0 ? `+${liveState.fineRotate}` : liveState.fineRotate}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={0.5}
                    value={liveState.fineRotate}
                    onChange={(e) =>
                      setLiveState({ ...liveState, fineRotate: parseFloat(e.target.value) })
                    }
                    onPointerUp={commitLiveChanges}
                    onKeyUp={commitLiveChanges}
                    className="w-full studio-slider"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Resize (px)
                  </h2>
                  <button
                    type="button"
                    onClick={() => setLockAspect((v) => !v)}
                    className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    {lockAspect ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    <span>{lockAspect ? 'Locked' : 'Unlocked'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                      Width
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={8000}
                      value={resizeW}
                      onChange={(e) => handleResizeInput('w', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                      Height
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={8000}
                      value={resizeH}
                      onChange={(e) => handleResizeInput('h', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={applyResize}
                  className="w-full py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Apply Resize
                </button>
              </div>

              {/* Frame / Border Section */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Frame / Border
                  </h2>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {liveState.border.width}px
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={80}
                  step={2}
                  value={liveState.border.width}
                  onChange={(e) =>
                    setLiveState({
                      ...liveState,
                      border: { ...liveState.border, width: parseInt(e.target.value, 10) },
                    })
                  }
                  onPointerUp={commitLiveChanges}
                  onKeyUp={commitLiveChanges}
                  className="w-full studio-slider"
                />

                {liveState.border.width > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#ffffff', '#18181b', '#f5f0e6', '#334155', '#2563eb'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          commitState({
                            ...liveState,
                            border: { ...liveState.border, color: c },
                          })
                        }
                        className={`w-6 h-6 rounded-full border cursor-pointer ${
                          liveState.border.color === c
                            ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900 border-zinc-400'
                            : 'border-zinc-300 dark:border-zinc-600'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Border color ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={liveState.border.color}
                      onChange={(e) =>
                        commitState({
                          ...liveState,
                          border: { ...liveState.border, color: e.target.value },
                        })
                      }
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Custom border color"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ADJUSTMENTS TAB */}
          {activeTab === 'adjust' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Light & Color
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    commitState({ ...liveState, adjustments: { ...DEFAULT_ADJUSTMENTS } })
                  }
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Reset adjustments
                </button>
              </div>

              <div className="space-y-3.5">
                {ADJUSTMENT_CONTROLS.map((ctrl) => {
                  const val = liveState.adjustments[ctrl.key];
                  return (
                    <div key={ctrl.key}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <button
                          type="button"
                          title="Double-click to reset"
                          onDoubleClick={() =>
                            commitState({
                              ...liveState,
                              adjustments: { ...liveState.adjustments, [ctrl.key]: 0 },
                            })
                          }
                          className="font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                        >
                          {ctrl.label}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-zinc-500 dark:text-zinc-400 w-9 text-right">
                            {val > 0 && ctrl.min < 0 ? `+${val}` : val}
                          </span>
                          {val !== 0 && (
                            <button
                              type="button"
                              aria-label={`Reset ${ctrl.label}`}
                              onClick={() =>
                                commitState({
                                  ...liveState,
                                  adjustments: { ...liveState.adjustments, [ctrl.key]: 0 },
                                })
                              }
                              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={1}
                        value={val}
                        onChange={(e) =>
                          handleAdjustmentChange(ctrl.key, parseFloat(e.target.value))
                        }
                        onPointerUp={commitLiveChanges}
                        onKeyUp={commitLiveChanges}
                        className="w-full studio-slider"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FILTERS TAB */}
          {activeTab === 'filters' && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Classic Filters
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {PHOTO_PRESETS.map((preset) => {
                  const active = liveState.preset === preset.id;
                  const thumb = presetThumbs[preset.id];
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        commitState({ ...liveState, preset: preset.id as PhotoPresetId })
                      }
                      className={`group rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-blue-600 ring-2 ring-blue-500/30'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="aspect-4/3 bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        {thumb && (
                          <img
                            src={thumb}
                            alt={preset.label}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 flex items-center justify-between">
                        <span
                          className={`text-xs font-medium ${
                            active
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-zinc-700 dark:text-zinc-200'
                          }`}
                        >
                          {preset.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TEXT TAB */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Text Layers
                </h2>
                <button
                  type="button"
                  onClick={handleAddText}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Text</span>
                </button>
              </div>

              {liveState.textLayers.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 py-4 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  Add a text layer, then drag it directly on the canvas to position it.
                </p>
              ) : (
                <div className="space-y-2">
                  {liveState.textLayers.map((layer) => (
                    <div
                      key={layer.id}
                      onClick={() => setSelectedTextId(layer.id)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                        selectedTextId === layer.id
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 text-zinc-900 dark:text-zinc-100'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      <span className="truncate font-medium">{layer.text || '(Empty)'}</span>
                      <button
                        type="button"
                        aria-label="Delete text layer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedTextId === layer.id) setSelectedTextId(null);
                          commitState({
                            ...liveState,
                            textLayers: liveState.textLayers.filter((t) => t.id !== layer.id),
                          });
                        }}
                        className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedText && (
                <div className="space-y-3.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Content
                    </label>
                    <textarea
                      rows={2}
                      value={selectedText.text}
                      onChange={(e) => updateSelectedText({ text: e.target.value })}
                      onBlur={commitLiveChanges}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Font
                    </label>
                    <select
                      value={selectedText.fontFamily}
                      onChange={(e) => updateSelectedText({ fontFamily: e.target.value }, true)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Size</span>
                      <span className="font-mono text-zinc-500">{selectedText.fontSize}</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={180}
                      value={selectedText.fontSize}
                      onChange={(e) =>
                        updateSelectedText({ fontSize: parseInt(e.target.value, 10) })
                      }
                      onPointerUp={commitLiveChanges}
                      className="w-full studio-slider"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateSelectedText({ bold: !selectedText.bold }, true)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                        selectedText.bold
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedText({ italic: !selectedText.italic }, true)}
                      className={`px-3 py-1.5 rounded-lg border text-xs italic cursor-pointer ${
                        selectedText.italic
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      I
                    </button>

                    <select
                      aria-label="Text backdrop"
                      value={selectedText.bgColor}
                      onChange={(e) => updateSelectedText({ bgColor: e.target.value }, true)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200"
                    >
                      <option value="transparent">No backdrop</option>
                      <option value="rgba(0,0,0,0.55)">Dark backdrop</option>
                      <option value="rgba(255,255,255,0.8)">Light backdrop</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Color
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateSelectedText({ color: c }, true)}
                          className={`w-6 h-6 rounded-full border cursor-pointer ${
                            selectedText.color === c
                              ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900 border-zinc-400'
                              : 'border-zinc-300 dark:border-zinc-600'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={selectedText.color}
                        onChange={(e) => updateSelectedText({ color: e.target.value }, true)}
                        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                        aria-label="Custom text color"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DRAW TAB */}
          {activeTab === 'draw' && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Brush & Draw
              </h2>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsEraser(false)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                    !isEraser
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Brush</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEraser(true)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                    isEraser
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Eraser</span>
                </button>
              </div>

              {!isEraser && (
                <div>
                  <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Brush Color
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBrushColor(c)}
                        className={`w-6 h-6 rounded-full border cursor-pointer ${
                          brushColor === c
                            ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900 border-zinc-400'
                            : 'border-zinc-300 dark:border-zinc-600'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Brush color ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Custom brush color"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Brush Size</span>
                  <span className="font-mono text-zinc-500">{brushSize} px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={80}
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                  className="w-full studio-slider"
                />
              </div>

              {!isEraser && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Opacity</span>
                    <span className="font-mono text-zinc-500">
                      {Math.round(brushOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={brushOpacity}
                    onChange={(e) => setBrushOpacity(parseFloat(e.target.value))}
                    className="w-full studio-slider"
                  />
                </div>
              )}

              {liveState.strokes.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() =>
                      commitState({ ...liveState, strokes: liveState.strokes.slice(0, -1) })
                    }
                    className="flex-1 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    Undo Stroke
                  </button>
                  <button
                    type="button"
                    onClick={() => commitState({ ...liveState, strokes: [] })}
                    className="flex-1 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EXPORT TAB */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Export Photo
              </h2>

              <div>
                <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Format
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['jpeg', 'png', 'webp'] as PhotoExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      className={`py-2 rounded-lg border text-xs font-mono uppercase font-medium cursor-pointer ${
                        exportFormat === fmt
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {fmt === 'jpeg' ? 'JPG' : fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Download as (Size)
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'original', label: 'Original' },
                      { id: '1080', label: '1080px' },
                      { id: '720', label: '720px' },
                    ] as { id: PhotoExportSizePreset; label: string }[]
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setExportSizePreset(sz.id)}
                      className={`py-2 rounded-lg border text-xs font-mono font-medium cursor-pointer ${
                        exportSizePreset === sz.id
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportFormat !== 'png' ? (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Quality</span>
                    <span className="font-mono text-zinc-500">
                      {Math.round(exportQuality * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={exportQuality}
                    onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                    className="w-full studio-slider"
                  />
                </div>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  PNG is lossless and preserves transparency.
                </p>
              )}

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Dimensions</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    {(() => {
                      const d = getExportDimensions(
                        liveState.targetWidth,
                        liveState.targetHeight,
                        exportSizePreset
                      );
                      return `${d.width} × ${d.height} px`;
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Estimated Size</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    {estimatedSize !== null ? formatBytes(estimatedSize) : 'Calculating…'}
                  </span>
                </div>
              </div>

              {exportError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{exportError}</span>
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Rendering…</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download {exportFormat === 'jpeg' ? 'JPG' : exportFormat.toUpperCase()}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isCopying}
                  onClick={handleCopyToClipboard}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-60 text-zinc-800 dark:text-zinc-100 text-xs font-medium transition-colors cursor-pointer"
                >
                  {isCopying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Copying…</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy to clipboard</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
