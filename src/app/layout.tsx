import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Mallen gör att undersidor slipper upprepa varumärket, och att en flik i
  // webbläsaren går att skilja från en annan.
  title: {
    default: "Kundnytt — bevaka dina kundbolag i svensk nyhetsmedia",
    template: "%s — Kundnytt",
  },
  description:
    "Få ett mejl varje morgon när bolagen du följer dyker upp i svensk lokal- och branschpress. Förvärv, konkurser, expansioner och nyrekryteringar.",
  // Öppen graf för när någon delar länken i Slack eller LinkedIn. Utan den
  // visas bara en naken URL.
  openGraph: {
    title: "Kundnytt",
    description:
      "Bevaka dina kundbolag i svensk lokal- och branschpress. Ett mejl om morgonen.",
    locale: "sv_SE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
