import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./global.css";
import { Providers } from "../components/Providers";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "FALKEN Arena Observer",
  description: "Real-time leaderboard and match tracker for the FALKEN Protocol.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable}`}>
      <body className="antialiased font-mono">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
