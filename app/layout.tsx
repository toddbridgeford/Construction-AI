import type { Metadata } from 'next';
import './globals.css';
import { PerplexityShell } from '@/components/PerplexityShell';

export const metadata: Metadata = {
  title: 'Construction AI Dashboard',
  description: 'Perplexity-style construction market dashboard.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PerplexityShell>{children}</PerplexityShell>
      </body>
    </html>
  );
}
