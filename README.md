# EditFree

**Free photo & video editor. No signup. Nothing uploaded.**

EditFree is a 100% client-side photo and video editor built with React, TypeScript, Tailwind CSS, HTML5 Canvas, and single-threaded `ffmpeg.wasm`. Everything runs locally in your browser—no backend, no accounts, no watermarks, and no AI APIs.

---

## Features

### Home & Workspace
- **Landing Home Page**: Clear hero launchpad for Photo & Video editors, 6-card feature overview, 3-step workflow guide, and local-first privacy breakdown.
- **Persistent Light & Dark Mode**: Saved automatically in `localStorage`.
- **Unsaved Edits Protection**: Prompts before leaving or refreshing the tab when edits have not yet been exported.
- **Help & Shortcuts Modal**: Usage tips and keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`, `Space`, `S`, `Del`).
- **Toast Notifications & Custom 404 Fallback**: Clear feedback for exports, clipboard copies, and invalid routes.

### Photo Editor
- **Upload / Drag & Drop**: JPG, PNG, WebP (plus a generated sample photo for instant testing).
- **Transform & Frame**: Interactive crop with aspect presets (`Free`, `1:1`, `4:5`, `16:9`, `9:16`, `4:3`), ±90° rotation, straighten (`-45°` to `+45°`), horizontal/vertical flip, pixel resize with aspect lock, and customizable photo border/frame.
- **Adjustments**: Live preview for Exposure, Brightness, Contrast, Saturation, Warmth, Sharpness, Blur, and Vignette.
- **Classic Filters**: Original, B&W, Sepia, Vintage, Cool, Warm, Punch, and Faded with live thumbnails.
- **Text & Drawing**: Draggable text layers (font, size, bold/italic, color, backdrop) and isolated brush/eraser strokes.
- **History & Compare**: Full Undo/Redo, Reset, Hold-to-Compare, and interactive Before/After split wipe.
- **Export & Clipboard**: Download as PNG, JPG, or WebP with quality slider and size presets (`Original`, `1080px`, `720px`), or **Copy to clipboard** as PNG.

### Video Editor
- **Upload / Drag & Drop**: MP4 and WebM with an automatic notice for large files (> 40 MB or > 90s).
- **Timeline**: Play/pause (`Space`), drag-to-scrub playhead, draggable segment trim handles, `Set In` / `Set Out`, `Split` (`S`), and `Delete` (`Del`) with Undo/Redo.
- **Speed, Audio & Rotate**: Speed (`0.25×` to `4×` with chained `atempo` audio filters), mute/volume control, and ±90° rotation.
- **Filters & Text**: Live preview presets, brightness/contrast/saturation sliders, and draggable text overlay.
- **Frame Extraction & Export**: Save any paused/scrubbed frame as a PNG image, or export to **MP4** / **WebM** with **Low / Medium / High** quality options and a live progress bar via single-threaded `ffmpeg.wasm`.

---

## Screenshots

> Add repository screenshots under `docs/screenshots/` and reference them below:

| View | Preview |
| --- | --- |
| Home Page (Dark & Light) | `![Home Page](docs/screenshots/home.png)` |
| Photo Editor (Adjustments & Compare) | `![Photo Editor](docs/screenshots/photo-editor.png)` |
| Video Editor (Timeline & Export) | `![Video Editor](docs/screenshots/video-editor.png)` |

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Building for Production

```bash
npm run build
```

This generates the static bundle inside `dist/`, including `dist/ffmpeg/ffmpeg-core.js` and `dist/ffmpeg/ffmpeg-core.wasm`.

---

## Deploying to GitHub Pages

EditFree includes a ready-to-use GitHub Actions workflow at `.github/workflows/deploy.yml` and relative asset resolution (`base: './'` in `vite.config.ts`), so it works on any `https://<username>.github.io/<repo>/` URL without custom `COOP`/`COEP` headers.

1. Push your repository to GitHub with `main` as the default branch.
2. In your GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Every push to `main` (or manual run from the **Actions** tab) will automatically build `dist/` and publish it to GitHub Pages.
