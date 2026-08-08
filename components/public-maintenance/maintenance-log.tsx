"use client";

import { useRef, useState } from "react";
import { Camera, Send, Wrench, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { formatStoreDate } from "@/lib/time";

export interface PublicEquipmentOption {
  id: string;
  name: string;
}

export interface PublicWorkOrder {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "on_hold";
  priority: "low" | "medium" | "high" | "urgent";
  area: string | null;
  equipmentName: string | null;
  photoUrls: string[];
  createdAt: string;
}

const KANBAN_COLUMNS: Array<{
  status: PublicWorkOrder["status"];
  label: string;
  tone: "info" | "warning" | "danger";
}> = [
  { status: "open", label: "Open", tone: "info" },
  { status: "in_progress", label: "In progress", tone: "warning" },
  { status: "on_hold", label: "Awaiting vendor or parts", tone: "danger" },
];

function statusForPriority(priority: PublicWorkOrder["priority"]): "neutral" | "warning" | "danger" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  return "neutral";
}

function PhotoPreview({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-secondary">
      {/* eslint-disable-next-line @next/next/no-img-element -- user-submitted storage image. */}
      <img src={url} alt="Selected problem" className="h-full w-full object-cover" />
      <button
        type="button"
        aria-label="Remove selected photo"
        onClick={onRemove}
        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-white"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function PublicRequestForm({ equipmentOptions }: { equipmentOptions: PublicEquipmentOption[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function uploadFiles(files: FileList | null) {
    const selected = Array.from(files ?? []).slice(0, 6 - photos.length);
    if (selected.length === 0) return;

    setError(null);
    setIsUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const formData = new FormData();
        formData.append("photo", file);
        const response = await fetch("/api/public/maintenance/photos", { method: "POST", body: formData });
        const data: { url?: string; error?: string } = await response.json();
        if (!response.ok || !data.url) {
          setError(data.error ?? "Could not upload the photo. Try again.");
          break;
        }
        uploaded.push(data.url);
      }
      if (uploaded.length > 0) setPhotos((current) => [...current, ...uploaded]);
    } catch {
      setError("Could not upload the photo. Check your connection and try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/public/maintenance/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId,
          title,
          description,
          equipmentId,
          photoUrls: photos,
        }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not submit the request. Try again.");
        return;
      }

      setTitle("");
      setDescription("");
      setEquipmentId("");
      setPhotos([]);
      setSubmissionId(crypto.randomUUID());
      setSuccess(true);
    } catch {
      setError("Could not submit the request. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SectionCard title="Report a problem">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="public-maintenance-title">What needs attention?</Label>
          <Input
            id="public-maintenance-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ice machine is leaking"
            maxLength={200}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="public-maintenance-description">Details</Label>
          <Textarea
            id="public-maintenance-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Share anything that will help us understand the problem."
            maxLength={2_000}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="public-maintenance-equipment">Equipment (optional)</Label>
          <select
            id="public-maintenance-equipment"
            value={equipmentId}
            onChange={(event) => setEquipmentId(event.target.value)}
            className="h-10 w-full rounded-md border border-line bg-card px-3 text-[15px] text-ink"
          >
            <option value="">Choose equipment</option>
            {equipmentOptions.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>
                {equipment.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Photos (optional)</Label>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((url) => (
                <PhotoPreview key={url} url={url} onRemove={() => setPhotos((current) => current.filter((photo) => photo !== url))} />
              ))}
            </div>
          )}
          {photos.length < 6 && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-line px-3 text-[15px] font-semibold text-ink transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {isUploading ? "Uploading..." : photos.length > 0 ? "Add another photo" : "Add photos"}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </div>
        {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        {success && <p className="text-[13px] text-success">Your request was sent for review.</p>}
        <button
          type="submit"
          disabled={isSubmitting || isUploading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? "Sending..." : "Send request"}
        </button>
      </form>
    </SectionCard>
  );
}

function WorkOrderCard({ order }: { order: PublicWorkOrder }) {
  const showPhotos = order.status === "open" || order.status === "on_hold";

  return (
    <article className="flex flex-col gap-3 px-4 py-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{order.title}</h3>
        <p className="mt-0.5 text-[13px] text-muted-ink">
          {[order.area, order.equipmentName ?? "General maintenance"].filter(Boolean).join(" - ")} - Reported {formatStoreDate(order.createdAt)}
        </p>
      </div>
      {order.description && <p className="whitespace-pre-wrap text-[15px] text-ink">{order.description}</p>}
      {showPhotos && order.photoUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {order.photoUrls.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md border border-line bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element -- public work-order photos are stored outside Next image domains. */}
              <img
                src={url}
                alt={`Problem photo ${index + 1} for ${order.title}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {(order.priority === "high" || order.priority === "urgent") && (
        <StatusBadge tone={statusForPriority(order.priority)} className="w-fit">
          {order.priority} priority
        </StatusBadge>
      )}
    </article>
  );
}

function PublicWorkKanban({ workOrders }: { workOrders: PublicWorkOrder[] }) {
  return (
    <section aria-labelledby="current-work-heading" className="flex flex-col gap-3">
      <div className="px-1">
        <h2 id="current-work-heading" className="text-[20px] font-bold text-ink">Current work ({workOrders.length})</h2>
      </div>
      {workOrders.length === 0 ? (
        <div className="border border-line bg-card px-4 py-6 text-center text-[15px] text-muted-ink">
          No maintenance work is currently open.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {KANBAN_COLUMNS.map((column) => {
            const orders = workOrders.filter((order) => order.status === column.status);
            const headingId = `work-column-${column.status}`;

            return (
              <section key={column.status} aria-labelledby={headingId} className="min-w-0 border border-line bg-card">
                <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <h3 id={headingId} className="text-[15px] font-semibold text-ink">{column.label}</h3>
                  <StatusBadge tone={column.tone}>{orders.length}</StatusBadge>
                </header>
                {orders.length === 0 ? (
                  <p className="px-4 py-5 text-[14px] text-muted-ink">No work here.</p>
                ) : (
                  <div className="divide-y divide-line">
                    {orders.map((order) => <WorkOrderCard key={order.id} order={order} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PublicMaintenanceLog({
  equipmentOptions,
  workOrders,
}: {
  equipmentOptions: PublicEquipmentOption[];
  workOrders: PublicWorkOrder[];
}) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="max-w-2xl px-1 pb-1">
          <div className="flex items-center gap-2 text-accent">
            <Wrench className="h-5 w-5" aria-hidden="true" />
            <span className="text-[15px] font-semibold">FarmingdaleIQ</span>
          </div>
          <h1 className="mt-3 text-[30px] font-bold text-ink">Maintenance log</h1>
          <p className="mt-1 text-[15px] text-muted-ink">Report a problem or see what is currently being worked on.</p>
        </header>

        <div className="mx-auto w-full max-w-2xl">
          <PublicRequestForm equipmentOptions={equipmentOptions} />
        </div>

        <PublicWorkKanban workOrders={workOrders} />
      </div>
    </main>
  );
}
