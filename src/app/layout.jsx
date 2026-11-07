import "./globals.css";

export const metadata = {
  title: "Kinetix — your AI chief of staff",
  description:
    "Kinetix connects to Gmail, Slack, Google Calendar, Notion, Jira and Linear, filters the noise, and keeps a self-managing, prioritized plan. Prep for meetings, draft follow-ups, track project risks.",
};

export const viewport = {
  themeColor: "#0b1020",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
