// VibeNet — landing page (route: "/").
//
// Adapted from the Astryx "side-gallery" template: brand, marketing copy, and the
// two primary CTAs (Login / Register) sit on the left, with an auto-rotating
// contact carousel on the right. Layout and spacing are handled with Tailwind
// utilities; the design system provides the typography (<Text>), CTAs (<Button>),
// and <Divider>.
//
// The hero renders on its own fixed dark "Orchid Depths" gradient — scoped to
// this page only via <MediaTheme mode="dark">, which flips the design system's
// text/icon tokens to their on-dark values without touching the app's global
// light/dark theme. Two local fonts are loaded here (Brace for headings, Poppins
// for body copy); next/font scopes them to whatever component loads them, so
// they never leak onto the dashboard, auth pages, or anywhere else.
//
// The main content is width-constrained and horizontally centered (mx-auto +
// max-w-7xl), pushed down from the top edge with generous top padding, and it
// collapses to a single stacked column on small screens.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import localFont from 'next/font/local';
import { Poppins } from 'next/font/google';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  ShieldCheckIcon,
  BoltIcon,
  UserGroupIcon,
  PaperClipIcon,
  KeyIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { MediaTheme } from '@astryxdesign/core/theme';
import { getToken } from '@/lib/session';
import { ContactCarousel } from '@/components/ContactCarousel';

// ─── Landing-only fonts ─────────────────────────────────────────────────────
// Scoped to this page via next/font — the generated CSS variables only exist
// on the wrapper below (see the `.vibe-landing` rule in globals.css), so no
// other route is affected.

const brace = localFont({
  src: './fonts/brace.otf',
  weight: '400',
  style: 'normal',
  variable: '--font-brace',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

// ─── Motion variants ────────────────────────────────────────────────────────

const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Features ───────────────────────────────────────────────────────────────
// Mirrors the capability table in README.md ("What's Live in Production") —
// keep this in sync if that table changes.

const FEATURES = [
  {
    icon: ShieldCheckIcon,
    title: 'End-to-end encryption',
    description:
      'Every account gets its own ECDH keypair. Group messages are wrapped in AES-256-GCM individually, per member.',
  },
  {
    icon: BoltIcon,
    title: 'Real-time delivery',
    description:
      'Messages land over WebSocket the instant you send, with typing indicators and delivery/read receipts to match.',
  },
  {
    icon: UserGroupIcon,
    title: 'Group chats, done right',
    description:
      'Owner and admin roles, invites, and ownership handoff — built for teams, not just pairs.',
  },
  {
    icon: PaperClipIcon,
    title: 'Rich, encrypted content',
    description:
      'Attachments, polls, calendar events, and shared contacts — all encrypted client-side before upload.',
  },
  {
    icon: KeyIcon,
    title: 'Secure sign-in',
    description:
      'Email/password or Google OAuth, plus a rotating PIN that keeps a stranger’s first message in check.',
  },
  {
    icon: SignalIcon,
    title: 'Always-on presence',
    description:
      'Online status, last-seen, and automatic reconnect, so you always know who’s around.',
  },
] as const;

function FeatureCard({ feature }: { feature: (typeof FEATURES)[number] }) {
  const Icon = feature.icon;
  return (
    <motion.div variants={fadeUp} className="vibe-feature-card">
      <div className="vibe-feature-icon">
        <Icon className="h-5 w-5" />
      </div>
      <Text type="large" weight="bold" as="div">
        {feature.title}
      </Text>
      <Text type="body" color="secondary">
        {feature.description}
      </Text>
    </motion.div>
  );
}

// ─── Stat Block ─────────────────────────────────────────────────────────────

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <motion.div variants={fadeUp} className="flex flex-col">
      <Text type="large" weight="bold" className="vibe-gradient-text">
        {value}
      </Text>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </motion.div>
  );
}

// ─── Ambient glow ───────────────────────────────────────────────────────────
// Two soft, slowly-drifting brand-colour blobs over the Orchid Depths gradient
// for depth. Skipped entirely for prefers-reduced-motion.

