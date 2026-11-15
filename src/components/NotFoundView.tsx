import React from 'react';
import { Home, AlertTriangle } from 'lucide-react';

interface NotFoundViewProps {
  route?: string;
  onGoHome: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ route, onGoHome }) => {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-md w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">404</p>
        <h1 className="mt-1 font-display text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {route
            ? `The view "${route}" does not exist in EditFree.`
            : 'The requested view could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={onGoHome}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>Back to Home</span>
        </button>
      </div>
    </div>
  );
};
