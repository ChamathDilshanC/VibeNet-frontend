// VibeNet — composer "+" attachment menu (WhatsApp-style).
//
// Same compound-children Astryx DropdownMenu pattern as MessageContextMenu/
// GroupContextMenu: a ghost icon-only trigger opening a popover of
// role="menuitem" buttons, each with a colored icon badge matching the
// reference design. Document, Photos & videos, and Audio hand off to the
// parent's hidden file input (see ChatView) — the E2EE encrypt/upload/send
// flow already lives in DashboardShell's handleSendFile and doesn't change
// based on how the file was picked. Contact/Poll/Event each open their own
// Astryx modal (see DashboardShell). Camera is still a UI placeholder.

'use client';

import { useCallback, type ComponentType, type SVGProps } from 'react';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import {
  CalendarDaysIcon,
  CameraIcon,
  ChartBarIcon,
  DocumentIcon,
  IdentificationIcon,
  MicrophoneIcon,
  PhotoIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { gooeyToast } from 'goey-toast';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

function MenuButton({
  icon: Icon,
  badgeClassName,
  label,
  onClick,
}: {
  icon: IconComponent;
  badgeClassName: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[7px] px-2 py-1.5 text-left text-sm text-[var(--color-text-primary)] outline-none transition-colors hover:bg-[var(--color-overlay-hover)] focus-visible:bg-[var(--color-overlay-hover)]">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${badgeClassName}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 truncate font-medium">{label}</span>
    </button>
  );
}

export function AttachmentMenu({
  isOpen,
  onOpenChange,
  isDisabled = false,
  onPickPhotosAndVideos,
  onPickDocument,
  onPickAudio,
  onOpenContactShare,
  onOpenPollComposer,
  onOpenEventComposer,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isDisabled?: boolean;
  /** Opens the hidden file input with accept="image/*,video/*". */
  onPickPhotosAndVideos: () => void;
  /** Opens the hidden file input with accept="*". */
  onPickDocument: () => void;
  /** Opens the hidden file input with accept="audio/*". */
  onPickAudio: () => void;
  /** Opens the "Share a contact" picker (see ContactShareDialog). */
  onOpenContactShare: () => void;
  /** Opens the "Create poll" placeholder (see CreatePollDialog). */
  onOpenPollComposer: () => void;
  /** Opens the "Create event" placeholder (see CreateEventDialog). */
  onOpenEventComposer: () => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Run an action, then close the menu — same helper MessageContextMenu/
  // GroupContextMenu use.
  const run = useCallback(
    (action: () => void) => () => {
      action();
      close();
    },
    [close],
  );

  return (
    <DropdownMenu
      isMenuOpen={isOpen}
      onOpenChange={onOpenChange}
      hasChevron={false}
      menuWidth={230}
      placement="above"
      // DropdownMenu's own styles cap it at 300px with overflow-y: auto,
      // which clips this seven-item menu into a scrollbar — this project
      // wants every item visible at once instead, so this lifts the cap.
      // A plain `style` prop is merged in last (see Astryx's mergeProps),
      // so it wins over the component's baked-in max-height/overflow.
      style={{ maxHeight: 'none', overflowY: 'visible' }}
      button={{
        label: 'Attach',
        icon: <PlusIcon className="h-6 w-6" />,
        isIconOnly: true,
        variant: 'ghost',
        // 'lg' → Astryx's --size-element-lg (36px), matching the composer's
        // other icon buttons exactly (the emoji button's own p-1.5 + h-6 icon,
        // and the send button's explicit h-9/w-9) — 'sm' is only 28px, which
        // is what was throwing the "+" trigger's icon off-center against them
        // in this items-end (bottom-aligned) row.
        size: 'lg',
        isDisabled,
      }}>
      <MenuButton
        icon={DocumentIcon}
        badgeClassName="bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"
        label="Document"
        onClick={run(onPickDocument)}
      />
      <MenuButton
        icon={PhotoIcon}
        badgeClassName="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
        label="Photos & videos"
        onClick={run(onPickPhotosAndVideos)}
      />
      <MenuButton
        icon={CameraIcon}
        badgeClassName="bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
        label="Camera"
        onClick={run(() => gooeyToast.info('Camera capture is coming soon.'))}
      />
      <MenuButton
        icon={MicrophoneIcon}
        badgeClassName="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
        label="Audio"
        onClick={run(onPickAudio)}
      />
      <MenuButton
        icon={IdentificationIcon}
        badgeClassName="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
        label="Contact"
        onClick={run(onOpenContactShare)}
      />
      <MenuButton
        icon={ChartBarIcon}
        badgeClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
        label="Poll"
        onClick={run(onOpenPollComposer)}
      />
      <MenuButton
        icon={CalendarDaysIcon}
        badgeClassName="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300"
        label="Event"
        onClick={run(onOpenEventComposer)}
      />
    </DropdownMenu>
  );
}
