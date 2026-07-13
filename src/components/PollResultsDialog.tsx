// VibeNet — "Poll results" modal, opened by tapping a Poll card (see
// PollMessageCard).
//
// Lists every option with who voted for it — name + avatar, most recent
// voter first — rather than just the tally the card itself shows. Purely a
// read-only view over the poll's already-local votes/voteOrder; no network
// calls of its own.

'use client';

import { Avatar } from '@astryxdesign/core/Avatar';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { resolveAvatarUrl } from '@/lib/api';
import type { PollPayload } from '@/lib/messageStore';

export function PollResultsDialog({
  isOpen,
  onOpenChange,
  poll,
  resolveVoter,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  poll: PollPayload;
  resolveVoter: (voterId: string) => { name: string; avatarUrl?: string };
}) {
  const votes = poll.votes ?? {};
  const voterIds = Object.keys(votes);
  const totalVotes = voterIds.length;

  // Most-recent-voter-first within each option, mirroring the card's own
  // avatar strip ordering — voteOrder has no per-option split, so rank each
  // voter by their position in it and sort each option's list by that.
  const orderRank = new Map((poll.voteOrder ?? []).map((id, index) => [id, index]));
  const votersByOption = poll.options.map((_, index) =>
    voterIds
      .filter((voterId) => votes[voterId] === index)
      .sort((a, b) => (orderRank.get(b) ?? -1) - (orderRank.get(a) ?? -1)),
  );

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420} purpose="form">
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Poll results"
            subtitle={`${poll.question} — ${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={4}>
              {poll.options.map((option, index) => {
                const optionVoterIds = votersByOption[index];
                const count = optionVoterIds.length;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                return (
                  <div key={`${index}-${option}`} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2 border-b border-black/5 pb-1.5 dark:border-white/10">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {option}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {count} · {pct}%
                      </span>
                    </div>

                    {optionVoterIds.length === 0 ? (
                      <Text type="supporting" color="secondary">
                        No votes yet
                      </Text>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {optionVoterIds.map((voterId) => {
                          const voter = resolveVoter(voterId);
                          return (
                            <div key={voterId} className="flex items-center gap-2.5">
                              <Avatar
                                src={resolveAvatarUrl(voter.avatarUrl)}
                                name={voter.name}
                                size="small"
                              />
                              <span className="truncate text-sm text-gray-700 dark:text-gray-200">
                                {voter.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
