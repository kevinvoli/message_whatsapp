import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthProvider";
import { SocketProvider } from "@/contexts/SocketProvider";
import WebSocketEvents from "@/components/WebSocketEvents";
import { PwaRegister } from "@/components/PwaRegister";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryProvider } from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRM Agent — Messagerie",
  description: "Plateforme de messagerie multi-canal",
  manifest: '/manifest.json',
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
          <QueryProvider>
            <AuthProvider>
              <SocketProvider>
                <PwaRegister />
                <WebSocketEvents />
                {children}
              </SocketProvider>
            </AuthProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
