// VibeNet — Dashboard sidebar: brand, chat navigation, direct-message list,
// and account utilities (chat PIN, settings, profile, sign out).
//
// The DM list is real — sourced from the client-side conversation registry
// (src/lib/conversations.ts) — but presence is not: the backend has no
// online/offline broadcast, so every conversation shows a neutral "Offline"
// dot until that's wired up. Faking green dots for accounts with no real
// presence data would be misleading.

'use client';

import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import {
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { AuthUser } from '@/lib/api';
import type { Conversation } from '@/lib/conversations';

export function Sidebar({
  user,
  conversations,
  activePeerId,
  onSelectConversation,
  onNewChat,
  onLogout,
}: {
  user: AuthUser | null;
  conversations: Conversation[];
  activePeerId: string | null;
  onSelectConversation: (peerId: string) => void;
  onNewChat: () => void;
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
        <SideNavItem label="New chat" icon={PlusIcon} onClick={onNewChat} />
        <SideNavItem
          label="Find people"
          icon={MagnifyingGlassIcon}
          onClick={onNewChat}
        />
        <SideNavItem label="Contacts" icon={UsersIcon} href="#" />
      </SideNavSection>
      <Divider />
      <SideNavSection title="Direct messages">
        {conversations.length === 0 ? (
          <Text type="supporting" color="secondary" className="px-3 py-2">
            No conversations yet — start one from &ldquo;New chat&rdquo;.
          </Text>
        ) : (
          conversations.map((conversation) => (
            <SideNavItem
              key={conversation.peerId}
              label={conversation.peerUsername}
              icon={<Avatar name={conversation.peerUsername} size="tiny" />}
              isSelected={conversation.peerId === activePeerId}
              onClick={() => onSelectConversation(conversation.peerId)}
              endContent={<StatusDot variant="neutral" label="Offline" />}
            />
          ))
        )}
      </SideNavSection>
    </SideNav>
  );
}
