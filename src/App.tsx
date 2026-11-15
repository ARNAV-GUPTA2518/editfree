/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { EditorMode, ThemeMode } from './types/editor';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { HelpModal } from './components/HelpModal';
import { NotFoundView } from './components/NotFoundView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { PhotoEditor } from './components/photo/PhotoEditor';
import { VideoEditor } from './components/video/VideoEditor';

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('editfree_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage access errors
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'dark';
}

function parseHashRoute(): { mode: EditorMode; unknownRoute: string | null } {
  if (typeof window === 'undefined') return { mode: 'home', unknownRoute: null };
  const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (!raw || raw === 'home') return { mode: 'home', unknownRoute: null };
  if (raw === 'photo') return { mode: 'photo', unknownRoute: null };
  if (raw === 'video') return { mode: 'video', unknownRoute: null };
  return { mode: 'home', unknownRoute: `#${raw}` };
}

export default function App() {
  const initialRoute = parseHashRoute();
  const [mode, setMode] = useState<EditorMode>(initialRoute.mode);
  const [unknownRoute, setUnknownRoute] = useState<string | null>(initialRoute.unknownRoute);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [helpOpen, setHelpOpen] = useState(false);
  const [photoDirty, setPhotoDirty] = useState(false);
  const [videoDirty, setVideoDirty] = useState(false);

  const hasUnsavedEdits = photoDirty || videoDirty;

  // Sync theme class & localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('editfree_theme', theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  // Warn users before closing/refreshing if there are unsaved edits
  useEffect(() => {
    if (!hasUnsavedEdits) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedEdits]);

  // Update page title based on active view
  useEffect(() => {
    if (unknownRoute) {
      document.title = 'Page Not Found — EditFree';
    } else if (mode === 'photo') {
      document.title = 'Photo Editor — EditFree';
    } else if (mode === 'video') {
      document.title = 'Video Editor — EditFree';
    } else {
      document.title = 'EditFree — Free Browser Photo & Video Editor';
    }
  }, [mode, unknownRoute]);

  // Listen to browser hash navigation (supports back/forward & 404 state)
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHashRoute();
      setMode(parsed.mode);
      setUnknownRoute(parsed.unknownRoute);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateTo = useCallback((nextMode: EditorMode) => {
    setUnknownRoute(null);
    setMode(nextMode);
    const targetHash = nextMode === 'home' ? '#home' : `#${nextMode}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="h-dvh flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
          <Header
            mode={mode}
            onModeChange={navigateTo}
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            onOpenHelp={() => setHelpOpen(true)}
          />

          <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {unknownRoute ? (
              <NotFoundView route={unknownRoute} onGoHome={() => navigateTo('home')} />
            ) : (
              <>
                <AnimatePresence mode="wait">
                  {mode === 'home' && (
                    <motion.div
                      key="home-view"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="flex-1 flex flex-col min-h-0 overflow-hidden"
                    >
                      <HomePage onOpenEditor={(target) => navigateTo(target)} />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className={mode === 'photo' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
                  <PhotoEditor isActive={mode === 'photo'} onDirtyChange={setPhotoDirty} />
                </div>
                <div className={mode === 'video' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
                  <VideoEditor isActive={mode === 'video'} onDirtyChange={setVideoDirty} />
                </div>
              </>
            )}
          </main>

          <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
