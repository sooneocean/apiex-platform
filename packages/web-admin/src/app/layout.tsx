import "./globals.css";

export const metadata = {
  title: "Apiex Admin",
  description: "Apiex Platform Administration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
