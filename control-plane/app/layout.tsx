import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SMS Platform Control Plane',
  description: 'Tenant dashboard, operations console, and admin portal for the SMS platform backend.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
