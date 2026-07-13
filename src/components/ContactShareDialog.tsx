// VibeNet — "Share contact" picker, opened from the composer's Contact
// attachment item.
//
// Same shape as ForwardDialog: pick a contact from the client-side
// conversation registry (there's no backend "contacts" store — see
// ContactsView) and hand it back to the parent, which builds the
// ContactPayload and sends it end-to-end encrypted like any other message.

'use client';

import { useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { resolveAvatarUrl } from '@/lib/api';
import { peerName, type Conversation } from '@/lib/conversations';

export function ContactShareDialog({
  isOpen,
  onOpenChange,
  conversations,
  onShare,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  conversations: Conversation[];
  onShare: (peer: Conversation) => void | Promise<void>;
}) {
  const [sharingId, setSharingId] = useState<string | null>(null);

  async function handlePick(peer: Conversation) {
    setSharingId(peer.peerId);
    try {
      await onShare(peer);
      onOpenChange(false);
    } finally {
      setSharingId(null);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420} purpose="form">
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Share a contact"
            subtitle="Pick who to share — sent end-to-end encrypted"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={3}>
              {conversations.length === 0 ? (
                <Text type="supporting" color="secondary">
                  No contacts yet. Start a chat first, then share it.
                </Text>
              ) : (
                <List>
                  {conversations.map((c) => (
                    <ListItem
                      key={c.peerId}
                      label={peerName(c)}
                      description={`@${c.peerUsername}`}
                      startContent={
                        <Avatar src={resolveAvatarUrl(c.peerAvatarUrl)} name={peerName(c)} size="small" />
                      }
                      isDisabled={sharingId !== null}
                      onClick={() => void handlePick(c)}
                    />
                  ))}
                </List>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
