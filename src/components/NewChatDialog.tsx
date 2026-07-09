// VibeNet — "New chat" search dialog.
//
// Search is the only discovery mechanism the backend exposes (GET
// /api/users/search?username=), so this dialog doubles as the target for both
// the sidebar's "New chat" and "Find people" actions. Selecting a result
// fetches their E2EE public key (GET /api/users/{id}/key) — PIN-gated
// accounts get an inline PIN step, matching the backend's `?pin=` param —
// and hands the resolved peer back to the caller to open as a conversation.

'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { ApiError } from '@/lib/api';
import { apiClient } from '@/lib/apiClient';

interface SearchResult {
  user_id: string;
  username: string;
  require_pin: boolean;
}

export interface ResolvedPeer {
  userId: string;
  username: string;
  publicKey: string;
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

  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [pin, setPin] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

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

  async function resolvePeer(user: SearchResult, pinValue?: string) {
    setIsStarting(true);
    setStartError(null);
    try {
      const path = pinValue
        ? `/api/users/${user.user_id}/key?pin=${encodeURIComponent(pinValue)}`
        : `/api/users/${user.user_id}/key`;
      const data = await apiClient.get<{ user_id: string; public_key: string }>(path);
      onStart({ userId: user.user_id, username: user.username, publicKey: data.public_key });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setStartError('Invalid or expired PIN.');
      } else {
        setStartError(err instanceof Error ? err.message : 'Could not start this chat.');
      }
    } finally {
      setIsStarting(false);
    }
  }

  function handleSelect(user: SearchResult) {
    setStartError(null);
    if (user.require_pin) {
      setSelected(user);
      setPin('');
      return;
    }
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
              {selected ? (
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center">
                    <Avatar name={selected.username} size="small" />
                    <Text type="body" weight="semibold">
                      {selected.username}
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary">
                    This account requires a PIN to start a chat. Ask them for
                    their current 4-digit code.
                  </Text>
                  <TextInput
                    label="4-digit PIN"
                    value={pin}
                    onChange={setPin}
                    placeholder="0000"
                    hasAutoFocus
                    onEnter={() => {
                      if (pin.length === 4) void resolvePeer(selected, pin);
                    }}
                  />
                  {startError && (
                    <Text type="supporting" className="text-red-600 dark:text-red-400">
                      {startError}
                    </Text>
                  )}
                </VStack>
              ) : (
                <>
                  <TextInput
                    label="Search by username"
                    isLabelHidden
                    placeholder="Search by username"
                    value={query}
                    onChange={setQuery}
                    startIcon={<Icon icon={MagnifyingGlassIcon} size="sm" />}
                    isLoading={showResults && isSearching}
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
                          label={user.username}
                          description={user.require_pin ? 'PIN required' : undefined}
                          startContent={<Avatar name={user.username} size="small" />}
                          endContent={
                            user.require_pin ? (
                              <Icon icon={ShieldCheckIcon} size="sm" />
                            ) : undefined
                          }
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
                </>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          selected ? (
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Back"
                  variant="secondary"
                  onClick={() => setSelected(null)}
                />
                <Button
                  label="Start chat"
                  variant="primary"
                  isLoading={isStarting}
                  isDisabled={pin.length !== 4}
                  onClick={() => void resolvePeer(selected, pin)}
                />
              </HStack>
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}
