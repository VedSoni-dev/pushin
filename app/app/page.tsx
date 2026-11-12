import { PublikGate } from "@/components/PublikGate";
import { Studio } from "@/components/Studio";

// The software opens with Sign in with publik; the landing page at / does not.
export default function AppPage() {
  return (
    <PublikGate appName="pushin">
      <Studio />
    </PublikGate>
  );
}
