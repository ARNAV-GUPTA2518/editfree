import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Sliders,
  Type,
  Download,
  Undo2,
  Redo2,
  Film,
  Gauge,
  AlertTriangle,
  AlertCircle,
  Loader2,
  X,
  Camera,
} from 'lucide-react';
import type {
  VideoAdjustments,
  VideoEditState,
  VideoExportFormat,
  VideoExportQuality,
  VideoFilterPresetId,
  VideoSegment,
  VideoToolTab,
} from '../../types/editor';
import {
  cancelVideoExport,
  exportVideoWithFFmpeg,
  extractVideoFramePng,
} from '../../utils/videoExport';
import { DropZone } from '../DropZone';
import { useToast } from '../Toast';

const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const LARGE_FILE_BYTES = 40 * 1024 * 1024; // 40 MB

const VIDEO_PRESETS: { id: VideoFilterPresetId; label: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'bw', label: 'B&W' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'high-contrast', label: 'Punch' },
];

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

const FONT_OPTIONS = [
  { label: 'DM Sans', value: "'DM Sans', sans-serif" },
  { label: 'Plus Jakarta', value: "'Plus Jakarta Sans', sans-serif" },
  { label: 'Serif (Georgia)', value: 'Georgia, serif' },
  { label: 'Monospace', value: "'JetBrains Mono', monospace" },
];

const COLOR_SWATCHES = ['#ffffff', '#18181b', '#ef4444', '#f59e0b', '#10b981', '#3b82f6'];

const DEFAULT_VIDEO_ADJUSTMENTS: VideoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

function createInitialVideoState(duration: number): VideoEditState {
  return {
    segments: [{ id: 'seg_initial', start: 0, end: Math.max(0.1, duration) }],
    speed: 1,
    volume: 1,
    muted: false,
    rotate90: 0,
    preset: 'none',
    adjustments: { ...DEFAULT_VIDEO_ADJUSTMENTS },
    textOverlay: {
      enabled: false,
      text: 'Title Overlay',
      x: 0.5,
      y: 0.82,
      fontSize: 54,
      color: '#ffffff',
      bgColor: 'rgba(0,0,0,0.55)',
      fontFamily: "'DM Sans', sans-serif",
      bold: true,
    },
  };
}

