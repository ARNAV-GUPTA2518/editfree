import React, { useRef, useState } from 'react';
import { Upload, ShieldCheck, AlertCircle } from 'lucide-react';

interface DropZoneProps {
  title: string;
  subtitle: string;
  accept: string;
  supportedLabel: string;
  onFileSelected: (file: File) => void;
  errorMessage?: string | null;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon: React.ReactNode;
}

export const DropZone: React.FC<DropZoneProps> = ({
  title,
  subtitle,
  accept,
  supportedLabel,
  onFileSelected,
  errorMessage,
  secondaryActionLabel,
  onSecondaryAction,
  icon,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFileSelected(files[0]);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isDragging
              ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
              : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-600'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="mx-auto w-14 h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 mb-5">
            {icon}
          </div>

          <h1 className="font-display text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-50 text-balance">
            {title}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            {subtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Choose File</span>
            </span>

            {secondaryActionLabel && onSecondaryAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSecondaryAction();
                }}
                className="px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-sm font-medium transition-colors cursor-pointer"
              >
                {secondaryActionLabel}
              </button>
            )}
          </div>

          <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            {supportedLabel}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
          <span>100% processed on your device. Files are never uploaded anywhere.</span>
        </div>
      </div>
    </div>
  );
};
