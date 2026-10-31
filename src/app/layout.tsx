import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Shell } from "@/components/Shell";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display-face", subsets: ["latin"], weight: ["500", "700"] });

const description =
  "Job search for sales and GTM people. JobPipe finds and scores jobs against your CV, tailors your CV for each role and drafts warm referral notes.";

// What Google shows in search results and what LinkedIn, WhatsApp and X show when the link is shared.
export const metadata: Metadata = {
  metadataBase: new URL("https://jobpipe.in"),
  title: { default: "JobPipe: job search for sales and GTM roles", template: "%s · JobPipe" },
  description,
  applicationName: "JobPipe",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "JobPipe", url: "/", title: "JobPipe: job search for sales and GTM roles", description, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "JobPipe: job search for sales and GTM roles", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} antialiased`}>
      <body className="min-h-screen">
        <ConvexClientProvider>
          <Shell>{children}</Shell>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
