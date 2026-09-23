// VibeNet — shared six-digit PIN input backed by Rare UI's animated OTP input.

'use client';

import { OtpInput } from '@/components/ui/otp-input';

export function PinInput({
  value,
  onChange,
  onComplete,
  length = 6,
  masked = false,
  autoFocus = false,
  disabled = false,
  hasError = false,
  ariaLabel = 'PIN',
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  masked?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex justify-center">
      <OtpInput
        aria-label={ariaLabel}
        length={length}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        type="numbers"
        size="md"
        status={hasError ? 'error' : 'idle'}
        mask={masked}
        autoFocus={autoFocus}
        disabled={disabled}
        slotClassName="border border-gray-200 dark:border-gray-700"
      />
    </div>
  );
}
