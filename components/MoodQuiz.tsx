"use client";

import { useCallback, useEffect, useState } from "react";
import Results, { type ResultItem } from "./Results";
import CityBar from "./CityBar";
import AmbienceBar from "./AmbienceBar";
import { useCity } from "./useCity";
import { useAmbience } from "./useAmbience";
import InterestPicker from "./InterestPicker";
import { useProfile } from "./useProfile";
import SignInModal, { markSignInPromptSeen, signInPromptSeen } from "./SignInModal";
import ProfileSetup from "./ProfileSetup";
import ActivityPicker from "./ActivityPicker";
import AccountBar from "./AccountBar";
import { useSession } from "./useSession";
import { useEventLog } from "./useEventLog";
import { slotForHour } from "@/lib/scoring";
import type { Activity, Answers, Slot } from "@/lib/types";

type Key = keyof Answers;

const QUESTIONS: {
  key: Key;
  question: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: "energy",
    question: "How's your energy right now?",
    options: [
      { value: "empty", label: "Completely drained" },
      { value: "steady", label: "Steady enough" },
      { value: "wired", label: "Wired, can't sit still" },
    ],
  },
  {
    key: "mood",
    question: "And how has the day been?",
    options: [
      { value: "stressed", label: "Stressful" },
      { value: "flat", label: "Flat, a bit low" },
      { value: "fine", label: "Fine, nothing dramatic" },
      { value: "celebrating", label: "Worth celebrating" },
    ],
  },
  {
    key: "hunger",
    question: "How hungry, honestly?",
    options: [
      { value: "nibble", label: "Just a nibble" },
      { value: "meal", label: "A proper meal" },
      { value: "feast", label: "Feed me properly" },
    ],
  },
  {
    key: "palate",
    question: "Do you want to think about it?",
    options: [
      { value: "familiar", label: "No, give me something I know" },
      { value: "surprise", label: "Yes, surprise me" },
    ],
  },
  {
    key: "patience",
    question: "How long can you wait?",
    options: [
      { value: "fast", label: "Under 30 minutes" },
      { value: "normal", label: "Up to 45 minutes" },
      { value: "relaxed", label: "No rush at all" },
    ],
  },
  {
    key: "diet",
    question: "Anything off the table?",
    options: [
      { value: "veg", label: "Veg only" },
      { value: "egg", label: "Veg or egg" },
      { value: "anything", label: "Anything goes" },
    ],
  },
];

