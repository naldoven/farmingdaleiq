import Link from "next/link";

import { SectionCard } from "@/components/mobile";
import { DismissGuideButton } from "./dismiss-button";

/**
 * First-shift guide for new leaders. Open to any signed-in user: the (app)
 * layout already requires sign-in and nothing here reads or writes data, so
 * there is no permission to check. Keep the body text short; people read this
 * on a phone, standing up, once.
 */

interface GuideStep {
  title: string;
  body: string;
  link?: { href: string; label: string };
}

const STEPS: GuideStep[] = [
  {
    title: "Add the app to your home screen",
    body: "iPhone: Share, then Add to Home Screen. Android: browser menu, then Add to Home screen. Open it from there like any app.",
  },
  {
    title: "Link your Discord",
    body: "Shout-outs, to-dos, and alerts reach you in Discord. The app asks for your Discord ID when you sign in. If you skipped it, it asks again next time.",
  },
  {
    title: "Start on Home",
    body: "Today's checklists, your to-dos, and anything overdue are on the Home screen. Tap a card to open it.",
    link: { href: "/", label: "Go to Home" },
  },
  {
    title: "Work the list",
    body: "Checklists has today's checks. Tasks has what is assigned to you and the shift pool. Finish items as you go and the Home counts update.",
    link: { href: "/checklists", label: "Open Checklists" },
  },
  {
    title: "Give a shout-out",
    body: "From the Menu tab, send a recognition. It posts to the team Discord channel and awards tokens.",
    link: { href: "/menu", label: "Open Menu" },
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <h1 className="text-[22px] font-semibold text-ink">Your first shift</h1>
      <SectionCard flush>
        <ol className="divide-y divide-line">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent-ink"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-ink">
                  {step.title}
                </h2>
                <p className="text-[14px] text-muted-ink">{step.body}</p>
                {step.link && (
                  <Link
                    href={step.link.href}
                    className="mt-1 inline-flex min-h-11 items-center text-[14px] font-medium text-accent-ink underline-offset-2 hover:underline"
                  >
                    {step.link.label}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>
      <DismissGuideButton />
    </div>
  );
}
