"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, SearchBar, SectionCard, StatusBadge } from "@/components/mobile";
import { PhotoStrip } from "@/components/maintenance/photo-upload";
import { addEquipmentFile, setEquipmentStatus } from "@/app/(app)/maintenance/equipment/actions";
import { PmScheduleManager, type PmScheduleRow } from "@/components/maintenance/pm-schedule-manager";
import type { PersonOption } from "@/components/maintenance/triage-queue";
import { formatStoreDate, formatStoreDateTime } from "@/lib/time";

export interface EquipmentDetailData {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  model: string | null;
  serial: string | null;
  service_vendor_name: string | null;
  installed_on: string | null;
  warranty_expires_on: string | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
}

export interface FileRow {
  id: string;
  file_url: string;
  label: string | null;
}

export interface SupportContactRow {
  id: string;
  label: string;
  value: string;
  href: string | null;
}

export interface EquipmentReferenceSectionRow {
  id: string;
  section_type: string;
  title: string;
  body: string;
  source_page: number | null;
}

export interface EquipmentPartRow {
  id: string;
  name: string;
  part_number: string | null;
  order_url: string;
  url_type: string;
  source_page: number | null;
}

export interface EquipmentPmTaskRow {
  id: string;
  title: string;
  details: string | null;
}

export interface DowntimeRow {
  id: string;
  started_at: string;
  ended_at: string | null;
}

export interface EquipmentWorkOrderRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

