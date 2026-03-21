import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SputnikX \u2014 \u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433 \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432',
  description: '\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u0441\u043F\u0443\u0442\u043D\u0438\u043A\u043E\u0432 \u0432 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u043C \u0432\u0440\u0435\u043C\u0435\u043D\u0438',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-cosmos-bg text-[#e5e7eb] antialiased">
        {children}
      </body>
    </html>
  );
}
