// Landing-page hero visual: a self-rotating strip of contact avatars with a
// large preview + name, adapted from the Originkit "button carousel" block.
//
// Auto-advances on an interval so the hero feels alive without input, pauses
// while the pointer is over it (so a visitor picking a contact isn't fighting
// the timer), and never animates for prefers-reduced-motion.

'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

interface CarouselItem {
  image: string;
  label: string;
}
interface FontValue {
  fontFamily?: string;
  fontWeight?: number | string;
  fontSize?: number | string;
  letterSpacing?: number | string;
  lineHeight?: number | string;
}

interface ContactCarouselProps {
  items?: CarouselItem[];
  cardRadius?: number;
  imageWidth?: number;
  imageHeight?: number;
  buttonCount?: number;
  buttonSize?: number;
  buttonRadius?: number;
  curve?: number;
  gap?: number;
  labelColor?: string;
  labelFont?: FontValue;
  backgroundColor?: string;
  /** Auto-advance to the next contact on an interval. @default true */
  autoPlay?: boolean;
  /** Milliseconds between auto-advances. @default 3200 */
  autoPlayIntervalMs?: number;
  style?: CSSProperties;
}

const mkItem = ([image, label]: [string, string]): CarouselItem => ({ image, label });

// Hotlinked directly from Pinterest's CDN (not mirrored into /public) — keeps
// the repo free of binary assets we don't own, at the cost of depending on a
// third party's uptime.
const DEFAULT_ITEMS: CarouselItem[] = (
  [
    ['https://i.pinimg.com/1200x/e8/1e/46/e81e46fc7b4931b6c7731f9126de1a21.jpg', 'Aisha Khan'],
    ['https://i.pinimg.com/736x/05/89/e8/0589e8574bf65574944616b01696467a.jpg', 'Priya Sharma'],
    ['https://i.pinimg.com/736x/10/82/68/1082687d909be23eb2a87c28273a992b.jpg', 'Daniel Reyes'],
    ['https://i.pinimg.com/736x/11/4b/f7/114bf77447d30b02824cbdb10143e1bc.jpg', 'Mateo Lopez'],
    ['https://i.pinimg.com/736x/9a/57/64/9a57648dc0389e374cd458fcf795fe5a.jpg', 'Sofia Moreau'],
    ['https://i.pinimg.com/736x/8c/d7/7f/8cd77fe28f6373b39b44f461d2d35947.jpg', 'Yuki Tanaka'],
    ['https://i.pinimg.com/736x/0a/1a/62/0a1a62b2590f92b1d6d1e790b5d7b86c.jpg', 'Elena Volkov'],
    ['https://i.pinimg.com/736x/e0/41/2f/e0412fe96acd6a2306f2e0d9b4aa97ea.jpg', 'Kaito Kuroki'],
    ['https://i.pinimg.com/736x/c5/f5/fd/c5f5fd865ec5adfbbb619530ec61d538.jpg', 'Gita Patel'],
  ] as [string, string][]
).map(mkItem);

function modIdx(i: number, n: number) {
  return ((i % n) + n) % n;
}

