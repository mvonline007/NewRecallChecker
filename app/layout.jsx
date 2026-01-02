import "./globals.css";

export const VERSION = "1.0.42";

export const metadata = {
  title: "Rappel Conso RSS Viewer",
  description: "Rappel Conso RSS viewer with distributor filtering and embedded fiche view."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
