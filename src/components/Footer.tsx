// Global site footer for VibeNet.
//
// Rendered once from the root layout. Shows on the marketing and auth pages, but
// hides on the full-height app shell (/dashboard): there a marketing footer is out of
// place and pushes the layout past the viewport, adding a scrollbar to what should be
// a fixed, single-screen chat UI.
//
// Settings used to have a route of its own and needed listing here too; it now renders
// inside the dashboard shell, so /dashboard covers it.
//
// The landing route ("/") gets a richer footer (brand blurb + Product/Company link
// columns) matching the rest of that page's dark hero styling — everywhere else
// (login, register, auth callbacks) keeps the plain one-line footer unchanged.

'use client';

import { usePathname } from 'next/navigation';
import { Poppins } from 'next/font/google';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { MediaTheme } from '@astryxdesign/core/theme';

// Route prefixes rendered inside the full-height app shell, where the footer is
// suppressed. Everything else (landing, /login, /register, /auth/*) keeps it.
const APP_ROUTES = ['/dashboard'];

// Matches the body font loaded on the landing page itself (see app/page.tsx) —
// only applied to the `vibe-footer-landing` element below, so /login and
// /register keep the app's default Figtree.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-poppins',
  display: 'swap',
});

export function Footer() {
  const pathname = usePathname();
  const isAppRoute = APP_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  if (isAppRoute) return null;

  const year = new Date().getFullYear();

  if (pathname === '/') {
    return <LandingFooter year={year} />;
  }

  return (
    <footer className="vibe-footer">
      <div className="vibe-footer__inner">
        <Text type="supporting" color="secondary">
          Developed by{' '}
          <Link href="https://github.com/ChamathDilshanC" isExternalLink>
            Chamath Dilshan
          </Link>
        </Text>
        <Text type="supporting" color="secondary">
          © {year} VibeNet. All rights reserved.
        </Text>
      </div>
    </footer>
  );
}

function LandingFooter({ year }: { year: number }) {
  return (
    <MediaTheme mode="dark">
      <footer className={`${poppins.variable} vibe-footer-landing`}>
        <div className="vibe-footer-landing__inner">
          <div className="vibe-footer-landing__brand">
            <img
              src="/logo/vibenet-logo.png"
              alt="VibeNet"
              width={1787}
              height={521}
              className="h-auto w-24 sm:w-28 md:w-32"
            />
            <Text type="supporting" color="secondary" className="max-w-xs">
              Secure, real-time end-to-end encrypted chat — built for conversations
              that stay private.
            </Text>
          </div>

          <div className="vibe-footer-landing__columns">
            <div className="flex flex-col gap-3">
              <Text type="label" weight="semibold">
                Product
              </Text>
              <Link href="#features">Features</Link>
              <Link href="/register">Get started</Link>
              <Link href="/login">Login</Link>
            </div>
            <div className="flex flex-col gap-3">
              <Text type="label" weight="semibold">
                Company
              </Text>
              <Link href="https://github.com/ChamathDilshanC" isExternalLink>
                Creator
              </Link>
              <Link href="https://github.com/ChamathDilshanC/VibeNet-Main" isExternalLink>
                Source
              </Link>
            </div>
          </div>
        </div>

        <div className="vibe-footer-landing__bottom">
          <Text type="supporting" color="secondary">
            © {year} VibeNet. All rights reserved.
          </Text>
          <Text type="supporting" color="secondary">
            Built with <span aria-hidden="true">♥</span> by{' '}
            <Link href="https://github.com/ChamathDilshanC" isExternalLink>
              Chamath Dilshan
            </Link>
          </Text>
        </div>
      </footer>
    </MediaTheme>
  );
}
