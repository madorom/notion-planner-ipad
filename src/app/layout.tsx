import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notion手帳",
  description: "iPad Safariで使いやすいNotion連携カレンダー手帳",
  applicationName: "Notion手帳",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Notion手帳",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("notion-planner-ipad:theme:v1");document.documentElement.dataset.theme=t==="dark"?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
