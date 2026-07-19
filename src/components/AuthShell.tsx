// Shared chrome for the Login and Register pages: a small brand logo, a title
// and subtitle, and a centered, width-constrained content column that matches
// the landing page's spacing and brand accents.

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Secondary line under the form, e.g. the link to the other auth page. */
  footer: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex w-full flex-1 flex-col bg-[#f8fafc]">
      {/* Faded grid — anchored to the top edge, same on both auth pages. */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e2e8f0 1px, transparent 1px),
            linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
          `,
          backgroundSize: '20px 30px',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 0%, #000 60%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 60%, transparent 100%)',
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-start gap-5">
            <Link href="/" aria-label="VibeNet home" className="vibe-logo">
              <img
                src="/logo/vibenet-logo.png"
                alt="VibeNet"
                width={1787}
                height={521}
                className="h-auto w-28"
              />
            </Link>
            <div className="flex flex-col gap-1.5">
              <Heading level={1} type="display-3">
                {title}
              </Heading>
              <Text type="body" color="secondary">
                {subtitle}
              </Text>
            </div>
          </div>

          {children}

          <div className="vibe-auth-footer">{footer}</div>
        </div>
      </main>
    </div>
  );
}
