// VibeNet — renders a poll inside a message bubble.
//
// Real voting: tapping an option casts/changes your vote (see
// DashboardShell.handleVotePoll), which both applies locally right away and
// broadcasts a 'poll_vote' message so every other device sharing this poll
// converges on the same tally — see lib/messageStore's applyPollVote. Tallies,
// the winning-so-far fill bars, and the "who voted" avatar strip are all
// derived straight from poll.votes/voteOrder, so there's no separate local
// state to keep in sync.
//
// Tapping anywhere on the card outside an option button opens the full
// "who voted for what" breakdown (see PollResultsDialog) — option buttons
// stop the click from bubbling up to that handler, so voting and opening the
// results view stay two distinct, unambiguous gestures.

'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { AvatarGroup, AvatarGroupOverflow } from '@astryxdesign/core/AvatarGroup';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { resolveAvatarUrl } from '@/lib/api';
import type { PollPayload } from '@/lib/messageStore';
import { PollResultsDialog } from './PollResultsDialog';

const MAX_VISIBLE_VOTER_AVATARS = 3;

export function PollMessageCard({
  poll,
  tone,
  myUserId,
  onVote,
  resolveVoter,
}: {
  poll: PollPayload;
  tone: 'sender' | 'receiver';
  /** Whose vote (if any) gets the checkmark + ring highlight. */
  myUserId: string;
  /** Casts/changes the signed-in user's vote for this poll. */
  onVote: (optionIndex: number) => void;
  /** Resolves a voter id to display info for the avatar strip — "You" for
   *  myUserId, otherwise the DM peer or the group member (see ChatView). */
  resolveVoter: (voterId: string) => { name: string; avatarUrl?: string };
}) {
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const isSender = tone === 'sender';
  const votes = poll.votes ?? {};
  const voterIds = Object.keys(votes);
  const totalVotes = voterIds.length;
  const myVote = votes[myUserId];

  const counts = poll.options.map(
    (_, index) => voterIds.filter((voterId) => votes[voterId] === index).length,
  );

  // Most-recently-voted first, capped to the strip's visible slots.
  const recentVoterIds = [...(poll.voteOrder ?? [])].reverse().slice(0, MAX_VISIBLE_VOTER_AVATARS);
  const overflowCount = totalVotes - recentVoterIds.length;

  function openResults() {
    setIsResultsOpen(true);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openResults();
    }
  }

  function handleOptionClick(event: MouseEvent<HTMLButtonElement>, index: number) {
    // Voting is its own gesture, distinct from the card's "open results" tap
    // — without this the option's click would bubble up and open the dialog
    // in the same gesture as casting the vote.
    event.stopPropagation();
    onVote(index);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openResults}
        onKeyDown={handleCardKeyDown}
        aria-label={`View poll results for "${poll.question}"`}
        className={`mb-1 flex w-80 max-w-full cursor-pointer flex-col gap-2 rounded-xl p-3 outline-none transition-colors ${isSender ? 'bg-white/10 hover:bg-white/15 focus-visible:bg-white/15' : 'bg-black/5 hover:bg-black/[0.07] focus-visible:bg-black/[0.07] dark:bg-white/10 dark:hover:bg-white/15 dark:focus-visible:bg-white/15'}`}>
        <div className="flex items-center gap-1.5">
          <ChartBarIcon
            className={`h-4 w-4 ${isSender ? 'text-white/80' : 'text-emerald-600 dark:text-emerald-400'}`}
            aria-hidden="true"
          />
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${isSender ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
            Poll
          </span>
        </div>
        <p className={`text-sm font-medium ${isSender ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
          {poll.question}
        </p>

        <div className="flex flex-col gap-1.5">
          {poll.options.map((option, index) => {
            const count = counts[index];
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMine = myVote === index;
            return (
              <button
                key={`${index}-${option}`}
                type="button"
                onClick={(event) => handleOptionClick(event, index)}
                aria-pressed={isMine}
                className={[
                  'relative overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                  isSender
                    ? 'bg-white/10 text-white/90 hover:bg-white/15'
                    : 'bg-black/5 text-gray-700 hover:bg-black/[0.07] dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15',
                  isMine ? (isSender ? 'ring-1 ring-white/70' : 'ring-1 ring-[var(--vibe-blue)]/60') : '',
                ].join(' ')}>
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${isSender ? 'bg-white/20' : 'bg-[var(--vibe-blue)]/20'}`}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {isMine && (
                      <CheckCircleIcon
                        className={`h-3.5 w-3.5 shrink-0 ${isSender ? 'text-white' : 'text-[var(--vibe-blue)]'}`}
                        aria-label="Your vote"
                      />
                    )}
                    <span className="truncate">{option}</span>
                  </span>
                  {totalVotes > 0 && (
                    <span className={`shrink-0 text-[11px] ${isSender ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                      {count} · {pct}%
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] ${isSender ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
            {totalVotes === 0 ? 'No votes yet' : `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`}
          </span>
          {recentVoterIds.length > 0 && (
            <AvatarGroup size="tiny">
              {recentVoterIds.map((voterId) => {
                const voter = resolveVoter(voterId);
                return <Avatar key={voterId} src={resolveAvatarUrl(voter.avatarUrl)} name={voter.name} />;
              })}
              {overflowCount > 0 && <AvatarGroupOverflow count={overflowCount} />}
            </AvatarGroup>
          )}
        </div>
      </div>

      <PollResultsDialog
        isOpen={isResultsOpen}
        onOpenChange={setIsResultsOpen}
        poll={poll}
        resolveVoter={resolveVoter}
      />
    </>
  );
}
