import { BriefProvider } from "./context";

export default function BriefNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BriefProvider>{children}</BriefProvider>;
}
