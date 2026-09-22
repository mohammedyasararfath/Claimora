import Link from "next/link";
import { ConversionMeasurement } from "@/components/admin/ConversionMeasurement";

export default function ConversionMeasurementPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold">Conversion Measurement</h2>
        <Link href="/admin" className="text-sm font-semibold text-indigo">
          ← Back to admin
        </Link>
      </div>
      <ConversionMeasurement />
    </main>
  );
}
