# FarmingdaleIQ Design System

The KitchenIQ mobile design language, rebuilt for FarmingdaleIQ in CFA red. This
is the foundation every screen builds on. Read it before adding a screen so the
app stays one consistent system.

- Tokens live in `app/globals.css` and are wired into the Tailwind theme.
- Font is loaded in `app/layout.tsx` with `next/font`.
- Shared components live in `components/mobile/` and export from
  `@/components/mobile`.
- The responsive shell is `components/mobile/app-shell.tsx`, mounted by
  `app/(app)/layout.tsx`.

---

## Font

**Plus Jakarta Sans**, loaded through `next/font/google` in `app/layout.tsx` as
the CSS variable `--font-jakarta`, exposed to Tailwind as `--font-sans` and set
on `body`. It is a slightly rounded geometric sans with character, used for both
display and body. Weights loaded: 400, 500, 600, 700, 800. Do not introduce
Inter, Roboto, Arial, or system-ui.

Type scale (use these sizes so screens match):

| Role | Size / weight | Tailwind |
| --- | --- | --- |
| Page title (sub-page header) | 22px / 700 | `text-[22px] font-bold` |
| Big page title | 30px / 700 | `text-[30px] font-bold` |
| Section label (Send / Assign) | 22px / 700 ink | `SectionLabel` |
| Card title | 19px / 600 | `text-[19px] font-semibold` |
| Body | 15px | `text-[15px]` |
| Caption | 13px / muted | `text-[13px] text-muted-ink` |
| Big metric number | 30-34px / 700 | `text-[30px]`-`text-[34px] font-bold` |

---

## Color tokens

Two layers. The **named design tokens** are the language you build in. The
**shadcn primitive aliases** (`--primary`, `--muted`, etc.) are kept intact so
every `components/ui/*` primitive keeps working; their values point at the named
tokens. Prefer the named tokens in new screens.

### Named tokens (use these)

| Token | Utility | Light value | Meaning |
| --- | --- | --- | --- |
| `--ink` | `text-ink`, `bg-ink` | `#1F2A44` | Headings and primary text |
| `--muted-ink` | `text-muted-ink` | `#6B7280` | Secondary text |
| `--canvas` | `bg-canvas` | `#F4F6F8` | Page background |
| `--card` | `bg-card` | `#FFFFFF` | Card and surface background |
| `--line` | `border-line` | `#E5E7EB` | Hairlines and borders |
| `--accent` | `text-accent`, `bg-accent` | `#E51636` | CFA red: primary action, active nav, links, focus |
| `--accent-ink` | `text-accent-ink` | `#9C0F28` | Readable red text on tints |
| `--accent-soft` | `bg-accent-soft` | `#FDE7EB` | Tinted pill / hover background |
| `--success` | `text-success` | `#16A34A` | Active, completed, +earn |
| `--success-soft` | `bg-success-soft` | `#DCFCE7` | Success tint |
| `--danger` | `text-danger` | `#DC2626` | Overdue / alert numbers |
| `--danger-soft` | `bg-danger-soft` | `#FEE2E2` | Danger tint |
| `--warning` | `text-warning` | `#F59E0B` | Broadcast / warning / token gold |
| `--warning-soft` | `bg-warning-soft` | `#FEF3C7` | Warning tint |
| `--info` | `text-info` | `#2563EB` | Used sparingly |
| `--info-soft` | `bg-info-soft` | `#DBEAFE` | Info tint |

Dark theme values are defined under `.dark` in `globals.css`. The app runs light
by default (gray canvas); dark is kept in parity for the primitives.

### Radius and shadow

- Cards: 16px (`rounded-xl`, which maps to the card radius). Tiles and buttons:
  12px (`rounded-lg` / `rounded-md`). Chips and pills: fully rounded
  (`rounded-full`).
- Card shadow: `shadow-card`
  (`0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)`).

### Semantic vs accent

The accent is red. Semantic colors (success green, danger red, warning amber,
info blue) carry state and are separate from the accent. Note the accent red and
the danger red are close but not the same token: use `--accent` for brand and
action, `--danger` for alert and overdue.

---

## Layout

