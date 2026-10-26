import { firstName } from "@/app/(app)/cleaning/today-view";
import { STORE_TIME_ZONE, formatStoreTime } from "@/lib/time";

/**
 * Pure shaping for the found-and-fixed screen (docs/CLEANING-PLAN.md
 * "Screens": `/cleaning/finds`). Takes the rows plus the lookups the page
 * already loaded and returns what the screen draws, so wording, ordering and
 * who may do what are tested without Supabase or React.
 */

/** The page shows this many of the newest finds. */
export const FIND_PAGE_LIMIT = 50;

/** The cleaning_atd_finds columns the screen reads. */
export interface FindLike {
  id: string;
  zone_id: string;
  note: string;
  photo_path: string;
  posted_by: string;
  posted_at: string;
  converted_item_id: string | null;
}

export interface ZoneLike {
  id: string;
  name: string;
  color: string;
  side: string;
  sort: number;
  active: boolean;
}

/** A zone as the client components take it. */
export interface FindZone {
  id: string;
  name: string;
  color: string;
  side: string;
}

export interface FindCard {
  id: string;
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  note: string;
  /** First name only. Shown in the app; Discord never gets it. */
  postedBy: string | null;
  /** "Posted Mon Oct 26, 3:42 PM by Maria", in store time. */
  postedText: string;
  photoUrl: string | null;
  /** The find has a photo but its signed URL did not come back. */
  photoMissing: boolean;
  /** Where the find went once a planner put it on the master list. */
  itemHref: string | null;
  /** Planners can turn an unconverted find into an item or delete it. */
  canConvert: boolean;
  canDelete: boolean;
}

export interface FindsViewInput {
  finds: FindLike[];
  zones: Map<string, ZoneLike>;
  /** Profile id to full name. */
  people: Map<string, string>;
  /** Storage path to signed URL. */
  photoUrls: Map<string, string>;
  canPlan: boolean;
}

/**
 * "Mon Oct 26, 3:42 PM" in store time. The server clock runs UTC, so the day
 * is read in the store's zone: a find posted at 9pm Eastern is already
 * tomorrow in UTC.
 */
export function postedLabel(postedAt: string): string {
  const instant = new Date(postedAt);
  if (Number.isNaN(instant.getTime())) return "";
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: STORE_TIME_ZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("weekday")} ${parts.get("month")} ${parts.get("day")}, ${formatStoreTime(instant)}`;
}

/**
 * Areas a find can be filed under: active ones only, back of house first
 * (Naldo's walkthrough order), each side keeping the zones' own sort. Matches
 * the route, which refuses an inactive area.
 */
export function postableZones(zones: ZoneLike[]): FindZone[] {
  const rank = (zone: ZoneLike) => (zone.side === "boh" ? 0 : 1);
  return zones
    .filter((zone) => zone.active)
    .sort((a, b) => rank(a) - rank(b) || a.sort - b.sort || a.name.localeCompare(b.name))
    .map(({ id, name, color, side }) => ({ id, name, color, side }));
}

/** Newest first, whatever order the rows arrived in. */
export function buildFindsView(input: FindsViewInput): FindCard[] {
  const sorted = [...input.finds].sort(
    (a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at) || b.id.localeCompare(a.id),
  );
  return sorted.map((find) => {
    const zone = input.zones.get(find.zone_id);
    const who = firstName(input.people.get(find.posted_by));
    const when = postedLabel(find.posted_at);
    const photoUrl = input.photoUrls.get(find.photo_path) ?? null;
    const converted = Boolean(find.converted_item_id);
    return {
      id: find.id,
      zoneId: find.zone_id,
      zoneName: zone?.name ?? "No area",
      zoneColor: zone?.color ?? "#9CA3AF",
      note: find.note,
      postedBy: who,
      postedText: `Posted${when ? ` ${when}` : ""}${who ? ` by ${who}` : ""}`,
      photoUrl,
      photoMissing: !photoUrl,
      itemHref: find.converted_item_id ? `/cleaning/items/${find.converted_item_id}` : null,
      canConvert: input.canPlan && !converted,
      canDelete: input.canPlan && !converted,
    };
  });
}
