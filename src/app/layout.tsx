import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Fraunces (serif) for big titles only; Inter (plain, crisp sans, not rounded)
// for everything you actually read.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

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
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
