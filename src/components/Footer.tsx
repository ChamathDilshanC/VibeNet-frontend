// Global site footer for VibeNet.
//
// Rendered once from the root layout so it appears on every page. Shows the
// author credit (linked to GitHub) and a copyright line with the current year.

'use client';

import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';

export function Footer() {
  const year = new Date().getFullYear();

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
