// VibeNet — Dashboard sidebar: brand, chat navigation, direct-message list,
// and account utilities (chat PIN, settings, profile, sign out).
//
// The DM list is placeholder data for now; it becomes live once the /ws
// message hub + contacts sync land.

'use client';

import { useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import { Stack, VStack } from '@astryxdesign/core/Stack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type { StatusDotVariant } from '@astryxdesign/core/StatusDot';
import {
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { AuthUser } from '@/lib/api';

type Conversation = {
  label: string;
  presence: StatusDotVariant;
  presenceLabel: string;
};

// Placeholder DMs until the contacts + WebSocket message flow is wired in.
const DIRECT_MESSAGES: Conversation[] = [
  { label: 'sarah_dev', presence: 'success', presenceLabel: 'Online' },
  { label: 'kasun_92', presence: 'warning', presenceLabel: 'Away' },
  { label: 'design_crew', presence: 'success', presenceLabel: 'Online' },
  { label: 'nadeesha', presence: 'neutral', presenceLabel: 'Offline' },
];

function ConversationItem({
  label,
  presence,
  presenceLabel,
  isSelected,
}: Conversation & { isSelected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showMenu = isHovered || isMenuOpen;

  return (
    <Stack
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
      <SideNavItem
        label={label}
        icon={<Avatar name={label} size="tiny" />}
        href="#"
        isSelected={isSelected}
        endContent={
          showMenu ? (
            <MoreMenu
              size="sm"
              label="Conversation options"
              onOpenChange={setIsMenuOpen}
              items={[
                { label: 'Pin conversation', onClick: () => {} },
                { label: 'Mark as read', onClick: () => {} },
                { label: 'Clear history', onClick: () => {} },
                { label: 'Delete chat', onClick: () => {} },
              ]}
            />
          ) : (
            <StatusDot variant={presence} label={presenceLabel} />
          )
        }
      />
    </Stack>
  );
}

export function Sidebar({
  user,
  onLogout,
}: {
  user: AuthUser | null;
  onLogout: () => void;
}) {
  return (
    <SideNav
      collapsible
      resizable={{ defaultWidth: 300, minWidth: 220, maxWidth: 420 }}
      header={
        <a
          href="/dashboard"
          aria-label="VibeNet home"
          className="flex items-center px-3 py-2">
          <img
            src="/logo/vibenet-logo.png"
            alt="VibeNet"
            width={1787}
            height={521}
            className="h-auto w-24"
          />
        </a>
      }
      footer={
        <SideNavSection title="Account" isHeaderHidden>
          <SideNavItem label="Chat PIN" icon={ShieldCheckIcon} href="#" />
          <SideNavItem label="Settings" icon={Cog6ToothIcon} href="#" />
          <SideNavItem
            label={user?.username ?? 'Account'}
            icon={<Avatar name={user?.username} size="tiny" />}
            href="#"
          />
          <SideNavItem
            label="Log out"
            icon={ArrowRightStartOnRectangleIcon}
            onClick={onLogout}
          />
        </SideNavSection>
      }>
      <SideNavSection title="Menu" isHeaderHidden>
        <SideNavItem label="New chat" icon={PlusIcon} href="#" />
        <SideNavItem label="Find people" icon={MagnifyingGlassIcon} href="#" />
        <SideNavItem label="Contacts" icon={UsersIcon} href="#" />
      </SideNavSection>
      <Divider />
      <SideNavSection title="Direct messages">
        <VStack gap={0.5}>
          {DIRECT_MESSAGES.map(chat => (
            <ConversationItem key={chat.label} {...chat} />
          ))}
        </VStack>
      </SideNavSection>
    </SideNav>
  );
}
