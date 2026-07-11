// VibeNet — "New chat" search dialog.
//
// Search is the only discovery mechanism the backend exposes (GET
// /api/users/search?username=), so this dialog doubles as the target for both
// the sidebar's "New chat" and "Find people" actions. Selecting a result fetches
// their E2EE public key (GET /api/users/{id}/key) and hands the resolved peer back
// to the caller to open as a conversation. The chat PIN is single-sided — the
// current user's own unlock happens in DashboardShell when the room opens, so this
// dialog no longer deals with PINs.

'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { gooeyToast } from 'goey-toast';
import { resolveAvatarUrl } from '@/lib/api';
import { apiClient } from '@/lib/apiClient';

interface SearchResult {
  user_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export interface ResolvedPeer {
  userId: string;
  username: string;
  displayName?: string;
  publicKey: string;
  avatarUrl?: string;
}

// The name to show for a search hit: the real name when present, else the handle.
function resultName(user: SearchResult): string {
  const display = user.display_name?.trim();
  return display ? display : user.username;
}

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

export function NewChatDialog({
  isOpen,
  onOpenChange,
  currentUserId,
  onStart,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  currentUserId: string;
  onStart: (peer: ResolvedPeer) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Below this length we neither fetch nor show stale results — see the
  // `showResults` render gate below. Transient state otherwise resets for
  // free: the parent remounts this component (via a `key` bump) each time
  // "New chat" is reopened, rather than an effect clearing fields on close.
  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return;

    setIsSearching(true);
    const timer = setTimeout(() => {
      apiClient
        .get<{ results: SearchResult[] }>(
          `/api/users/search?username=${encodeURIComponent(trimmedQuery)}`,
        )
        .then((data) => {
          setResults(data.results.filter((u) => u.user_id !== currentUserId));
          setSearchError(null);
        })
        .catch((err: unknown) => {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => setIsSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmedQuery, currentUserId]);

  async function resolvePeer(user: SearchResult) {
    setIsStarting(true);
    try {
      const data = await apiClient.get<{
        user_id: string;
        display_name?: string;
        public_key: string;
        avatar_url?: string;
      }>(`/api/users/${user.user_id}/key`);
      onStart({
        userId: user.user_id,
        username: user.username,
        // The key response is authoritative for name + avatar; fall back to the
        // search hit, then the username, so a name is always present.
        displayName: data.display_name ?? user.display_name ?? user.username,
        publicKey: data.public_key,
        avatarUrl: data.avatar_url ?? user.avatar_url,
      });
      onOpenChange(false);
    } catch (err) {
      gooeyToast.error(err instanceof Error ? err.message : 'Could not start this chat.');
    } finally {
      setIsStarting(false);
    }
  }

  function handleSelect(user: SearchResult) {
    void resolvePeer(user);
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420} purpose="form">
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="New chat"
            subtitle="Find someone by username to start an encrypted conversation"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={3}>
              <TextInput
                label="Search by username"
                isLabelHidden
                placeholder="Search by username"
                value={query}
                onChange={setQuery}
                startIcon={<Icon icon={MagnifyingGlassIcon} size="sm" />}
                isLoading={showResults && (isSearching || isStarting)}
                hasAutoFocus
                hasClear
              />

              {showResults && searchError && (
                <Text type="supporting" className="text-red-600 dark:text-red-400">
                  {searchError}
                </Text>
              )}

              {showResults && results.length > 0 && (
                <List>
                  {results.map((user) => (
                    <ListItem
                      key={user.user_id}
                      label={resultName(user)}
                      description={
                        resultName(user) !== user.username ? `@${user.username}` : undefined
                      }
                      startContent={<Avatar src={resolveAvatarUrl(user.avatar_url)} name={resultName(user)} size="small" />}
                      onClick={() => handleSelect(user)}
                    />
                  ))}
                </List>
              )}

              {showResults && !isSearching && !searchError && results.length === 0 && (
                <Text type="supporting" color="secondary">
                  No users found.
                </Text>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
