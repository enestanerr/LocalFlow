import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'LocalFlow — Your images. Your workflow. Your device.',
  icons: { icon: '/favicon.svg' },
  description:
    'Batch resize, crop, rotate, convert, and rename images directly in your browser. Reusable recipes. No uploads, accounts, or API keys.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
