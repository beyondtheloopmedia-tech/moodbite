import type { Metadata } from "next";
import { DAY_PART_BOUNDARIES } from "@/lib/daypart";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moodbite",
  description: "Six questions, then something to eat.",
};

/**
 * Set the day part before first paint, so a late-night visit does not flash a
 * daylight page first. Generated from DAY_PART_BOUNDARIES rather than written
 * out, so the hours cannot drift away from dayPartForHour.
 */
const dayPartScript = `(function(){try{var b=${JSON.stringify(
  DAY_PART_BOUNDARIES,
)},h=new Date().getHours(),p=b[0][1];for(var i=0;i<b.length;i++){if(h>=b[i][0])p=b[i][1]}document.documentElement.dataset.daypart=p}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // dayPartScript stamps data-daypart before React hydrates, which is a
    // mismatch by definition; suppressHydrationWarning covers this element's
    // attributes only, not its subtree
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: dayPartScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
