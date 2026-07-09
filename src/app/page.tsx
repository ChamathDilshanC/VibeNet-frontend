// VibeNet — landing page (route: "/").
//
// Adapted from the Astryx "side-gallery" template: marketing copy and the two
// primary CTAs (Login / Register) sit on the left, with an image collage on the
// right. Uses @astryxdesign/core components on the "neutral" theme (activated in
// layout.tsx via data-astryx-theme="neutral").
//
// The CTAs are real Astryx <Button>s wired for client-side navigation with
// Next's router, so they are ready to point at the auth routes as those pages
// are built out.

'use client';

import { useRouter } from 'next/navigation';
import {
  VStack,
  HStack,
  Layout,
  LayoutContent,
} from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Grid } from '@astryxdesign/core/Grid';
import { Divider } from '@astryxdesign/core/Divider';

// Image fill is a plain inline style so it renders without any CSS compiler.
const imageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
};

const imageClip = {
  borderRadius: 'var(--radius-element)',
};

// ─── Image Data ─────────────────────────────────────────────────────────────
// Neutral placeholder collage. Swap these for real product/marketing imagery.

const PLACEHOLDER_SRC =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20300%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f5f6f8%22%2F%3E%3Cg%20transform%3D%22translate%28200%20150%29%22%20fill%3D%22none%22%20stroke%3D%22%23c2cad6%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%22-44%22%20y%3D%22-44%22%20width%3D%2288%22%20height%3D%2288%22%20rx%3D%2216%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%22-18%22%20r%3D%222.5%22%20fill%3D%22%23c2cad6%22%20stroke%3D%22none%22%2F%3E%3Cpath%20d%3D%22M-34%2030%20L-8%200%20L10%2018%20L20%208%20L34%2024%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E';

const IMAGES = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  src: PLACEHOLDER_SRC,
  alt: 'VibeNet preview',
}));

// ─── Stat Block ─────────────────────────────────────────────────────────────

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <VStack gap={0}>
      <Text type="large" weight="bold">
        {value}
      </Text>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </VStack>
  );
}

// ─── Image Grid ─────────────────────────────────────────────────────────────

function ImageGrid() {
  return (
    <Grid columns={3} gap={3}>
      {IMAGES.map((img) => (
        <AspectRatio key={img.id} ratio={1} style={imageClip}>
          <img src={img.src} alt={img.alt} style={imageStyle} />
        </AspectRatio>
      ))}
    </Grid>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();

  return (
    <Layout
      height="auto"
      contentWidth={1400}
      content={
        <LayoutContent padding={6}>
          <Grid
            columns={{ minWidth: 360, repeat: 'fit' }}
            gap={8}
            align="center"
          >
            {/* Left side: Brand, description, and auth CTAs */}
            <VStack gap={6} vAlign="center">
              <VStack gap={3}>
                <Text type="supporting" color="secondary" weight="semibold">
                  END-TO-END ENCRYPTED
                </Text>
                <Heading level={1}>VibeNet</Heading>
                <Text type="body" color="secondary">
                  Secure, real-time end-to-end encrypted chat. Your
                  conversations are encrypted on your device and never leave it
                  in the clear — not to the network, not to our servers, not to
                  anyone but the people you talk to.
                </Text>
              </VStack>

              {/* Auth CTAs — ready to point at the auth routes as they ship. */}
              <HStack gap={3} vAlign="center">
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
              </HStack>

              <VStack gap={4}>
                <Divider />
                <HStack gap={6}>
                  <StatBlock value="E2EE" label="By default" />
                  <StatBlock value="Real-time" label="Messaging" />
                  <StatBlock value="Zero-knowledge" label="Servers" />
                </HStack>
              </VStack>
            </VStack>

            {/* Right side: Image collage */}
            <ImageGrid />
          </Grid>
        </LayoutContent>
      }
    />
  );
}
