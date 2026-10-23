import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Shell } from "@/components/Shell";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display-face", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "Pipeline",
  description: "Run your job hunt like a pipeline: several searches at once, a tailored CV and warm intros for every role.",
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
