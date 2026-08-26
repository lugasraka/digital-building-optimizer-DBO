import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import {
  CATEGORY_LABELS,
  HONESTY_NOTE,
  METHOD_ENTRIES,
  type MethodCategory,
} from "@/lib/methodology";

export const metadata = {
  title: "Data & Methods — Digital Building Optimizer",
};

const CATEGORY_TONES: Record<MethodCategory, "brand" | "amber" | "emerald"> = {
  "public-dataset": "brand",
  synthetic: "amber",
  "open-method": "emerald",
};

const SECTIONS: Array<{ title: string; ids: string[] }> = [
  { title: "Input data", ids: ["location", "climate-zones", "weather"] },
  { title: "Benchmarks, tariffs & risk", ids: ["eui", "tariffs", "hazard"] },
  { title: "Modeling approach", ids: ["dispatch", "finance"] },
];

export default function MethodsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-base font-semibold tracking-tight text-slate-900">
            Data &amp; Methods
          </h1>
          <Link
            href="/wizard/facility"
            className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-4"
          >
            ← Back to optimizer
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-lg font-semibold text-slate-900">
            Nothing here is a black box
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Every number in the Digital Building Optimizer traces back to a
            named public dataset or an inspectable modeling method. The data
            pipeline scripts are committed in this repository and can be re-run
            to reproduce each dataset from source. Where inputs are
            approximations, they are labeled as such.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_LABELS) as MethodCategory[]).map((c) => (
              <Badge key={c} tone={CATEGORY_TONES[c]}>
                {CATEGORY_LABELS[c]}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {section.title}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {section.ids.map((id) => {
                  const entry = METHOD_ENTRIES.find((m) => m.id === id);
                  if (!entry) return null;
                  return (
                    <Card key={entry.id} className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-semibold text-slate-900">
                          {entry.title}
                        </h4>
                        <Badge tone={CATEGORY_TONES[entry.category]}>
                          {CATEGORY_LABELS[entry.category]}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
                        {entry.source}
                      </p>
                      <p className="text-sm leading-relaxed text-slate-600">
                        {entry.description}
                      </p>
                      {entry.url && (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-auto text-sm text-brand-700 hover:text-brand-800 hover:underline underline-offset-4"
                        >
                          View source ↗
                        </a>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="text-sm font-semibold text-amber-800">
            Honesty note
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            {HONESTY_NOTE}
          </p>
        </aside>
      </main>
    </div>
  );
}
