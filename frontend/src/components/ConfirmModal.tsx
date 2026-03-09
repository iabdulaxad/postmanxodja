import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cancelText) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, cancelText, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: 'bg-red-500 hover:bg-red-600',
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    info: 'bg-primary hover:bg-primary/90',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={cancelText ? onCancel : undefined}
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-card shadow-xl p-4 sm:p-6 w-[calc(100%-2rem)] sm:w-full rounded-lg max-w-md mx-4 outline-none"
      >
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">{message}</p>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
          {cancelText && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-foreground bg-accent hover:bg-accent/80 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
          )}
          {thirdActionText && onThirdAction && (
            <button
              onClick={onThirdAction}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${variantStyles[thirdActionVariant]}`}
            >
              {thirdActionText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${variantStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