- **Mobile (< 768px):** fixed bottom tab bar (Home / Team / Menu) and a sticky
  top header. Page content scrolls between them with `pb-24` so nothing hides
  behind the bar. The notification bell is in the header, not a tab.
- **Desktop (>= 768px):** the left sidebar returns; the bottom bar and mobile
  header are hidden. Dashboard screens (Home / Team / Menu) should render as a
  single centered column, roughly `max-w-[480px]`. Data-heavy screens may go
  wider.
- Page canvas is `bg-canvas` (light gray). Cards are white, rounded, with
  `shadow-card`, separated by 16px gaps, inside 16px page padding.

The shell handles all of this. A screen only supplies its content, usually a
`flex flex-col gap-4` column with an `mx-auto max-w-[480px]` wrapper for
dashboard pages.

---

## Components

Import from the barrel:

```tsx
import { SectionCard, ListRow, StatTile, ProgressBar } from "@/components/mobile";
```

### AppShell

Responsive shell. Renders the mobile header + bottom tab bar under `md`, the
sidebar at `md+`, and the page content in the main slot. Mounted once by
`app/(app)/layout.tsx`; screens do not render it.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `user` | `{ name; email; roleName }` | required | Drives avatar and footer |
| `children` | `ReactNode` | required | Page content |
| `storeName` | `string` | `"Farmingdale"` | Home-header pill |
| `storeAddress` | `string` | `"1991 Broadhollow Rd"` | Home-header pill |
| `hasUnread` | `boolean` | `false` | Notification bell dot |
| `layout` | `"responsive" \| "mobile" \| "desktop"` | `"responsive"` | Override; `mobile`/`desktop` force one nav (used by tests) |

### AppHeader

Mobile top header. Two variants.

| Prop | Type | Notes |
| --- | --- | --- |
| `variant` | `"home" \| "subpage"` | Home shows wordmark + store pill + bell + avatar; sub-page shows back chevron + title |
| `title` | `string` | Sub-page title |
| `backHref` | `string` | Back destination (defaults to parent path) |
| `actions` | `ReactNode` | Right-side controls on a sub-page (gear, +, overflow) |
| `userName`, `storeName`, `storeAddress`, `hasUnread` | | Home variant |

The shell derives the variant, title, and back target from the pathname with
`resolveHeader()` in `lib/nav/page-map.ts`, so a screen rarely renders this
directly.

### BottomTabBar + TabItem

Fixed bottom bar (Home / Team / Menu). `TabItem` is one destination: icon over
label, active in accent red, inactive in `#94A3B8`. Menu is a button that opens
the full navigation drawer. Props: `pathname`, `onMenuClick`, `menuOpen`.

### Sidebar

Desktop left sidebar (`md+`). Wordmark header, grouped `NavLinks` (active in
accent red), user footer. Prop: `user: { name; roleName }`.

### StoreLocationPill

Rounded outline pill with a pin, store name, and address. Truncates on narrow
screens. Props: `storeName`, `address`.

### AvatarInitials

Round avatar with 1-2 initials over a deterministic soft color from the name
(same name always the same color). Props: `name`, `size` (`sm` | `md` | `lg`).
Exposes the name via `aria-label`.

```tsx
<AvatarInitials name="Dana Cruz" size="md" />
```

### NotificationBell

Icon-only link to the notification center with an unread dot. The unread state
is in the `aria-label`, not color alone. Props: `hasUnread`, `href`.

### SectionLabel

Large bold section heading (the "Send / Assign / View" style, 22px / 700) with
an optional right-aligned `action` slot.

```tsx
<SectionLabel action={<Link href="/team">See all</Link>}>Recognize</SectionLabel>
```

### ActionPill

Tappable pill: a tinted round icon chip over a bold label. Renders a link when
`href` is set, otherwise a button.

| Prop | Type | Notes |
| --- | --- | --- |
| `icon` | `LucideIcon` | required |
| `label` | `string` | required |
| `tone` | `"recognition" \| "infraction" \| "broadcast" \| "assign"` | green / red / amber / accent-red tint |
| `href` or button props | | link vs button |

```tsx
<ActionPill icon={Award} label="Recognize" tone="recognition" href="/team/new" />
```

### ListRow

