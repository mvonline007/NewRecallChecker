import "./globals.css";

export const metadata = {
  title: "RappelConso RSS Viewer",
  description: "RappelConso RSS viewer with distributor filtering and embedded fiche view."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
