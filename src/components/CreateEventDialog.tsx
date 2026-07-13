// VibeNet — "Create event" placeholder, opened from the composer's Event
// attachment item.
//
// Real event scheduling (RSVPs, reminders) doesn't exist yet — this just
// collects a title/date/location and sends a dummy EventPayload through the
// exact same E2EE pipeline as every other message type (see
// DashboardShell.handleSendEvent).

'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { EventPayload } from '@/lib/messageStore';

// A week from now, at creation time, is as reasonable a placeholder date as
// any for a stub feature with no real date picker yet.
function defaultDummyDate(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function CreateEventDialog({
  isOpen,
  onOpenChange,
  isSending,
  onCreate,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isSending: boolean;
  onCreate: (event: EventPayload) => void;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');

  function handleCreate() {
    onCreate({
      title: title.trim() || 'Untitled event',
      date: defaultDummyDate(),
      location: location.trim() || undefined,
    });
    setTitle('');
    setLocation('');
    onOpenChange(false);
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={400} purpose="form">
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Create event"
            subtitle="Events are coming soon — this sends a placeholder for now"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={3}>
              <TextInput
                label="Title"
                placeholder="e.g. Team dinner"
                value={title}
                onChange={setTitle}
                hasAutoFocus
                isDisabled={isSending}
              />
              <TextInput
                label="Location (optional)"
                placeholder="e.g. The usual place"
                value={location}
                onChange={setLocation}
                isDisabled={isSending}
              />
              <Text type="supporting" color="secondary">
                Date/time picking is a placeholder for now — full event scheduling is on the way.
              </Text>
              <Button
                label={isSending ? 'Sending…' : 'Create event'}
                variant="primary"
                isLoading={isSending}
                onClick={handleCreate}
              />
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