function easeCubicInOut(p: number) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export function ContactCarousel(props: ContactCarouselProps) {
  const {
    items = DEFAULT_ITEMS,
    cardRadius = 2.9,
    imageWidth = 260,
    imageHeight = 260,
    buttonCount = 7,
    buttonSize = 46,
    buttonRadius = 20,
    curve = 5,
    gap = 16,
    labelColor = '#ffffff',
    labelFont = {
      fontFamily: 'var(--font-family-heading)',
      fontWeight: 600,
      fontSize: 22,
      lineHeight: '1.3em',
      letterSpacing: '0em',
    },
    backgroundColor = 'transparent',
    autoPlay = true,
    autoPlayIntervalMs = 3200,
    style,
  } = props;

  const list = items?.length ? items : DEFAULT_ITEMS;
  const M = list.length;

  const posRef = useRef(0);
  const [posDisplay, setPosDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const animRef = useRef({ startPos: 0, targetPos: 0, startTime: 0 });
  const [dir, setDir] = useState(1);
  const [isHovering, setIsHovering] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const active = modIdx(Math.round(posDisplay), M);

  const half = Math.floor(Math.min(Math.max(1, buttonCount), M) / 2);
  const buffer = half + 1;

  const cardRadiusPx =
    (Math.max(0, Math.min(20, cardRadius)) / 20) * (Math.min(imageWidth, imageHeight) / 2);
  const buttonRadiusPx = (Math.max(0, Math.min(20, buttonRadius)) / 20) * (buttonSize / 2);
  const t = Math.max(0.0001, Math.min(10, curve) / 10);
  const step = buttonSize + gap;
  const dPsi = ((Math.PI * 2) / M) * t;
  const R = step / (2 * Math.sin(dPsi / 2));
  const baseTop = buttonSize * 0.9;
  const fadeInner = Math.max(0, half - 0.4);
  const fadeEnd = half + 0.6;
  const maxPsi = Math.min(Math.PI, fadeEnd * dPsi);
  const stripHeight = baseTop + R * (1 - Math.cos(maxPsi)) + buttonSize / 2 + 16;

  const select = useCallback(
    (itemIdx: number) => {
      const currentActive = modIdx(Math.round(posRef.current), M);
      if (itemIdx === currentActive) return;

      let delta = itemIdx - Math.round(posRef.current);
      delta = ((delta % M) + M) % M;
      if (delta > M / 2) delta -= M;
      setDir(Math.sign(delta));

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      if (prefersReducedMotion) {
        posRef.current += delta;
        setPosDisplay(posRef.current);
        return;
      }

      animRef.current = {
        startPos: posRef.current,
        targetPos: posRef.current + delta,
        startTime: performance.now(),
      };

      const DURATION = 320;
      function tick(now: number) {
        const { startPos, targetPos, startTime } = animRef.current;
        const progress = Math.min(1, (now - startTime) / DURATION);
        posRef.current = startPos + (targetPos - startPos) * easeCubicInOut(progress);
        setPosDisplay(posRef.current);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          posRef.current = targetPos;
          setPosDisplay(targetPos);
          rafRef.current = null;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [M, prefersReducedMotion],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Auto-advance through contacts. Paused on hover/focus and skipped entirely
  // for prefers-reduced-motion — a hero that never stops moving is exactly
  // what that setting asks us not to do.
  useEffect(() => {
    if (!autoPlay || isHovering || prefersReducedMotion || M <= 1) return;
    const id = window.setInterval(() => {
      select(modIdx(Math.round(posRef.current) + 1, M));
    }, autoPlayIntervalMs);
    return () => window.clearInterval(id);
  }, [autoPlay, isHovering, prefersReducedMotion, autoPlayIntervalMs, select, M]);

  const center = Math.round(posDisplay);
  const renderItems: number[] = [];
  const seen = new Set<number>();
  for (let s = -buffer; s <= buffer; s++) {
    const idx = modIdx(center + s, M);
    if (!seen.has(idx)) {
      seen.add(idx);
      renderItems.push(idx);
    }
  }

  function getVisualSlot(itemIdx: number): number {
    let slot = itemIdx - posDisplay;
    slot = slot % M;
    if (slot > M / 2) slot -= M;
    if (slot < -M / 2) slot += M;
    return slot;
  }

  function slotStyle(slot: number) {
    const angle = slot * dPsi;
    const x = R * Math.sin(angle);
    const y = R * (1 - Math.cos(angle));
    const deg = (angle * 180) / Math.PI;
    const absSlot = Math.abs(slot);
    const depth = Math.max(0, 1 - (0.55 * absSlot) / Math.max(1, half));
    const scale = 0.55 + 0.45 * depth;
    const opacity =
      absSlot <= fadeInner
        ? 1
        : absSlot >= fadeEnd
          ? 0
          : 1 - (absSlot - fadeInner) / (fadeEnd - fadeInner);
    const zIndex = Math.round(depth * 100) + (absSlot < 0.5 ? 100 : 0);
    return { x, y, deg, scale, opacity, zIndex };
  }

  const imgSweep = 220,
    imgDip = 130;
  const imageVariants = {
    enter: (d: number) => ({
      x: d * imgSweep,
      y: imgDip,
      opacity: 0,
      scale: 0.82,
      rotate: d * 8,
    }),
    center: { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 },
    exit: (d: number) => ({
      x: -d * imgSweep,
      y: imgDip,
      opacity: 0,
      scale: 0.82,
      rotate: -d * 8,
    }),
  };

  return (
    <div
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocus={() => setIsHovering(true)}
      onBlur={() => setIsHovering(false)}
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        boxSizing: 'border-box',
        background: backgroundColor,
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: imageWidth,
          height: imageHeight,
          maxWidth: '100%',
          flex: '0 0 auto',
          borderRadius: cardRadiusPx,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.04)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={active}
            custom={dir}
            variants={prefersReducedMotion ? undefined : imageVariants}
            initial={prefersReducedMotion ? false : 'enter'}
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <img
              src={list[active]?.image}
              alt={list[active]?.label ?? ''}
              draggable={false}
              loading="eager"
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                // Portrait/full-body source photos need the crop biased toward
                // the top so faces survive the square crop, not just torsos.
                objectPosition: '50% 15%',
                display: 'block',
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`label-${active}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            flex: '0 0 auto',
            maxWidth: '100%',
            textAlign: 'center',
            color: labelColor,
            fontFamily: labelFont?.fontFamily,
            fontWeight: labelFont?.fontWeight as number | undefined,
            fontSize: labelFont?.fontSize,
            letterSpacing: labelFont?.letterSpacing,
            lineHeight: labelFont?.lineHeight,
          }}
        >
          {list[active]?.label ?? ''}
        </motion.div>
      </AnimatePresence>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: stripHeight,
          overflow: 'hidden',
          flex: '0 0 auto',
        }}
      >
        {renderItems.map((itemIdx) => {
          const slot = getVisualSlot(itemIdx);
          const { x, y, deg, scale, opacity, zIndex } = slotStyle(slot);
          const isActive = itemIdx === active;
          const item = list[itemIdx];

          return (
            <div
              key={itemIdx}
              style={{
                position: 'absolute',
                left: '50%',
                top: baseTop,
                marginLeft: -buttonSize / 2,
                marginTop: -buttonSize / 2,
                width: buttonSize,
                height: buttonSize,
                transform: `translate(${x}px, ${y}px) rotate(${deg}deg) scale(${scale})`,
                transformOrigin: 'center',
                opacity,
                zIndex,
                willChange: 'transform, opacity',
              }}
            >
              <button
                type="button"
                aria-label={item?.label}
                onClick={() => select(itemIdx)}
                style={{
                  width: '100%',
                  height: '100%',
                  padding: 0,
                  border: isActive ? '2px solid #ffffff' : '2px solid transparent',
                  borderRadius: buttonRadiusPx,
                  overflow: 'hidden',
                  position: 'relative',
                  transform: `rotate(${-deg}deg)`,
                  transformOrigin: 'center',
                  background: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  backdropFilter: isActive ? undefined : 'blur(6px)',
                  WebkitBackdropFilter: isActive ? undefined : 'blur(6px)',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {item?.image && (
                  <img
                    src={item.image}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: '50% 15%',
                      display: 'block',
                    }}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
