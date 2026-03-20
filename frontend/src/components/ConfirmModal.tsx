import { useEffect, useRef, useCallback } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  thirdActionText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onThirdAction?: () => void;
  variant?: 'danger' | 'warning' | 'info';
  thirdActionVariant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  thirdActionText,
  onConfirm,
  onCancel,
  onThirdAction,
  variant = 'danger',
  thirdActionVariant = 'danger',
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    }
  }, [isOpen]);

  // Focus trap + Escape handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      onCancel();
      return;
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [isOpen, onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: 'bg-destructive hover:bg-destructive/90',
    warning: 'bg-muted-foreground hover:bg-muted-foreground/90',
    info: 'bg-primary hover:bg-primary/90',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div
        className="fixed inset-0 bg-slate-900/30"
        onClick={cancelText ? onCancel : undefined}
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-card shadow-xl p-4 sm:p-6 w-[calc(100%-2rem)] sm:w-full rounded-lg max-w-md mx-4 outline-none"
      >
        <h3 id="confirm-modal-title" className="text-base sm:text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">{message}</p>
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
          {cancelText && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-foreground bg-accent hover:bg-accent/80 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              {cancelText}
            </button>
          )}
          {thirdActionText && onThirdAction && (
            <button
              onClick={onThirdAction}
              className={`px-4 py-2 text-sm font-medium text-destructive-foreground rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring ${variantStyles[thirdActionVariant]}`}
            >
              {thirdActionText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-destructive-foreground rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring ${variantStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