function StatusToggle({ equipment }: { equipment: EquipmentDetailData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <StatusBadge tone={equipment.status === "down" ? "danger" : "success"} dot={equipment.status !== "down"}>
        {equipment.status}
      </StatusBadge>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setEquipmentStatus({
              equipmentId: equipment.id,
              status: equipment.status === "down" ? "operational" : "down",
              workOrderId: undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        Mark {equipment.status === "down" ? "operational" : "down"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function contactIcon(href: string | null) {
  if (href?.startsWith("tel:")) return Phone;
  if (href?.startsWith("mailto:")) return Mail;
  return ExternalLink;
}

function SupportContacts({ contacts }: { contacts: SupportContactRow[] }) {
  if (contacts.length === 0) return null;

  return (
    <SectionCard title="Service contacts" flush>
      <div className="divide-y divide-line">
        {contacts.map((contact) => {
          const Icon = contactIcon(contact.href);
          const body = (
            <>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{contact.label}</span>
                <span className="block break-words text-[13px] text-muted-ink">{contact.value}</span>
              </span>
              {contact.href && <ExternalLink className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden="true" />}
            </>
          );

          if (!contact.href) {
            return (
              <div key={contact.id} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                {body}
              </div>
            );
          }

          return (
            <a
              key={contact.id}
              href={contact.href}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
            >
              {body}
            </a>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ReferenceSections({ sections }: { sections: EquipmentReferenceSectionRow[] }) {
  return (
    <SectionCard
      title="Reference & troubleshooting"
      action={<span className="text-[13px] font-semibold text-muted-ink">{sections.length}</span>}
    >
      {sections.length === 0 ? (
        <p className="text-[13px] text-muted-ink">No reference notes captured for this equipment.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sections.map((section, index) => {
            const paragraphs = section.body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
            return (
              <details
                key={section.id}
                open={index === 0}
                className="group overflow-hidden rounded-lg border border-line bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-ink">{section.title}</span>
                    {section.source_page && (
                      <span className="block text-[12px] text-muted-ink">PDF page {section.source_page}</span>
                    )}
                  </span>
                  <StatusBadge tone={section.section_type === "troubleshooting" ? "warning" : "info"}>
                    {section.section_type === "troubleshooting" ? "Troubleshooting" : "Reference"}
                  </StatusBadge>
                </summary>
                <div className="border-t border-line px-3 py-3">
                  <div className="flex flex-col gap-2">
                    {paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={`${section.id}-${paragraphIndex}`} className="text-[13px] leading-5 text-muted-ink">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function FilesManager({
  equipmentId,
  files,
  canManage,
}: {
  equipmentId: string;
  files: FileRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.file_url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary hover:underline"
        >
          {file.label || file.file_url}
        </a>
      ))}
      {files.length === 0 && <p className="text-sm text-muted-foreground">No manuals or files attached.</p>}

      {canManage && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await addEquipmentFile({ equipmentId, fileUrl, label: label || undefined });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setFileUrl("");
              setLabel("");
              router.refresh();
            });
          }}
        >
          <Input
            aria-label="File URL"
            placeholder="File URL"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            className="max-w-[16rem]"
            required
          />
          <Input
            aria-label="Label"
            placeholder="Label (e.g. Manual)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="max-w-[10rem]"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            {isPending ? "Adding..." : "Add file"}
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function PartsList({ parts }: { parts: EquipmentPartRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter(
      (part) =>
        part.name.toLowerCase().includes(q) ||
        (part.part_number ?? "").toLowerCase().includes(q),
    );
  }, [parts, query]);

  return (
    <SectionCard
      title="Parts & inventory"
      action={<span className="text-[13px] font-semibold text-muted-ink">{parts.length}</span>}
    >
      {parts.length === 0 ? (
        <p className="text-[13px] text-muted-ink">No parts captured for this equipment.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {parts.length > 8 && (
            <SearchBar
              label="Search parts"
              placeholder="Search parts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {filtered.length === 0 ? (
            <p className="text-[13px] text-muted-ink">No parts match that search.</p>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {filtered.map((part) => (
                <div key={part.id} className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">{part.name}</p>
                    <p className="break-words text-[13px] text-muted-ink">
                      {[part.part_number, part.source_page ? `PDF page ${part.source_page}` : null]
                        .filter(Boolean)
                        .join(" - ")}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="secondary" className="shrink-0">
                    <a href={part.order_url} target="_blank" rel="noreferrer">
                      {part.url_type === "parts_search" ? "View" : "Order"}
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function PmTaskList({ tasks }: { tasks: EquipmentPmTaskRow[] }) {
  return (
    <SectionCard
      title="PM reference tasks"
      action={<span className="text-[13px] font-semibold text-muted-ink">{tasks.length}</span>}
    >
      {tasks.length === 0 ? (
        <p className="text-[13px] text-muted-ink">No PM reference tasks captured for this equipment.</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {tasks.map((task) => (
            <div key={task.id} className="px-3 py-3">
              <p className="text-[15px] font-semibold text-ink">{task.title}</p>
              {task.details && <p className="mt-1 text-[13px] leading-5 text-muted-ink">{task.details}</p>}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Equipment detail page (ARCHITECTURE.md "Equipment registry"). */
export function EquipmentDetail({
  equipment,
  files,
  supportContacts,
  referenceSections,
  parts,
  pmTasks,
  downtime,
  workOrders,
  pmSchedules,
  assigneeOptions,
  vendorOptions,
  canManage,
}: {
  equipment: EquipmentDetailData;
  files: FileRow[];
  supportContacts: SupportContactRow[];
  referenceSections: EquipmentReferenceSectionRow[];
  parts: EquipmentPartRow[];
  pmTasks: EquipmentPmTaskRow[];
  downtime: DowntimeRow[];
  workOrders: EquipmentWorkOrderRow[];
  pmSchedules: PmScheduleRow[];
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[22px] font-bold text-ink">{equipment.name}</h1>
        {canManage ? (
          <StatusToggle equipment={equipment} />
        ) : (
          <StatusBadge tone={equipment.status === "down" ? "danger" : "success"} dot={equipment.status !== "down"}>
            {equipment.status}
          </StatusBadge>
        )}
      </div>

      {equipment.photo_url && <PhotoStrip photos={[equipment.photo_url]} />}

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {equipment.category && (
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{equipment.category}</dd>
          </div>
        )}
        {equipment.area && (
          <div>
            <dt className="text-muted-foreground">Area</dt>
            <dd>{equipment.area}</dd>
          </div>
        )}
        {equipment.model && (
          <div>
            <dt className="text-muted-foreground">Model</dt>
            <dd>{equipment.model}</dd>
          </div>
        )}
        {equipment.serial && (
          <div>
            <dt className="text-muted-foreground">Serial</dt>
            <dd>{equipment.serial}</dd>
          </div>
        )}
        {equipment.service_vendor_name && (
          <div>
            <dt className="text-muted-foreground">Service vendor</dt>
            <dd>{equipment.service_vendor_name}</dd>
          </div>
        )}
        {equipment.installed_on && (
          <div>
            <dt className="text-muted-foreground">Installed</dt>
            <dd>{equipment.installed_on}</dd>
          </div>
        )}
        {equipment.warranty_expires_on && (
          <div>
            <dt className="text-muted-foreground">Warranty expires</dt>
            <dd>{equipment.warranty_expires_on}</dd>
          </div>
        )}
      </dl>
      {equipment.notes && <p className="text-sm text-muted-foreground">{equipment.notes}</p>}

      <SupportContacts contacts={supportContacts} />

      <ReferenceSections sections={referenceSections} />

      <SectionCard title="Manuals, videos & files">
        <FilesManager equipmentId={equipment.id} files={files} canManage={canManage} />
      </SectionCard>

      <PartsList parts={parts} />

      <PmTaskList tasks={pmTasks} />

      <SectionCard title="Scheduled PM">
        <PmScheduleManager
          equipmentId={equipment.id}
          schedules={pmSchedules}
          assigneeOptions={assigneeOptions}
          vendorOptions={vendorOptions}
          canManage={canManage}
        />
      </SectionCard>

      <SectionCard title="Downtime history" flush={downtime.length > 0}>
        {downtime.length === 0 ? (
          <p className="text-[13px] text-muted-ink">No downtime recorded.</p>
        ) : (
          <div className="divide-y divide-line">
            {downtime.map((span) => (
              <ListRow
                key={span.id}
                title={formatStoreDateTime(span.started_at)}
                description={span.ended_at ? `Ended ${formatStoreDateTime(span.ended_at)}` : "Ongoing"}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Work order history" flush={workOrders.length > 0}>
        {workOrders.length === 0 ? (
          <p className="text-[13px] text-muted-ink">No work orders yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {workOrders.map((wo) => (
              <ListRow
                key={wo.id}
                href={`/maintenance/${wo.id}`}
                title={wo.title}
                description={formatStoreDate(wo.created_at)}
                trailing={<StatusBadge tone="neutral">{wo.status.replace("_", " ")}</StatusBadge>}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
