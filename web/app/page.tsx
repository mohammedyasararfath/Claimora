import { SearchHero } from "@/components/search/SearchHero";

export default function LandingPage() {
  return (
    <main>
      <SearchHero />
      <p className="px-6 py-6 text-center text-xs text-ink-soft">
        Claimora helps you find, claim, and grow your professional profile. Prototype content has been fully
        replaced — every profile shown is real data from the Claimora directory.
      </p>
    </main>
  );
}
