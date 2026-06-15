import './globals.css';

import type { ReactNode } from 'react';

// The root layout is a bare fragment — NO `<html>`/`<body>`. Each top-level
// segment renders its own document shell so exactly one `<html>` is emitted per
// route: `[locale]/layout.tsx` owns the localized app + marketing document, and
// `inspector/layout.tsx` owns the locale-agnostic inspector document. Rendering
// `<html>` here too would nest documents and break hydration.
const RootLayout = ({ children }: { children: ReactNode }) => children;

export default RootLayout;