One row in a list card: tinted leading icon chip, title, optional description,
trailing chevron or badge. Link when `href` is set, button when `onClick` is
set, otherwise static.

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `ReactNode` | required |
| `description` | `ReactNode` | optional secondary line |
| `icon` | `LucideIcon` | leading chip icon |
| `iconTone` | `"neutral" \| "accent" \| "success" \| "danger" \| "warning" \| "info"` | chip tint |
| `trailing` | `ReactNode` | overrides the default chevron (e.g. a `StatusBadge`) |
| `href` / `onClick` | | interactivity |

Wrap a list of rows in a `flush` `SectionCard` with `divide-y divide-line` for
edge-to-edge rows.

### StatTile

Compact tile: big metric number over a caption. Tone colors only the value.

| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `ReactNode` | required |
| `label` | `ReactNode` | required |
| `tone` | `"neutral" \| "success" \| "danger" \| "warning"` | value color |

### MetricCard

White card with a small title, one big value, and an optional sub-line like
"0% Completed". Props: `title`, `value`, `subline`, `adornment`.

### HScroll

Horizontal snap-scroll row (the scoreboard). Children lay out in one row that
scrolls sideways inside its own container, so the page never scrolls sideways.
Prop: `snap` (`start` | `center` | `none`). Wrap each `StatTile` and it handles
the rest.

```tsx
<HScroll>
  <StatTile value={12} label="Checklists" />
  <StatTile value={3} label="Overdue" tone="danger" />
</HScroll>
```

### FilterChip + ChipRow

`FilterChip` is a pill toggle: quiet outline when off, solid fill when on
(`activeColor` navy default or accent red). Uses `aria-pressed`. `ChipRow` is a
horizontal scrollable row of chips. Props: `active`, `activeColor`, plus button
props.

### SearchBar

Rounded search input with a leading magnifier. `type="search"` with a visually
hidden label. Props: standard input props plus `label` and `containerClassName`.

### StatusBadge

Soft rounded status pill (the "Active" green badge). Tint plus same-hue text.

| Prop | Type | Notes |
| --- | --- | --- |
| `tone` | `"success" \| "danger" \| "warning" \| "info" \| "neutral" \| "accent"` | |
| `dot` | `boolean` | leading status dot |

```tsx
<StatusBadge tone="success" dot>Active</StatusBadge>
```

### ProgressBar

Horizontal track with an accent (or semantic) fill and an optional percentage
label. Value is clamped to 0-100 and exposed with `role="progressbar"`.

| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `number` | 0-100, clamped |
| `tone` | `"accent" \| "success" \| "warning" \| "danger"` | fill color |
| `showLabel` | `boolean` | show "NN%" |
| `label` | `ReactNode` | text above the track |

### SectionCard

White rounded card that groups content, with an optional title row and an
"expand" chevron that links deeper.

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `ReactNode` | optional header title |
| `action` | `ReactNode` | right-aligned header slot |
| `expandHref` | `string` | adds a chevron link in the header |
| `flush` | `boolean` | drop inner padding for edge-to-edge `ListRow` lists |

```tsx
<SectionCard title="Today" expandHref="/checklists" flush>
  <div className="divide-y divide-line">
    <ListRow icon={ClipboardCheck} title="Opening checklist" description="Due 9:00" href="/checklists/1" />
    <ListRow icon={ClipboardCheck} title="Temp log" description="Due 11:00" href="/checklists/2" />
  </div>
</SectionCard>
```

---

## Accessibility

- Buttons are `<button>`, links are `<a>` (via `next/link`). Icon-only controls
  carry an `aria-label`.
- Focus-visible shows a 2px accent ring (set globally in `globals.css`).
- State is never color-only: badges and toggles carry text or `aria` state.
- Keep the page body from scrolling sideways. Wide content (tables, scoreboards)
  scrolls inside its own `overflow-x-auto` container. `HScroll` does this for
  tile rows.

---

## Navigation source of truth

`lib/nav/page-map.ts` holds `NAV_GROUPS` (every route, grouped), `PRIMARY_TABS`
(Home / Team / Menu), `resolveHeader(pathname)` (header variant + title + back
target), and the avatar helpers `avatarColor` and `initialsFromName`. Add new
routes there so the sidebar, drawer, and headers pick them up automatically.
