import React, { useEffect } from 'react';
import { X, Image as ImageIcon, Film, ShieldCheck } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { group: 'General', keys: ['Ctrl / Cmd', 'Z'], action: 'Undo last edit' },
  { group: 'General', keys: ['Ctrl / Cmd', 'Y'], action: 'Redo edit' },
  { group: 'General', keys: ['Ctrl / Cmd', 'Shift', 'Z'], action: 'Redo edit (alternative)' },
  { group: 'Photo Editor', keys: ['Delete / Backspace'], action: 'Remove selected text layer' },
  { group: 'Video Editor', keys: ['Space'], action: 'Play or pause video' },
  { group: 'Video Editor', keys: ['S'], action: 'Split segment at playhead' },
  { group: 'Video Editor', keys: ['Delete / Backspace'], action: 'Delete selected segment' },
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2
            id="help-title"
            className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Help &amp; Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help dialog"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Usage Tips */}
        <div className="mt-4 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Quick Tips
          </h3>
          <div className="space-y-2.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300">
            <div className="flex items-start gap-2.5">
              <ImageIcon className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <p>
                <strong>Photo Editor:</strong> Double-click any adjustment slider label to reset it.
                Drag text layers directly on the canvas, or use <em>Compare</em> for a live split wipe.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Film className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <p>
                <strong>Video Editor:</strong> Drag the blue handles on a segment to trim, press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-xs">
                  S
                </kbd>{' '}
                to split at the playhead, or use <em>Extract Frame</em> to save a still PNG.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <p>
                <strong>100% Local:</strong> All processing happens inside your browser tab. Large
                video exports run on your CPU and may take a few minutes.
              </p>
            </div>
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
            Keyboard Shortcuts
          </h3>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {SHORTCUTS.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{item.action}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.group}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {item.keys.map((k, kIdx) => (
                    <React.Fragment key={kIdx}>
                      {kIdx > 0 && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">+</span>
                      )}
                      <kbd className="px-2 py-1 text-xs font-mono font-medium rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                        {k}
                      </kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
