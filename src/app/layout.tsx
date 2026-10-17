import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "The Fable Club CMS", template: "%s · Fable CMS" },
  description: "Admin for The Fable Club's website.",
  // Private tool: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
