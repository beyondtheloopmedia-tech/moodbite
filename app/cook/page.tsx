import Link from "next/link";
import CookPicker from "@/components/CookPicker";

export const metadata = {
  title: "Moodbite — cook something",
  description:
    "Say how long you have and what you are cooking for, and get something worth making tonight.",
};

export default function Cook() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:px-10">
      <Link href="/" className="text-sm text-ink-soft underline underline-offset-4">
        Moodbite
      </Link>

      <h1 className="font-display mt-6 text-[clamp(2.25rem,8vw,4rem)] font-semibold leading-[0.95] tracking-tight">
        Cooking tonight?
      </h1>
      <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
        Ordering is a question about how you feel. Cooking is a question about what
        you have — an hour, a cupboard, somebody to feed. Answer those three and
        there is usually an obvious thing to make.
      </p>

      <div className="mt-12">
        <CookPicker />
      </div>
    </main>
  );
}
