// App-wide toast layer, mounted once in the root layout.
//
// Wraps goey-toast's <GooeyToaster/> in a client boundary and sets the
// VibeNet-wide defaults (position, light theme, brand-friendly animation).
// Fire toasts from anywhere with `gooeyToast(...)` / `gooeyToast.success(...)`.

'use client';

import { GooeyToaster } from 'goey-toast';

export function Toaster() {
  return (
    <GooeyToaster
      position="top-right"
      theme="light"
      richColors
      closeButton
      expand
      preset="smooth"
    />
  );
}
