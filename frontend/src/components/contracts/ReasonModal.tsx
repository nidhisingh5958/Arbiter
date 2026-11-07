import { useState } from 'react';
import { Button, type ButtonVariant } from '../ui/Button';
import { Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

/** Collects a reason/note for actions that land in the audit trail (dispute, override, refund). */
export function ReasonModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  variant = 'primary',
  minLength = 3,
  placeholder,
  loading,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: ButtonVariant;
  minLength?: number;
  placeholder?: string;
  loading?: boolean;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const ok = text.trim().length >= minLength;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} disabled={!ok} loading={loading} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={title} className="min-h-28" />
      <p className="mt-1.5 text-xs text-ink-400">
        {ok ? 'Recorded permanently in the decision log.' : `At least ${minLength} characters — this is recorded in the audit trail.`}
      </p>
    </Modal>
  );
}