export default function MoodQuiz() {
  const [slot, setSlot] = useState<Slot>("dinner");
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [weatherNote, setWeatherNote] = useState<string | null>(null);
  const [heat, setHeat] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { city, status, km, locate, choose: chooseCity, cities, radiusKm } = useCity();
  const { now, dayPart, greeting, weather, weatherLine } = useAmbience(city);
  const { state: authState, email, userId, problem, sendLink, verifyCode, signOut } = useSession();
  const {
    interests,
    toggle: toggleInterest,
    homeCity,
    isPro,
    spice,
    avoidCuisines,
    phone,
    phoneContactOk,
    saveProfile,
    needsSetup,
  } = useProfile(userId);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [setupSkipped, setSetupSkipped] = useState(false);
  // Set once and never changeable is not a preference, it is a trap.
  const [editingProfile, setEditingProfile] = useState(false);
  // A fast is a fact about today, not a standing preference, so it is session
  // state and is never persisted.
  const [fasting, setFasting] = useState(false);
  const { logShown, logClicked } = useEventLog(userId);

  // Everything recommend() reads, captured at the moment it ran. Kept in one
  // place because two call sites drifting apart is exactly how the log ended
  // up with moods on clicks and not on impressions.
  const eventContext = {
    mood: answers.mood ?? null,
    energy: answers.energy ?? null,
    hunger: answers.hunger ?? null,
    palate: answers.palate ?? null,
    patience: answers.patience ?? null,
    diet: answers.diet ?? null,
    fasting,
    weather: weather?.condition ?? null,
    temp_c: weather?.tempC ?? null,
    day_part: dayPart,
    interests,
    heat_override: heat,
    activity,
  };

  useEffect(() => setSlot(slotForHour(new Date().getHours())), []);

  const fetchResults = useCallback(
    async (a: Answers, h: number | null) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          answers: a,
          slot,
          heat: h ?? undefined,
          city: city?.slug,
          interests,
          fasting,
          activity,
          spice,
          avoidCuisines,
        }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not work that out.");
        setResults(data.results as ResultItem[]);
        setWeatherNote((data.weatherNote as string | null) ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [slot, city, interests, fasting, activity, spice, avoidCuisines],
  );

  useEffect(() => {
    if (!results) return;
    void fetchResults(answers as Answers, heat);
    // answers and heat are fixed by this point; the city is what changed
  }, [city?.slug, interests, fasting, activity, spice, avoidCuisines]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!results) return;
    logShown(results.map((r) => r.dish.id), city?.slug ?? null, slot, eventContext);
    // eventContext is rebuilt each render; `results` changing is the signal a
    // new shortlist exists, and logShown de-duplicates anything repeated.
  }, [results, city?.slug, slot, logShown]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(key: Key, value: string) {
    const next = { ...answers, [key]: value } as Partial<Answers>;
    setAnswers(next);
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      setStep(QUESTIONS.length);
      void fetchResults(next as Answers, null);
    }
  }

  function restart() {
    setAnswers({});
    setResults(null);
    setWeatherNote(null);
    setHeat(null);
    setError(null);
    setStep(-1);
  }

  function changeHeat(v: number) {
    setHeat(v);
    void fetchResults(answers as Answers, v);
  }

  function body() {
  // Opening screen
  if (step === -1) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-display mt-4 text-[clamp(2.75rem,10vw,6rem)] font-semibold leading-[0.92] tracking-tight">
          Tell me how you are.
          <br />
          I&apos;ll tell you what to eat.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
          Stop losing twenty minutes to three apps and a menu you have already read.
          Six questions about how you feel, four things in front of you, and you pick
          one. The craving is usually downstream of the mood anyway.
        </p>
        <div className="mt-8">
          <CityBar
            city={city}
            status={status}
            km={km}
            cities={cities}
            radiusKm={radiusKm}
            onLocate={locate}
            onChoose={chooseCity}
          />
        </div>
        <div className="mt-6">
          <InterestPicker interests={interests} onToggle={toggleInterest} />
          <div className="mt-4">
            <ActivityPicker activity={activity} isPro={isPro} onChange={setActivity} />
          </div>
          <button
            type="button"
            onClick={() => setFasting((v) => !v)}
            aria-pressed={fasting}
            className={`mt-3 border px-3 py-1.5 text-sm transition-colors ${
              fasting
                ? "border-ink bg-ink text-paper"
                : "border-ink/30 text-ink hover:bg-sage-deep"
            }`}
          >
            Fasting today
          </button>
        </div>
        <button
          onClick={() => {
            if (!city && status === "idle") locate();
            setStep(0);
          }}
          className="font-display mt-6 bg-ink px-8 py-4 text-lg text-paper transition-colors hover:bg-chilli"
        >
          Start
        </button>
      </div>
    );
  }

  // Questions
  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step];
    return (
      <div className="w-full max-w-2xl">
        <div className="flex gap-1.5" aria-hidden>
          {QUESTIONS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 ${i <= step ? "bg-ink" : "bg-ink/15"}`}
            />
          ))}
        </div>

        <p className="mt-6 text-sm text-ink-soft">
          Question {step + 1} of {QUESTIONS.length}
        </p>

        <h2 className="font-display mt-3 text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[0.98] tracking-tight">
          {q.question}
        </h2>

        <ul className="mt-10 border-t border-ink/20">
          {q.options.map((o) => (
            <li key={o.value}>
              <button
                onClick={() => choose(q.key, o.value)}
                className="font-display w-full border-b border-ink/20 py-5 text-left text-xl transition-colors hover:bg-sage-deep"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>

        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="mt-8 text-sm text-ink-soft underline underline-offset-4"
          >
            Back
          </button>
        )}
      </div>
    );
  }

  // Result
  return (
    <div className="w-full max-w-2xl">
      {busy && !results && (
        <p className="font-display text-2xl text-ink-soft">Working it out.</p>
      )}
      {error && (
        <div>
          <p className="font-display text-2xl">{error}</p>
          <button onClick={restart} className="mt-6 border-b-2 border-ink pb-1 font-display text-lg">
            Start over
          </button>
        </div>
      )}
      {results && (
        <Results
          items={results}
          slot={slot}
          city={city}
          weatherNote={weatherNote}
          onOrder={(dishId) =>
            logClicked(dishId, city?.slug ?? null, slot, eventContext)
          }
          cityBar={
            <CityBar
              city={city}
              status={status}
              km={km}
              cities={cities}
              radiusKm={radiusKm}
              onLocate={locate}
              onChoose={chooseCity}
            />
          }
          heat={heat}
          onHeat={changeHeat}
          onRestart={restart}
          busy={busy}
        />
      )}
    </div>
  );
  }

  // Signed out, a result on screen, and not asked before: one invitation.
  const showSignIn =
    authState === "signedOut" && Boolean(results) && !promptDismissed && !signInPromptSeen();

  return (
    <div className="w-full">
      <SignInModal
        open={showSignIn}
        onDismiss={() => {
          markSignInPromptSeen();
          setPromptDismissed(true);
        }}
        onSignIn={(address) => {
          markSignInPromptSeen();
          setPromptDismissed(true);
          sendLink(address);
        }}
      />
      {((needsSetup && !setupSkipped) || editingProfile) && (
        <ProfileSetup
          initialInterests={interests}
          initialCity={homeCity ?? city?.slug ?? null}
          initialSpice={spice}
          initialAvoid={avoidCuisines}
          initialPhone={phone}
          initialPhoneOk={phoneContactOk}
          onSave={async (v) => {
            await saveProfile(v);
            setSetupSkipped(true);
            setEditingProfile(false);
          }}
          onSkip={() => {
            setSetupSkipped(true);
            setEditingProfile(false);
          }}
        />
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <AmbienceBar now={now} greeting={greeting} weather={weather} weatherLine={weatherLine} />
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
          {authState === "signedIn" && (
            <button
              onClick={() => setEditingProfile(true)}
              className="text-sm text-ink-soft underline underline-offset-4"
            >
              Preferences
            </button>
          )}
          <AccountBar
            state={authState}
            email={email}
            problem={problem}
            onSend={sendLink}
            onVerify={verifyCode}
            onSignOut={signOut}
          />
        </div>
      </div>
      <div className="mt-8">{body()}</div>
    </div>
  );
}
