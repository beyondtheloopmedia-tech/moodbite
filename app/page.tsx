import MoodQuiz from "@/components/MoodQuiz";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-16 sm:px-10">
      <MoodQuiz />
      <footer className="mt-16 text-xs text-ink-soft">
        Moodbite sends you to Swiggy or Zomato to order. It does not scrape either of them.
      </footer>
    </main>
  );
}
