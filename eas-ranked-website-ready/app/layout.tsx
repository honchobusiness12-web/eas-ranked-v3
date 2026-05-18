import "./globals.css";
import ToastProvider from "@/components/ToastProvider";

export const metadata = {
  title: "EAS Arena Ranked",
  description: "Elevate All-Stars TimeBomb Duels Ranked Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
