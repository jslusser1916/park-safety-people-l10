import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Safety & People | Level 10",
  description: "Park Construction Safety & People EOS Level 10 dashboard.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

