// VibeNet — group details popup, opened by clicking the group chat header.
//
// Shows the group photo (click to upload a new one), an editable group name,
// creation date, and the member roster with roles. Mutations live in
// DashboardShell (onRename / onUploadPhoto call the API and refresh state);
// this component is presentation + local edit state only, like the other
// dialogs. Any member may rename or change the photo — same policy as invites.

'use client';

import { useRef, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CameraIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { resolveAvatarUrl } from '@/lib/api';
import type { Group } from '@/lib/groups';

const MAX_GROUP_NAME_LENGTH = 64;

// Accepted photo types — mirrors the backend's sniffed allow-list.
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

function memberLabel(member: Group['members'][number]): string {
  return member.display_name.trim() || member.username;
}

export function GroupDetailsDialog({
  isOpen,
  onOpenChange,
  group,
  currentUserId,
  isSavingName,
  isUploadingPhoto,
  onRename,
  onUploadPhoto,
  onInviteMember,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  group: Group | null;
  currentUserId: string;
  /** True while a rename is in flight — disables the Save button. */
  isSavingName: boolean;
  /** True while a photo upload is in flight — overlays the avatar. */
  isUploadingPhoto: boolean;
  onRename: (name: string) => void;
  onUploadPhoto: (file: File) => void;
  /** Jumps to the existing invite dialog. */
  onInviteMember: () => void;
}) {
  // Local draft of the name; null means "not edited yet — mirror the group".
  // Kept as a draft (not synced via effect) so a live group_update refetch
  // doesn't clobber what the user is typing.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!group) return null;

  const name = nameDraft ?? group.name;
  const trimmedName = name.trim();
  const nameChanged = trimmedName !== group.name && trimmedName.length > 0;

  function handlePickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    event.target.value = '';
    if (file) onUploadPhoto(file);
  }

  const createdOn = new Date(group.created_at).toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={440} purpose="form">
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Group details"
            subtitle={`Created on ${createdOn}`}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={4}>
              {/* Photo + name, side by side. The avatar doubles as the upload
                  trigger, with a camera overlay to make that discoverable. */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label="Change group photo"
                  title="Change group photo"
                  disabled={isUploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">
                  <Avatar src={resolveAvatarUrl(group.avatar_url)} name={group.name} size={72} />
                  <span
                    className={[
                      'absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white transition-opacity',
                      isUploadingPhoto
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                    ].join(' ')}>
                    {isUploadingPhoto ? (
                      <span className="text-xs font-medium">Uploading…</span>
                    ) : (
                      <CameraIcon className="h-6 w-6" aria-hidden="true" />
                    )}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  className="hidden"
                  onChange={handlePickPhoto}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <TextInput
                    label="Group name"
                    value={name}
                    onChange={(value) => setNameDraft(value.slice(0, MAX_GROUP_NAME_LENGTH))}
                    isDisabled={isSavingName}
                  />
                  {nameChanged && (
                    <Button
                      label={isSavingName ? 'Saving…' : 'Save name'}
                      variant="primary"
                      size="sm"
                      isLoading={isSavingName}
                      onClick={() => onRename(trimmedName)}
                    />
                  )}
                </div>
              </div>

              {/* Member roster */}
              <VStack gap={2}>
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary">
                    {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                  </Text>
                  <Button
                    label="Invite"
                    variant="ghost"
                    size="sm"
                    icon={<UserPlusIcon className="h-4 w-4" aria-hidden="true" />}
                    onClick={onInviteMember}
                  />
                </div>
                <List>
                  {group.members.map((member) => (
                    <ListItem
                      key={member.user_id}
                      label={
                        member.user_id === currentUserId
                          ? `${memberLabel(member)} (you)`
                          : memberLabel(member)
                      }
                      description={`@${member.username}`}
                      startContent={
                        <Avatar
                          src={resolveAvatarUrl(member.avatar_url)}
                          name={memberLabel(member)}
                          size="small"
                        />
                      }
                      endContent={
                        member.role === 'owner' ? (
                          <Badge variant="info" label="Owner" />
                        ) : undefined
                      }
                    />
                  ))}
                </List>
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
