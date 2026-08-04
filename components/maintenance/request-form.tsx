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
import { PhotoUpload } from "@/components/maintenance/photo-upload";
import { submitMaintenanceRequest } from "@/app/(app)/maintenance/actions";

export interface EquipmentOption {
  id: string;
  name: string;
}

const NO_EQUIPMENT_VALUE = "none";

/** Submit form for any team member (ARCHITECTURE.md "Requests"). */
export function RequestForm({ equipmentOptions }: { equipmentOptions: EquipmentOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [equipmentId, setEquipmentId] = useState<string>(NO_EQUIPMENT_VALUE);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosBusy, setPhotosBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          // Area/suggested-priority inputs were dropped from this form to
          // keep it quick on a phone; the schema keys stay for API
          // compatibility, so they're passed explicitly as undefined.
          const result = await submitMaintenanceRequest({
            title,
            description: description || undefined,
            area: undefined,
            equipmentId: equipmentId === NO_EQUIPMENT_VALUE ? undefined : equipmentId,
            suggestedPriority: undefined,
            photoUrls: photos,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setTitle("");
          setDescription("");
          setEquipmentId(NO_EQUIPMENT_VALUE);
          setPhotos([]);
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
        <Label>Photos (optional)</Label>
        <PhotoUpload photos={photos} onChange={setPhotos} folder="requests" onBusyChange={setPhotosBusy} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Request submitted.</p>}
      <Button type="submit" disabled={isPending || photosBusy}>
        {isPending ? "Submitting..." : "Submit request"}
      </Button>
    </form>
  );
}
