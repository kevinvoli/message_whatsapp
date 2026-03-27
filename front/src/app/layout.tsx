import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthProvider";
import { SocketProvider } from "@/contexts/SocketProvider";
import WebSocketEvents from "@/components/WebSocketEvents";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ReconnectingBanner from "@/components/ReconnectingBanner";
import { ToastContainer } from "@/components/ui/ToastContainer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Espace commercial — WhatsApp CRM",
  description: "Plateforme de gestion des conversations WhatsApp pour les équipes commerciales",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ErrorBoundary>
          <AuthProvider>
            <SocketProvider>
              <ReconnectingBanner />
              <WebSocketEvents />
              <ToastContainer />
              {children}
            </SocketProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
