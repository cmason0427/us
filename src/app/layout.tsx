import type { Metadata, Viewport } from "next";
import { Fraunces, Fredoka } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The one typeface: Fraunces, variable, with the soft axis (set in globals.css).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

// Round and chunky like fridge-magnet letters; only for magnet titles.
const fredoka = Fredoka({ variable: "--font-magnet", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://us-little-corner.netlify.app"),
  title: "Us",
  description: "Our little corner.",
  appleWebApp: { capable: true, title: "Us", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  // The fridge photo, untouched, for link previews.
  openGraph: { title: "Us", description: "Our little corner.", images: [{ url: "/preview.jpg", width: 1091, height: 1111 }] },
};

export const viewport: Viewport = {
  themeColor: "#fcf0e9", // the boot script swaps it for the Sage theme
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-theme before paint, so React shouldn't fight it.
    <html lang="en" className={`${fraunces.variable} ${fredoka.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
