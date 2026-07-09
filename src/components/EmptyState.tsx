// VibeNet — Empty conversation state, shown when no chat is selected.

import { Text } from '@astryxdesign/core/Text';

export function EmptyState() {
  return (
    <div className="vibe-empty mt-8">
      <Text type="large" weight="bold">
        No conversation selected
      </Text>
      <Text type="supporting" color="secondary">
        Messages are encrypted on your device — only you and your contact can
        read them.
      </Text>
    </div>
  );
}
