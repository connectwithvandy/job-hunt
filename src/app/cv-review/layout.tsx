import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free CV review for sales and GTM jobs",
  description:
    "Upload your CV and get a free review from the eyes of a sales hiring manager: a score out of 100, what already works, and 5 fixes for SDR, AE and sales leadership roles.",
  alternates: { canonical: "/cv-review" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
