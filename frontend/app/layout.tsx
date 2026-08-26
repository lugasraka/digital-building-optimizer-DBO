import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DBO Prototype",
  description:
    "Decarbonization Business Optimizer prototype: baseline, optimize, and score facility decarbonization plans.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