function cloneVideoState(s: VideoEditState): VideoEditState {
  return {
    ...s,
    segments: s.segments.map((seg) => ({ ...seg })),
    adjustments: { ...s.adjustments },
    textOverlay: { ...s.textOverlay },
  };
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function computeCssFilter(state: VideoEditState): string {
  const parts: string[] = [];
  if (state.preset === 'bw') parts.push('grayscale(1) contrast(1.1)');
  else if (state.preset === 'sepia') parts.push('sepia(1)');
  else if (state.preset === 'warm') parts.push('sepia(0.22) saturate(1.12)');
  else if (state.preset === 'cool') parts.push('hue-rotate(12deg) saturate(0.92) brightness(1.02)');
  else if (state.preset === 'high-contrast') parts.push('contrast(1.35) saturate(1.15)');

  if (state.adjustments.brightness !== 0) {
    parts.push(`brightness(${(1 + state.adjustments.brightness / 100).toFixed(2)})`);
  }
  if (state.adjustments.contrast !== 0) {
    parts.push(`contrast(${Math.max(0.2, 1 + state.adjustments.contrast / 50).toFixed(2)})`);
  }
  if (state.adjustments.saturation !== 0) {
    parts.push(`saturate(${Math.max(0, 1 + state.adjustments.saturation / 100).toFixed(2)})`);
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}

interface VideoEditorProps {
  isActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ isActive = true, onDirtyChange }) => {
  const { showToast } = useToast();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceDuration, setSourceDuration] = useState<number>(0);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [history, setHistory] = useState<{
    past: VideoEditState[];
    present: VideoEditState | null;
    future: VideoEditState[];
  }>({ past: [], present: null, future: [] });
  const [liveState, setLiveState] = useState<VideoEditState | null>(null);

  const [activeTab, setActiveTab] = useState<VideoToolTab>('trim');
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Export state
  const [exportFormat, setExportFormat] = useState<VideoExportFormat>('mp4');
  const [exportQuality, setExportQuality] = useState<VideoExportQuality>('medium');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [hasExportedSinceEdit, setHasExportedSinceEdit] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const overlayStageRef = useRef<HTMLDivElement>(null);

  // Revoke object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const commitState = useCallback((next: VideoEditState) => {
    const cloned = cloneVideoState(next);
    setLiveState(cloned);
    setHasExportedSinceEdit(false);
    setHistory((prev) => {
      if (!prev.present) return { past: [], present: cloned, future: [] };
      return {
        past: [...prev.past.slice(-39), prev.present],
        present: cloned,
        future: [],
      };
    });
  }, []);

  useEffect(() => {
    onDirtyChange?.(Boolean(videoFile) && history.past.length > 0 && !hasExportedSinceEdit);
  }, [videoFile, history.past.length, hasExportedSinceEdit, onDirtyChange]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0 || !prev.present) return prev;
      const previous = prev.past[prev.past.length - 1];
      setLiveState(cloneVideoState(previous));
      if (!previous.segments.some((s) => s.id === selectedSegId)) {
        setSelectedSegId(previous.segments[0]?.id ?? null);
      }
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, [selectedSegId]);

  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0 || !prev.present) return prev;
      const next = prev.future[0];
      setLiveState(cloneVideoState(next));
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  const handleFileSelected = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const validExt = ['mp4', 'webm', 'mov'].includes(ext);
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type) && !validExt) {
        setLoadError(
          `Unsupported file "${file.name}". Please upload an MP4 or WebM video.`
        );
        return;
      }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(file);
      setLoadError(null);
      setExportError(null);
      setVideoFile(file);
      setVideoUrl(url);
      setIsPlaying(false);
      setPlayhead(0);
      setLiveState(null);
      setHistory({ past: [], present: null, future: [] });
    },
    [videoUrl]
  );

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const dur = vid.duration;
    if (!isFinite(dur) || dur <= 0) {
      setLoadError('Unable to read video duration. Please try another MP4 or WebM file.');
      return;
    }
    setSourceDuration(dur);
    setVideoDims({
      w: vid.videoWidth || 1280,
      h: vid.videoHeight || 720,
    });
    const init = createInitialVideoState(dur);
    setHistory({ past: [], present: init, future: [] });
    setLiveState(cloneVideoState(init));
    setSelectedSegId(init.segments[0].id);
    setPlayhead(0);
  };

  // Sync speed & volume to <video> element
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !liveState) return;
    vid.playbackRate = liveState.speed;
    vid.muted = liveState.muted;
    vid.volume = Math.min(1, Math.max(0, liveState.volume));
  }, [liveState?.speed, liveState?.muted, liveState?.volume]);

  // Sorted segments & edited total duration
  const sortedSegments = useMemo(() => {
    if (!liveState) return [];
    return [...liveState.segments].sort((a, b) => a.start - b.start);
  }, [liveState]);

  const editedDuration = useMemo(() => {
    if (!liveState) return 0;
    const raw = sortedSegments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
    return raw / liveState.speed;
  }, [sortedSegments, liveState?.speed]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !liveState || sortedSegments.length === 0) return;

    if (isPlaying) {
      vid.pause();
      setIsPlaying(false);
      return;
    }

    // Ensure playhead starts inside an active segment
    const cur = vid.currentTime;
    const inside = sortedSegments.find((s) => cur >= s.start - 0.05 && cur < s.end - 0.05);
    if (!inside) {
      const nextSeg = sortedSegments.find((s) => s.start >= cur) ?? sortedSegments[0];
      vid.currentTime = nextSeg.start;
      setPlayhead(nextSeg.start);
    }

    vid.play().catch(() => setIsPlaying(false));
    setIsPlaying(true);
  }, [isPlaying, liveState, sortedSegments]);

  // Seamless playback loop across multiple trimmed segments
  useEffect(() => {
    if (!isPlaying || !videoRef.current || sortedSegments.length === 0) return;
    let raf = 0;

    const tick = () => {
      const vid = videoRef.current;
      if (!vid) return;
      const t = vid.currentTime;
      setPlayhead(t);

      // Find which segment we are currently inside
      const currentIdx = sortedSegments.findIndex(
        (s) => t >= s.start - 0.05 && t <= s.end + 0.02
      );

      if (currentIdx === -1) {
        // Jump to next available segment or loop to start
        const nextSeg = sortedSegments.find((s) => s.start > t);
        if (nextSeg) {
          vid.currentTime = nextSeg.start;
          setPlayhead(nextSeg.start);
        } else {
          vid.pause();
          vid.currentTime = sortedSegments[0].start;
          setPlayhead(sortedSegments[0].start);
          setIsPlaying(false);
          return;
        }
      } else {
        const seg = sortedSegments[currentIdx];
        if (t >= seg.end - 0.03) {
          const nextSeg = sortedSegments[currentIdx + 1];
          if (nextSeg) {
            vid.currentTime = nextSeg.start;
            setPlayhead(nextSeg.start);
          } else {
            vid.pause();
            vid.currentTime = sortedSegments[0].start;
            setPlayhead(sortedSegments[0].start);
            setIsPlaying(false);
            return;
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, sortedSegments]);

  const seekTo = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(sourceDuration, time));
    setPlayhead(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  }, [sourceDuration]);

  // Split segment containing playhead
  const handleSplitAtPlayhead = useCallback(() => {
    if (!liveState) return;
    const minSegLen = 0.2;
    const target = sortedSegments.find(
      (s) => playhead > s.start + minSegLen && playhead < s.end - minSegLen
    );
    if (!target) return;

    const segA: VideoSegment = {
      id: target.id,
      start: target.start,
      end: playhead,
    };
    const segB: VideoSegment = {
      id: `seg_${Date.now()}`,
      start: playhead,
      end: target.end,
    };
    const nextSegments = liveState.segments.flatMap((s) =>
      s.id === target.id ? [segA, segB] : [s]
    );
    setSelectedSegId(segB.id);
    commitState({ ...liveState, segments: nextSegments });
  }, [liveState, sortedSegments, playhead, commitState]);

  const handleDeleteSelectedSegment = useCallback(() => {
    if (!liveState || !selectedSegId || liveState.segments.length <= 1) return;
    const remaining = liveState.segments.filter((s) => s.id !== selectedSegId);
    const nextSelected = remaining[0]?.id ?? null;
    setSelectedSegId(nextSelected);
    if (remaining[0]) {
      seekTo(remaining[0].start);
    }
    commitState({ ...liveState, segments: remaining });
  }, [liveState, selectedSegId, seekTo, commitState]);

  // Keyboard shortcuts for VideoEditor
  useEffect(() => {
    if (!isActive || !videoFile || !liveState) return;
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
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (isEditingInput) return;
        e.preventDefault();
        handleRedo();
        return;
      }
      if (isEditingInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelectedSegment();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isActive,
    videoFile,
    liveState,
    togglePlay,
    handleSplitAtPlayhead,
    handleDeleteSelectedSegment,
    handleUndo,
    handleRedo,
  ]);

  // Timeline scrubbing & segment trim dragging
  const handleTimelineScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current || sourceDuration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const updatePos = (clientX: number) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seekTo(ratio * sourceDuration);
    };
    updatePos(e.clientX);

    const onMove = (ev: PointerEvent) => updatePos(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleTrimHandleDown = (
    e: React.PointerEvent,
    segId: string,
    edge: 'start' | 'end'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!timelineRef.current || !liveState || sourceDuration <= 0) return;
    setSelectedSegId(segId);

    const rect = timelineRef.current.getBoundingClientRect();
    const sorted = [...liveState.segments].sort((a, b) => a.start - b.start);
    const idx = sorted.findIndex((s) => s.id === segId);
    if (idx === -1) return;

    const prevEnd = idx > 0 ? sorted[idx - 1].end : 0;
    const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].start : sourceDuration;
    const minLen = 0.2;
    let latestState = liveState;

    const onMove = (ev: PointerEvent) => {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const t = ratio * sourceDuration;

      setLiveState((prev) => {
        if (!prev) return prev;
        const targetSeg = prev.segments.find((s) => s.id === segId);
        if (!targetSeg) return prev;

        let newStart = targetSeg.start;
        let newEnd = targetSeg.end;
        if (edge === 'start') {
          newStart = Math.max(prevEnd, Math.min(targetSeg.end - minLen, t));
          seekTo(newStart);
        } else {
          newEnd = Math.min(nextStart, Math.max(targetSeg.start + minLen, t));
          seekTo(newEnd);
        }

        latestState = {
          ...prev,
          segments: prev.segments.map((s) =>
            s.id === segId ? { ...s, start: newStart, end: newEnd } : s
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
  };

  const selectedSegment = useMemo(
    () => liveState?.segments.find((s) => s.id === selectedSegId) ?? null,
    [liveState, selectedSegId]
  );

  const handleSetInOut = (edge: 'start' | 'end') => {
    if (!liveState || !selectedSegment) return;
    const minLen = 0.2;
    const sorted = [...liveState.segments].sort((a, b) => a.start - b.start);
    const idx = sorted.findIndex((s) => s.id === selectedSegment.id);
    const prevEnd = idx > 0 ? sorted[idx - 1].end : 0;
    const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].start : sourceDuration;

    let newStart = selectedSegment.start;
    let newEnd = selectedSegment.end;
    if (edge === 'start') {
      newStart = Math.max(prevEnd, Math.min(selectedSegment.end - minLen, playhead));
    } else {
      newEnd = Math.min(nextStart, Math.max(selectedSegment.start + minLen, playhead));
    }

    commitState({
      ...liveState,
      segments: liveState.segments.map((s) =>
        s.id === selectedSegment.id ? { ...s, start: newStart, end: newEnd } : s
      ),
    });
  };

  const handleRotate90 = (dir: 'cw' | 'ccw') => {
    if (!liveState) return;
    const delta = dir === 'cw' ? 90 : -90;
    const nextRot = ((liveState.rotate90 + delta) % 360 + 360) % 360;
    commitState({ ...liveState, rotate90: nextRot });
  };

  // Drag text overlay directly on player preview
  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!liveState || !overlayStageRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = overlayStageRef.current.getBoundingClientRect();
    let latestState = liveState;

    const updatePos = (clientX: number, clientY: number) => {
      const nx = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width));
      const ny = Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height));
      setLiveState((prev) => {
        if (!prev) return prev;
        latestState = {
          ...prev,
          textOverlay: { ...prev.textOverlay, x: nx, y: ny },
        };
        return latestState;
      });
    };

    const onMove = (ev: PointerEvent) => updatePos(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      commitState(latestState);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleExtractFrame = async () => {
    if (!videoRef.current || !liveState || !videoFile) return;
    try {
      const cssFilter = computeCssFilter(liveState);
      const blob = await extractVideoFramePng(videoRef.current, liveState, cssFilter);
      const url = URL.createObjectURL(blob);
      const baseName = videoFile.name.replace(/\.[^.]+$/, '') || 'video';
      const stamp = playhead.toFixed(1).replace('.', '-');
      const fileNameOut = `${baseName}-frame-${stamp}s.png`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameOut;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Saved frame as ${fileNameOut}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract video frame.';
      showToast(msg, 'error');
    }
  };

  const handleExportVideo = async () => {
    if (!videoFile || !liveState) return;
    if (isPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    setIsExporting(true);
    setExportProgress(1);
    setExportStage('Preparing…');
    setExportError(null);

    try {
      const blob = await exportVideoWithFFmpeg({
        file: videoFile,
        videoWidth: videoDims.w,
        videoHeight: videoDims.h,
        state: liveState,
        format: exportFormat,
        quality: exportQuality,
        onProgress: (pct, stage) => {
          setExportProgress(pct);
          setExportStage(stage);
        },
      });

      const url = URL.createObjectURL(blob);
      const baseName = videoFile.name.replace(/\.[^.]+$/, '') || 'video';
      const outputName = `${baseName}-edited.${exportFormat}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = outputName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHasExportedSinceEdit(true);
      showToast(`Exported ${outputName}`, 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Video export failed. Try a shorter clip or MP4 format.';
      setExportError(msg);
      showToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelExport = () => {
    cancelVideoExport();
    setIsExporting(false);
    setExportProgress(0);
    setExportStage('');
    showToast('Video export cancelled', 'info');
  };

  // Empty state
  if (!videoFile || !videoUrl) {
    return (
      <DropZone
        title="Open a video to start editing"
        subtitle="Trim, split, adjust speed, rotate, add filters or text overlays, and export with ffmpeg.wasm right in your browser."
        accept="video/mp4,video/webm,.mp4,.webm,.mov"
        supportedLabel="Supports MP4 · WebM (single-thread CPU processing)"
        onFileSelected={handleFileSelected}
        errorMessage={loadError}
        icon={<Film className="w-6 h-6" aria-hidden="true" />}
      />
    );
  }

  const isLargeFile = videoFile.size > LARGE_FILE_BYTES || sourceDuration > 90;
  const fileSizeMB = (videoFile.size / (1024 * 1024)).toFixed(1);
  const canSplit =
    liveState !== null &&
    sortedSegments.some((s) => playhead > s.start + 0.2 && playhead < s.end - 0.2);

  const toolTabs: { id: VideoToolTab; label: string; icon: React.ReactNode }[] = [
    { id: 'trim', label: 'Trim', icon: <Scissors className="w-4 h-4" /> },
    { id: 'speed-audio', label: 'Speed', icon: <Gauge className="w-4 h-4" /> },
    { id: 'filters', label: 'Filters', icon: <Sliders className="w-4 h-4" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
  ];

  // Aspect ratio of rotated player stage
  const rot = liveState ? ((liveState.rotate90 % 360) + 360) % 360 : 0;
  const isRotatedOdd = rot === 90 || rot === 270;
  const displayAspectW = isRotatedOdd ? videoDims.h : videoDims.w;
  const displayAspectH = isRotatedOdd ? videoDims.w : videoDims.h;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Top Action Bar */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 sm:px-5 py-2 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-3 min-w-0">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer">
            <Film className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Open</span>
            <input
              type="file"
              accept="video/mp4,video/webm,.mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </label>

          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 truncate">
            <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-44">
              {videoFile.name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {videoDims.w}×{videoDims.h}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{fileSizeMB} MB</span>
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
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const init = createInitialVideoState(sourceDuration);
              setSelectedSegId(init.segments[0].id);
              seekTo(0);
              commitState(init);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className="ml-1 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Large File Notice */}
      {isLargeFile && (
        <div className="shrink-0 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Large file ({fileSizeMB} MB · {formatTime(sourceDuration)}). Because video encoding runs
            locally in single-threaded WebAssembly on your CPU, exporting may be slow.
          </span>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Desktop Tool Rail */}
        <aside
          aria-label="Video tools"
          className="hidden lg:flex flex-col w-20 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 gap-1"
        >
          {toolTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* Center Stage: Player + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Video Player Viewport */}
          <div className="flex-1 flex items-center justify-center p-4 bg-zinc-950/5 dark:bg-black/60 min-h-[200px] overflow-hidden">
            <div
              ref={overlayStageRef}
              className="relative flex items-center justify-center bg-black rounded-lg overflow-hidden shadow-lg max-w-full max-h-full"
              style={{
                aspectRatio: `${displayAspectW} / ${displayAspectH}`,
                height: 'min(48vh, 100%)',
                maxWidth: '100%',
              }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onError={() =>
                  setLoadError('Could not play this video in your browser. Try an MP4 (H.264) or WebM file.')
                }
                onClick={togglePlay}
                className="cursor-pointer transition-transform duration-150"
                style={{
                  filter: liveState ? computeCssFilter(liveState) : 'none',
                  transform: `rotate(${rot}deg)`,
                  width: isRotatedOdd ? `${(displayAspectH / displayAspectW) * 100}%` : '100%',
                  height: isRotatedOdd ? `${(displayAspectW / displayAspectH) * 100}%` : '100%',
                  objectFit: 'contain',
                }}
              />

              {/* Live Draggable Text Overlay */}
              {liveState?.textOverlay.enabled && liveState.textOverlay.text.trim() && (
                <div
                  onPointerDown={handleOverlayPointerDown}
                  title="Drag to reposition text"
                  className="absolute z-10 cursor-move select-none touch-none px-2.5 py-1 rounded text-center whitespace-pre-wrap max-w-[90%]"
                  style={{
                    left: `${liveState.textOverlay.x * 100}%`,
                    top: `${liveState.textOverlay.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    color: liveState.textOverlay.color,
                    backgroundColor: liveState.textOverlay.bgColor,
                    fontFamily: liveState.textOverlay.fontFamily,
                    fontWeight: liveState.textOverlay.bold ? 700 : 400,
                    fontSize: `clamp(12px, ${(liveState.textOverlay.fontSize / 1080) * 44}vh, 42px)`,
                    lineHeight: 1.25,
                  }}
                >
                  {liveState.textOverlay.text}
                </div>
              )}
            </div>
          </div>

          {/* Timeline & Transport Controls */}
          {liveState && (
            <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 sm:px-5 space-y-3 select-none">
              {/* Transport & Editing Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    title="Play / Pause (Space)"
                    className="w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  <div className="text-xs font-mono text-zinc-700 dark:text-zinc-200 px-2">
                    <span>{formatTime(playhead)}</span>
                    <span className="text-zinc-400 dark:text-zinc-500 mx-1">/</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {formatTime(sourceDuration)}
                    </span>
                    <span className="hidden sm:inline text-zinc-400 dark:text-zinc-500 ml-2">
                      (Output: {formatTime(editedDuration)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSplitAtPlayhead}
                    disabled={!canSplit}
                    title="Split segment at playhead (S)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Split</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetInOut('start')}
                    disabled={!selectedSegment}
                    className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                  >
                    Set In
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetInOut('end')}
                    disabled={!selectedSegment}
                    className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                  >
                    Set Out
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteSelectedSegment}
                    disabled={liveState.segments.length <= 1 || !selectedSegId}
                    title="Delete selected segment (Del)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExtractFrame}
                    title="Extract current frame as PNG image"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Extract Frame</span>
                  </button>
                </div>
              </div>

              {/* Multi-Segment Visual Track */}
              <div
                ref={timelineRef}
                onPointerDown={handleTimelineScrub}
                className="relative h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 overflow-hidden cursor-pointer touch-none"
              >
                {sourceDuration > 0 &&
                  sortedSegments.map((seg, idx) => {
                    const leftPct = (seg.start / sourceDuration) * 100;
                    const widthPct = ((seg.end - seg.start) / sourceDuration) * 100;
                    const isSelected = seg.id === selectedSegId;

                    return (
                      <div
                        key={seg.id}
                        onPointerDown={(e) => {
                          setSelectedSegId(seg.id);
                          handleTimelineScrub(e);
                        }}
                        className={`absolute top-1.5 bottom-1.5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-blue-600/20 dark:bg-blue-500/25 border-blue-600 dark:border-blue-400 z-10'
                            : 'bg-zinc-300/70 dark:bg-zinc-700/80 border-zinc-400 dark:border-zinc-600'
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${Math.max(1, widthPct)}%`,
                        }}
                      >
                        {/* Left Trim Handle */}
                        <div
                          onPointerDown={(e) => handleTrimHandleDown(e, seg.id, 'start')}
                          title="Drag to trim start"
                          className="absolute left-0 top-0 bottom-0 w-2.5 bg-blue-600 hover:bg-blue-500 rounded-l-sm cursor-ew-resize flex items-center justify-center touch-none"
                        >
                          <div className="w-0.5 h-4 bg-white/80 rounded-full" />
                        </div>

                        <span className="text-[11px] font-mono font-medium text-zinc-800 dark:text-zinc-100 px-3 truncate pointer-events-none">
                          #{idx + 1} · {(seg.end - seg.start).toFixed(1)}s
                        </span>

                        {/* Right Trim Handle */}
                        <div
                          onPointerDown={(e) => handleTrimHandleDown(e, seg.id, 'end')}
                          title="Drag to trim end"
                          className="absolute right-0 top-0 bottom-0 w-2.5 bg-blue-600 hover:bg-blue-500 rounded-r-sm cursor-ew-resize flex items-center justify-center touch-none"
                        >
                          <div className="w-0.5 h-4 bg-white/80 rounded-full" />
                        </div>
                      </div>
                    );
                  })}

                {/* Playhead Needle */}
                {sourceDuration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                    style={{ left: `${(playhead / sourceDuration) * 100}%` }}
                  >
                    <div className="w-3 h-3 bg-red-500 rounded-full -translate-x-[5px] -translate-y-0.5 shadow-sm" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Tool Tabs Bar */}
        <div className="lg:hidden shrink-0 border-t border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center overflow-x-auto px-2 py-1.5 gap-1">
          {toolTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Inspector Panel */}
        {liveState && (
          <aside className="w-full lg:w-80 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto max-h-[36vh] lg:max-h-none p-4 space-y-5">
            {/* TRIM TAB */}
            {activeTab === 'trim' && (
              <div className="space-y-4">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Timeline Segments
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Drag blue segment handles on the timeline to trim, or move the playhead and press{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">S</kbd>{' '}
                  to split.
                </p>

                <div className="space-y-2">
                  {sortedSegments.map((seg, idx) => (
                    <div
                      key={seg.id}
                      onClick={() => {
                        setSelectedSegId(seg.id);
                        seekTo(seg.start);
                      }}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        seg.id === selectedSegId
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                          Segment {idx + 1}
                        </span>
                        <span className="font-mono text-zinc-500 dark:text-zinc-400">
                          {(seg.end - seg.start).toFixed(2)}s
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatTime(seg.start)} → {formatTime(seg.end)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SPEED, AUDIO & ROTATE TAB */}
            {activeTab === 'speed-audio' && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <h2 className="font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Playback Speed
                    </h2>
                    <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-100">
                      {liveState.speed}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={4}
                    step={0.25}
                    value={liveState.speed}
                    onChange={(e) =>
                      setLiveState({ ...liveState, speed: parseFloat(e.target.value) })
                    }
                    onPointerUp={() => commitState(liveState)}
                    className="w-full studio-slider mb-2.5"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {SPEED_PRESETS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => commitState({ ...liveState, speed: sp })}
                        className={`py-1.5 rounded-lg border text-xs font-mono cursor-pointer ${
                          liveState.speed === sp
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {sp}×
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Audio
                    </h2>
                    <button
                      type="button"
                      onClick={() => commitState({ ...liveState, muted: !liveState.muted })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
                        liveState.muted
                          ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      {liveState.muted ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" />
                          <span>Muted</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Audio On</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-zinc-700 dark:text-zinc-300">Volume</span>
                      <span className="font-mono text-zinc-500">
                        {liveState.muted ? '0%' : `${Math.round(liveState.volume * 100)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      disabled={liveState.muted}
                      value={liveState.volume}
                      onChange={(e) =>
                        setLiveState({ ...liveState, volume: parseFloat(e.target.value) })
                      }
                      onPointerUp={() => commitState(liveState)}
                      className="w-full studio-slider disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Rotate
                    </h2>
                    <span className="font-mono text-xs text-zinc-500">{rot}°</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleRotate90('ccw')}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Rotate -90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotate90('cw')}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <RotateCw className="w-4 h-4" />
                      <span>Rotate +90°</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* FILTERS TAB */}
            {activeTab === 'filters' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5">
                    Preset Filters
                  </h2>
                  <div className="grid grid-cols-2 gap-1.5">
                    {VIDEO_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => commitState({ ...liveState, preset: p.id })}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                          liveState.preset === p.id
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3.5">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Color Adjustments
                  </h2>

                  {(
                    [
                      { key: 'brightness', label: 'Brightness', min: -50, max: 50 },
                      { key: 'contrast', label: 'Contrast', min: -50, max: 50 },
                      { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
                    ] as const
                  ).map((item) => {
                    const val = liveState.adjustments[item.key];
                    return (
                      <div key={item.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {item.label}
                          </span>
                          <span className="font-mono text-zinc-500">
                            {val > 0 ? `+${val}` : val}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={item.min}
                          max={item.max}
                          step={1}
                          value={val}
                          onChange={(e) =>
                            setLiveState({
                              ...liveState,
                              adjustments: {
                                ...liveState.adjustments,
                                [item.key]: parseInt(e.target.value, 10),
                              },
                            })
                          }
                          onPointerUp={() => commitState(liveState)}
                          className="w-full studio-slider"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TEXT OVERLAY TAB */}
            {activeTab === 'text' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Text Overlay
                  </h2>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={liveState.textOverlay.enabled}
                      onChange={(e) =>
                        commitState({
                          ...liveState,
                          textOverlay: { ...liveState.textOverlay, enabled: e.target.checked },
                        })
                      }
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Show Text</span>
                  </label>
                </div>

                {liveState.textOverlay.enabled && (
                  <div className="space-y-3.5">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Drag the text directly on the video preview to reposition it.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Content
                      </label>
                      <textarea
                        rows={2}
                        value={liveState.textOverlay.text}
                        onChange={(e) =>
                          setLiveState({
                            ...liveState,
                            textOverlay: { ...liveState.textOverlay, text: e.target.value },
                          })
                        }
                        onBlur={() => commitState(liveState)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Font
                      </label>
                      <select
                        value={liveState.textOverlay.fontFamily}
                        onChange={(e) =>
                          commitState({
                            ...liveState,
                            textOverlay: { ...liveState.textOverlay, fontFamily: e.target.value },
                          })
                        }
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
                        <span className="font-mono text-zinc-500">
                          {liveState.textOverlay.fontSize}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={120}
                        value={liveState.textOverlay.fontSize}
                        onChange={(e) =>
                          setLiveState({
                            ...liveState,
                            textOverlay: {
                              ...liveState.textOverlay,
                              fontSize: parseInt(e.target.value, 10),
                            },
                          })
                        }
                        onPointerUp={() => commitState(liveState)}
                        className="w-full studio-slider"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          commitState({
                            ...liveState,
                            textOverlay: {
                              ...liveState.textOverlay,
                              bold: !liveState.textOverlay.bold,
                            },
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                          liveState.textOverlay.bold
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        B
                      </button>

                      <select
                        aria-label="Text backdrop"
                        value={liveState.textOverlay.bgColor}
                        onChange={(e) =>
                          commitState({
                            ...liveState,
                            textOverlay: { ...liveState.textOverlay, bgColor: e.target.value },
                          })
                        }
                        className="flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200"
                      >
                        <option value="transparent">No backdrop</option>
                        <option value="rgba(0,0,0,0.55)">Dark backdrop</option>
                        <option value="rgba(255,255,255,0.8)">Light backdrop</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            commitState({
                              ...liveState,
                              textOverlay: { ...liveState.textOverlay, color: c },
                            })
                          }
                          className={`w-6 h-6 rounded-full border cursor-pointer ${
                            liveState.textOverlay.color === c
                              ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-zinc-900 border-zinc-400'
                              : 'border-zinc-300 dark:border-zinc-600'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={liveState.textOverlay.color}
                        onChange={(e) =>
                          commitState({
                            ...liveState,
                            textOverlay: { ...liveState.textOverlay, color: e.target.value },
                          })
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                        aria-label="Custom text color"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
              <div className="space-y-4">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Export Video
                </h2>

                <div>
                  <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Container Format
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['mp4', 'webm'] as VideoExportFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        disabled={isExporting}
                        onClick={() => setExportFormat(fmt)}
                        className={`py-2 rounded-lg border text-xs font-mono uppercase font-medium cursor-pointer ${
                          exportFormat === fmt
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Quality
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'low', label: 'Low' },
                        { id: 'medium', label: 'Medium' },
                        { id: 'high', label: 'High' },
                      ] as { id: VideoExportQuality; label: string }[]
                    ).map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        disabled={isExporting}
                        onClick={() => setExportQuality(q.id)}
                        className={`py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                          exportQuality === q.id
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Output Resolution</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {displayAspectW} × {displayAspectH}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Output Duration</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatTime(editedDuration)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Segments</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {liveState.segments.length}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Powered by single-thread <span className="font-mono">ffmpeg.wasm</span> directly
                  in your browser. Keep this tab open while exporting.
                </p>

                {exportError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{exportError}</span>
                  </div>
                )}

                {isExporting ? (
                  <div className="space-y-2.5 p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{exportStage || 'Encoding…'}</span>
                      </span>
                      <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">
                        {exportProgress}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-blue-200 dark:bg-blue-950 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-150"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelExport}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel Export</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleExportVideo}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export {exportFormat.toUpperCase()}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExtractFrame}
                      className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-medium transition-colors cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Extract frame as image (PNG)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