function AmbientGlow() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(125% 125% at 50% 10%, #000000 40%, #350136 100%)',
        }}
      />
      <motion.div
        className="absolute -left-24 top-1/4 h-[420px] w-[420px] rounded-full blur-[110px]"
        style={{ background: 'var(--vibe-blue)', opacity: 0.18 }}
        animate={
          prefersReducedMotion
            ? undefined
            : { x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.08, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-24 bottom-0 h-[380px] w-[380px] rounded-full blur-[110px]"
        style={{ background: 'var(--vibe-green)', opacity: 0.14 }}
        animate={
          prefersReducedMotion
            ? undefined
            : { x: [0, -30, 0], y: [0, -24, 0], scale: [1, 1.1, 1] }
        }
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();

  // A signed-in visitor (existing token in localStorage — persists across tabs
  // and reloads) landing on "/" fresh, e.g. a new tab, should go straight to
  // their chats rather than see the logged-out marketing page.
  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  return (
    <div
      className={`${brace.variable} ${poppins.variable} vibe-landing relative w-full flex-1 overflow-hidden`}
      style={{ fontFamily: 'var(--font-family-body)' }}
    >
      <AmbientGlow />

      <MediaTheme mode="dark">
        <main className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-24 pb-16 md:pt-32 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left: brand, headline, description, and auth CTAs */}
            <motion.div
              className="flex flex-col gap-6"
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              {/* Brand wordmark. */}
              <motion.div variants={fadeUp} className="vibe-logo">
                <img
                  src="/logo/vibenet-logo.png"
                  alt="VibeNet"
                  width={1787}
                  height={521}
                  className="h-auto w-24 sm:w-28 md:w-32"
                />
              </motion.div>

              <motion.div variants={fadeUp} className="vibe-eyebrow-badge">
                <span className="vibe-eyebrow-dot" />
                <Text type="supporting" weight="semibold" className="vibe-eyebrow">
                  END-TO-END ENCRYPTED
                </Text>
              </motion.div>

              <motion.div variants={fadeUp}>
                <Text
                  type="display-1"
                  as="h1"
                  className="vibe-landing-headline text-4xl leading-[1.1] sm:text-5xl lg:text-6xl"
                >
                  Chat freely.
                  <br />
                  Stay <span className="vibe-gradient-text">private</span>.
                </Text>
              </motion.div>

              <motion.div variants={fadeUp} className="flex flex-col gap-3">
                <Text type="body" color="secondary">
                  Secure, real-time end-to-end encrypted chat. Your conversations are
                  encrypted on your device and never leave it in the clear — not to
                  the network, not to our servers, not to anyone but the people you
                  talk to.
                </Text>
              </motion.div>

              {/* Auth CTAs — ready to point at the auth routes as they ship. */}
              <motion.div variants={fadeUp} className="vibe-cta flex flex-wrap items-center gap-3">
                <Button
                  label="Register"
                  variant="primary"
                  size="lg"
                  onClick={() => router.push('/register')}
                />
                <Button
                  label="Login"
                  variant="secondary"
                  size="lg"
                  onClick={() => router.push('/login')}
                />
              </motion.div>

              <motion.div variants={fadeUp} className="flex flex-col gap-4">
                <Divider />
                <motion.div
                  className="flex flex-wrap gap-6"
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                >
                  <StatBlock value="E2EE" label="By default" />
                  <StatBlock value="Real-time" label="Messaging" />
                  <StatBlock value="Zero-knowledge" label="Servers" />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Right: auto-rotating contact carousel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="flex items-center justify-center"
            >
              <ContactCarousel />
            </motion.div>
          </div>
        </main>

        {/* Features — what the app actually does, for visitors who scroll past the hero. */}
        <section id="features" className="relative z-10 mx-auto w-full max-w-6xl px-6 py-20 lg:px-8">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <Text type="supporting" weight="semibold" display="block" className="vibe-eyebrow">
              WHAT&rsquo;S INSIDE
            </Text>
            <Text
              type="display-2"
              as="h2"
              display="block"
              className="vibe-landing-headline mt-3 text-3xl leading-[1.15] sm:text-4xl"
            >
              Everything a private chat needs.
            </Text>
          </motion.div>

          <motion.div
            className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </motion.div>
        </section>
      </MediaTheme>
    </div>
  );
}
