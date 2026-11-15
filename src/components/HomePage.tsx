import React from 'react';
import {
  Image as ImageIcon,
  Film,
  Crop,
  Sliders,
  Type,
  Scissors,
  Gauge,
  ShieldCheck,
  Upload,
  Wand2,
  Download,
  Lock,
  Github,
  ArrowRight,
} from 'lucide-react';
import type { EditorMode } from '../types/editor';

interface HomePageProps {
  onOpenEditor: (mode: Exclude<EditorMode, 'home'>) => void;
}

const FEATURES = [
  {
    title: 'Crop & Rotate',
    description:
      'Precision aspect ratio presets (1:1, 4:5, 16:9, 9:16), 90° rotation, straighten slider, flip, resize, and custom photo borders.',
    icon: Crop,
  },
  {
    title: 'Filters',
    description:
      'Live exposure, brightness, contrast, warmth, sharpness, blur, vignette, and classic presets rendered deterministically on Canvas.',
    icon: Sliders,
  },
  {
    title: 'Text & Brush',
    description:
      'Add draggable typography layers with custom fonts and backdrops, or sketch freely with an isolated brush and eraser.',
    icon: Type,
  },
  {
    title: 'Video Trim',
    description:
      'Scrub a multi-segment timeline, drag trim handles, split clips at the playhead, delete unwanted sections, or extract PNG frames.',
    icon: Scissors,
  },
  {
    title: 'Speed Control',
    description:
      'Adjust playback speed from 0.25× slow motion up to 4× fast-forward with synced pitch-preserved audio and volume controls.',
    icon: Gauge,
  },
  {
    title: 'Private by Design',
    description:
      'Zero accounts, zero servers, and zero uploads. Every pixel and video frame is processed locally inside your browser tab.',
    icon: ShieldCheck,
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Open file',
    description:
      'Drop a JPG, PNG, WebP photo or MP4, WebM video straight from your device. Nothing is sent over the network.',
    icon: Upload,
  },
  {
    num: '02',
    title: 'Edit',
    description:
      'Crop, color-grade, draw, trim segments, adjust speed, or overlay text with real-time preview and full undo/redo history.',
    icon: Wand2,
  },
  {
    num: '03',
    title: 'Export',
    description:
      'Download clean, watermark-free PNG, JPG, WebP, MP4, or WebM files—or copy edited photos straight to your clipboard.',
    icon: Download,
  },
];

export const HomePage: React.FC<HomePageProps> = ({ onOpenEditor }) => {
  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Hero Section */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1
            className="font-display font-bold tracking-tight text-zinc-900 dark:text-zinc-50 text-balance mx-auto max-w-3xl"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1.08 }}
          >
            EditFree
          </h1>
          <p className="mt-4 text-base sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto text-balance leading-relaxed">
            Free photo &amp; video editor. No signup. Nothing uploaded.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4">
            <button
              type="button"
              onClick={() => onOpenEditor('photo')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-display text-base font-semibold shadow-sm hover:-translate-y-0.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 whitespace-nowrap"
            >
              <ImageIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>Edit a Photo</span>
              <ArrowRight className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onOpenEditor('video')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-display text-base font-semibold hover:-translate-y-0.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 whitespace-nowrap"
            >
              <Film className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>Edit a Video</span>
              <ArrowRight className="w-4 h-4 shrink-0 opacity-70" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>JPG · PNG · WebP</span>
            <span aria-hidden="true">·</span>
            <span>MP4 · WebM</span>
            <span aria-hidden="true">·</span>
            <span>Zero Watermarks</span>
            <span aria-hidden="true">·</span>
            <span>100% Client-Side</span>
          </div>
        </div>
      </section>

      {/* Features Section (6 Cards) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 text-balance">
            Classic editing tools without the bloat
          </h2>
          <p className="mt-2.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
            Built with standard browser APIs—Canvas 2D for photos and single-threaded WebAssembly FFmpeg for video.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-6 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {feat.title}
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {feat.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How It Works Section (3 Steps) */}
      <section className="border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            How it works
          </h2>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.num}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {step.num}
                    </span>
                    <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-3">
              <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Local-First Architecture</span>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Your files never leave your device
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              EditFree has no backend server, no analytics trackers, and no cloud storage. Photos are
              rendered with your browser&apos;s HTML5 Canvas API, and videos are trimmed and encoded
              directly in local memory using WebAssembly (<span className="font-mono text-xs">ffmpeg.wasm</span>).
              You can even disconnect from the internet once the page loads.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0 w-full md:w-auto">
            <button
              type="button"
              onClick={() => onOpenEditor('photo')}
              className="px-5 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
            >
              Launch Photo Editor
            </button>
            <button
              type="button"
              onClick={() => onOpenEditor('video')}
              className="px-5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Launch Video Editor
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-zinc-800 dark:text-zinc-200">
              EditFree
            </span>
            <span aria-hidden="true">·</span>
            <span>Built by Arnav Gupta</span>
          </div>

          <a
            href="https://github.com/ARNAV-GUPTA2518"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <Github className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  );
};
