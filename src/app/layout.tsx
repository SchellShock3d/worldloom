import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/alegreya";
import "@fontsource-variable/alegreya/wght-italic.css";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/overlays";

export const metadata: Metadata = {
  title: { default: "Worldloom", template: "%s · Worldloom" },
  description: "A living-world operating system for Dungeon Masters.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#13161e" },
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
  ],
};

const SYSTEM_THEME_SCRIPT = `try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("wl_theme")?.value ?? "dark";
  return (
    <html lang="en" className={theme === "light" ? "" : "dark"} suppressHydrationWarning>
      <head>{theme === "system" && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body>
        <TooltipProvider delayDuration={350}>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
