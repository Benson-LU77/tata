import type { Metadata, Viewport } from "next";
import "./globals.css";

/* maximumScale 1 stops iOS from zooming into focused inputs and then
   stranding the page zoomed — the city has its own zoom, the page none */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Tata — signal becomes structure",
  description: "A city built from your notes. Every page you write becomes a structure; the archive grows into a skyline.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
