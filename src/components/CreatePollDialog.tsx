// VibeNet — "Create poll" dialog, opened from the composer's Poll attachment
// item.
//
// Voting itself isn't wired up yet (see PollMessageCard's "Voting is coming
// soon"), but the question and options entered here are real — they go
// straight into the PollPayload sent through the exact same E2EE pipeline as
// every other message type (see DashboardShell.handleSendPoll).

'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { PollPayload } from '@/lib/messageStore';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

export function CreatePollDialog({
  isOpen,
  onOpenChange,
  isSending,
  onCreate,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isSending: boolean;
  onCreate: (poll: PollPayload) => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']));
  }

  function removeOption(index: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)));
  }

  const trimmedOptions = options.map((option) => option.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && trimmedOptions.length >= MIN_OPTIONS && !isSending;

  function handleCreate() {
    if (!canCreate) return;
    onCreate({ question: question.trim(), options: trimmedOptions });
    setQuestion('');
    setOptions(['', '']);
    onOpenChange(false);
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={400} purpose="form">
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Create poll"
            subtitle="Voting isn't wired up yet, but the poll itself sends for real"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={3}>
              <TextInput
                label="Question"
                placeholder="e.g. Where should we eat?"
                value={question}
                onChange={setQuestion}
                hasAutoFocus
                isDisabled={isSending}
              />

              <VStack gap={2}>
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <TextInput
                        label={`Option ${index + 1}`}
                        isLabelHidden
                        placeholder={`Option ${index + 1}`}
                        value={option}
                        onChange={(value) => updateOption(index, value)}
                        isDisabled={isSending}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove option ${index + 1}`}
                      disabled={isSending || options.length <= MIN_OPTIONS}
                      onClick={() => removeOption(index)}
                      className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-gray-400 dark:text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-gray-300">
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </VStack>

              <Button
                label="Add option"
                variant="ghost"
                icon={<PlusIcon className="h-4 w-4" />}
                isDisabled={isSending || options.length >= MAX_OPTIONS}
                onClick={addOption}
              />

              <Button
                label={isSending ? 'Sending…' : 'Create poll'}
                variant="primary"
                isLoading={isSending}
                isDisabled={!canCreate}
                onClick={handleCreate}
              />
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
