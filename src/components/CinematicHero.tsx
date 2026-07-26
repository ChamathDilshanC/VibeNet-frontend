// VibeNet — cinematic video hero, rendered above the marketing landing page ("/").
//
// A full-viewport intro section (video background + parallax + headline) that
// sits before the existing Astryx hero/features content in app/page.tsx. Only
// the top nav is `fixed` so it stays pinned as the visitor scrolls past this
// section into the rest of the landing page; the video/headline/CTA live
// inside a normal-flow `h-screen` section so they scroll away naturally
// instead of staying pinned over the content underneath.
//
// Fonts (Barlow body / Inter headings) are loaded here via next/font/google
// and scoped to this component only, the same pattern app/page.tsx already
// uses for its own Brace/Poppins pair — they don't leak onto the rest of the
// page.

'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Barlow, Inter } from 'next/font/google';
import gsap from 'gsap';
import { Lock } from 'lucide-react';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260510_060007_60275ce7-030c-4668-a160-8f364ec537d3.mp4';

// A single-page product site: FEATURES/SECURITY/GROUPS all scroll to the one
// features section below (#features, defined in app/page.tsx) since there's
// no dedicated subpage for each yet; LOGIN goes to the real route.
const NAV_LINKS = [
  { label: 'FEATURES', href: '#features' },
  { label: 'SECURITY', href: '#features' },
  { label: 'GROUPS', href: '#features' },
  { label: 'LOGIN', href: '/login' },
];

export function CinematicHero() {
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = parallaxRef.current;
    if (!target) return;

    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let rafId = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      targetX = ((event.clientX - cx) / cx) * 20;
      targetY = ((event.clientY - cy) / cy) * 20;
    };

    const animate = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      gsap.set(target, { x: currentX, y: currentY });
      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={`${barlow.variable} ${inter.variable}`} style={{ fontFamily: 'var(--font-barlow), sans-serif' }}>
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-10 py-8">
        <span className="text-[17px] font-semibold tracking-tight text-white">
          VibeNet<sup>TM</sup>
        </span>

        <nav className="liquid-glass hidden items-center gap-1 rounded-full px-2 py-2 md:flex">
          {NAV_LINKS.map((link) =>
            link.href.startsWith('#') ? (
              <a
                key={link.label}
                href={link.href}
                className="rounded-full px-4 py-1.5 text-[11px] font-medium tracking-[0.12em] text-white/90 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-full px-4 py-1.5 text-[11px] font-medium tracking-[0.12em] text-white/90 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <Link
          href="/register"
          className="liquid-glass rounded-full px-5 py-2.5 text-[11px] font-medium tracking-[0.12em] text-white/90 hover:text-white"
        >
          GET STARTED
        </Link>
      </header>

      <section className="relative h-screen w-full overflow-hidden bg-black">
        {/* Static scale, kept on its own layer — GSAP drives x/y on the inner
            layer below, so it never clobbers this transform. */}
        <div className="absolute inset-0 z-0 origin-center scale-[1.08]">
          <div ref={parallaxRef} className="h-full w-full">
            <video
              className="h-full w-full object-cover"
              src={VIDEO_SRC}
              autoPlay
              muted
              loop
              playsInline
              onLoadedMetadata={(event) => {
                event.currentTarget.playbackRate = 1.25;
              }}
            />
          </div>
        </div>

        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/75 via-black/10 to-black/50" />

        <div
          className="vibe-hero-in absolute left-1/2 z-20 w-full -translate-x-1/2 px-6 text-center"
          style={{ top: '120px' }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontWeight: 400,
              fontSize: 'clamp(40px, 5.4vw, 72px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            <span className="block text-white">Say anything. Stay unseen.</span>
            <span className="block" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Encrypted end-to-end, always yours.
            </span>
          </h1>
        </div>

        <div className="vibe-hero-in--delayed absolute bottom-14 left-1/2 z-20 flex w-full -translate-x-1/2 flex-col items-center gap-6 px-6">
          <p className="max-w-[620px] text-center text-[15px] leading-relaxed">
            <span className="text-white">
              VibeNet wraps every message in end-to-end encryption the instant you hit send —
              no exceptions, no back doors.
            </span>
            <span className="text-white/55">
              {' '}
              Real-time delivery, zero-knowledge servers, and total control stay entirely yours.
            </span>
          </p>

          <Link
            href="/register"
            className="rounded-full bg-white px-8 py-3.5 text-[15px] font-medium text-black transition-transform duration-200 hover:scale-[1.03] hover:shadow-[0_0_32px_4px_rgba(255,255,255,0.2)] active:scale-[0.97]"
          >
            Start chatting securely
          </Link>

          <div className="flex items-center gap-2">
            <Lock size={13} strokeWidth={1.5} className="text-white/70" />
            <span className="text-[11px] font-medium tracking-[0.14em] text-white/70">
              SECURE BY DESIGN. ZERO DATA LEAKS.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
