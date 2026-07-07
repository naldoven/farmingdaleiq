import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { findNavItem } from "@/lib/nav/page-map";

export default function Page() {
  return <PlaceholderPage item={findNavItem("/catering")!} />;
}
