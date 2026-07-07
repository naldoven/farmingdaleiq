"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitMaintenanceRequest } from "@/app/(app)/maintenance/actions";

export interface EquipmentOption {
  id: string;
  name: string;
}

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
const NO_EQUIPMENT_VALUE = "none";
const NO_PRIORITY_VALUE = "unset";

/** Submit form for any team member (ARCHITECTURE.md "Requests"). */
export function RequestForm({ equipmentOptions }: { equipmentOptions: EquipmentOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [equipmentId, setEquipmentId] = useState<string>(NO_EQUIPMENT_VALUE);
  const [priority, setPriority] = useState<string>(NO_PRIORITY_VALUE);
  const [photoUrls, setPhotoUrls] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const result = await submitMaintenanceRequest({
            title,
            description: description || undefined,
            area: area || undefined,
            equipmentId: equipmentId === NO_EQUIPMENT_VALUE ? undefined : equipmentId,
            suggestedPriority:
              priority === NO_PRIORITY_VALUE ? undefined : (priority as (typeof PRIORITY_OPTIONS)[number]),
            photoUrls: photoUrls
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setTitle("");
          setDescription("");
          setArea("");
          setEquipmentId(NO_EQUIPMENT_VALUE);
          setPriority(NO_PRIORITY_VALUE);
          setPhotoUrls("");
          setSuccess(true);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="request-title">What&apos;s wrong?</Label>
        <Input
          id="request-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Walk-in freezer leaking"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="request-description">Details</Label>
        <Textarea
          id="request-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-area">Area of the store</Label>
          <Input id="request-area" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Equipment (optional)</Label>
          <Select value={equipmentId} onValueChange={setEquipmentId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_EQUIPMENT_VALUE}>None</SelectItem>
              {equipmentOptions.map((eq) => (
                <SelectItem key={eq.id} value={eq.id}>
                  {eq.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Suggested priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue placeholder="Not sure" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PRIORITY_VALUE}>Not sure</SelectItem>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="request-photos">Photos (one URL per line)</Label>
        <Textarea
          id="request-photos"
          value={photoUrls}
          onChange={(e) => setPhotoUrls(e.target.value)}
          placeholder={"https://..."}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Request submitted.</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting..." : "Submit request"}
      </Button>
    </form>
  );
}
