"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SetupLinkPanel } from "@/components/people/setup-link-panel";
import { newSetupLink, setTemporaryPassword } from "@/app/(app)/people/actions";

/**
 * The profile's Sign-in section (docs/STAFF-SIGN-IN-PLAN.md, Steps 4 and 5).
 * The page renders it only for a people.manage holder who outranks this
 * person; the server actions re-check both, so hiding it is a convenience,
 * not the control.
 */
export function SignInTools({ profileId, name }: { profileId: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function makeLink() {
    setMessage(null);
    startTransition(async () => {
      const result = await newSetupLink({ profileId });
      if (!result.ok) {
        setLink(null);
        setMessage({ ok: false, text: result.error });
        return;
      }
      setLink(result.data.link);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted-ink">
          Make a one-time link {name} can open to choose a password. A new link replaces any
          older one.
        </p>
        <Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={makeLink}>
          {isPending && !password ? "Making link..." : "New setup link"}
        </Button>
        {link ? <SetupLinkPanel name={name} link={link} /> : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          setLink(null);
          startTransition(async () => {
            const result = await setTemporaryPassword({ profileId, password });
            if (!result.ok) {
              setMessage({ ok: false, text: result.error });
              return;
            }
            setPassword("");
            setMessage({
              ok: true,
              text: `Temporary password set. ${name} must choose a new one the first time they sign in.`,
            });
          });
        }}
      >
        <Label htmlFor="temp-password" className="text-[13px] font-semibold text-ink">
          Temporary password
        </Label>
        <Input
          id="temp-password"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          className="h-11 text-[16px]"
        />
        <p className="text-[13px] text-muted-ink">
          At least 8 characters. Tell {name} in person. They will be asked to change it.
        </p>
        <Button type="submit" className="min-h-11" disabled={isPending || password.length === 0}>
          {isPending && password ? "Saving..." : "Set temporary password"}
        </Button>
      </form>

      {message ? (
        <p role="status" className={`text-[13px] ${message.ok ? "text-success" : "text-destructive"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
