import "./globals.css";

export const VERSION = "1.0.72";

export const metadata = {
  title: "Rappel Conso",
  description: "Rappel Conso viewer with distributor filtering and embedded fiche view."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
