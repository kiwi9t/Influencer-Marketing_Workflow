import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay · Creator Pipeline",
  description: "A lightweight workspace for managing a creator collaboration from reply to results.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser translation extensions may annotate the root element before hydration.
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
