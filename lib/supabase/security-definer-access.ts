/**
 * Static audit of `supabase/migrations/*.sql` for privileged database objects:
 * SECURITY DEFINER functions and views that bypass the caller's RLS.
 *
 * Why this exists: Postgres grants EXECUTE on every new function to PUBLIC, and
 * Supabase also grants it to `anon` and `authenticated` by default. A
 * SECURITY DEFINER function therefore stays callable by logged-out clients
 * unless a migration revokes it. The test in `security-definer-access.test.ts`
 * replays every migration through this module so a new definer function that
 * ships without a revoke fails CI, instead of passing a check that only knows
 * the names that were fixed once.
 *
 * Pure and fs-free so it can be unit tested with in-memory migrations. This is
 * a statement-level scanner, not a SQL parser. It replays, in filename order:
 *
 *   - create [or replace] function / alter function ... security definer|invoker
 *   - create [or replace] [materialized] view (definer unless security_invoker)
 *   - drop function / drop view
 *   - revoke / grant ... on function, and revoke / grant ... on [table] <view>
 *
 * Known limits, all of which fail closed (an unrecognised form is reported as a
 * missing revoke, never silently accepted):
 *   - Blanket forms such as `revoke ... on all functions in schema public` are
 *     not recognised. Revoke each function by name.
 *   - SQL built inside `execute format(...)` or a DO block is invisible.
 *   - Overloads are told apart by name and IN-argument count, not by type.
 *   - `alter view ... set (security_invoker = ...)` is not replayed.
 */

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface SecurityObject {
  kind: "function" | "view";
  /** Lowercase and schema-qualified, for example `public.has_permission`. */
  name: string;
  /** Count of IN arguments. Functions only. */
  arity?: number;
  /** Latest definition is SECURITY DEFINER (functions) or lacks security_invoker (views). */
  definer: boolean;
  returnsTrigger: boolean;
  /** The statement that last defined or altered the object. */
  definedAt: { file: string; line: number };
  /** REVOKE ... FROM PUBLIC has run since the object was created. */
  revokedFromPublic: boolean;
  /** REVOKE ... FROM anon has run since the object was created. */
  revokedFromAnon: boolean;
  /** An explicit GRANT to authenticated stands (not revoked afterwards). */
  grantedToAuthenticated: boolean;
}

interface Statement {
  text: string;
  line: number;
}

/**
 * Split SQL into top-level statements. Comments are dropped, single-quoted
 * strings and "quoted identifiers" are kept whole, and dollar-quoted bodies
 * ($$ ... $$ or $tag$ ... $tag$) are replaced by an empty `$$ $$`, so a
 * semicolon, comment marker or the words "security definer" inside a body can
 * never be mistaken for statement syntax.
 */
export function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  const dollarTag = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;
  let buf = "";
  let start = -1;
  let i = 0;

  const lineOf = (index: number) => {
    let line = 1;
    for (let k = 0; k < index; k++) if (sql.charCodeAt(k) === 10) line++;
    return line;
  };
  const flush = () => {
    const text = buf.trim();
    if (text && start >= 0) statements.push({ text, line: lineOf(start) });
    buf = "";
    start = -1;
  };
  const mark = (index: number) => {
    if (start < 0) start = index;
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      buf += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      buf += " ";
      continue;
    }
    if (ch === "'") {
      // E'...' strings also honour backslash escapes.
      const prev = sql[i - 1];
      const escapeString =
        (prev === "e" || prev === "E") && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? " ");
      const from = i;
      i++;
      while (i < sql.length) {
        if (escapeString && sql[i] === "\\") {
          i += 2;
        } else if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      mark(from);
      buf += sql.slice(from, i);
      continue;
    }
    if (ch === '"') {
      const from = i;
      i++;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
        } else if (sql[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      mark(from);
      buf += sql.slice(from, i);
      continue;
    }
    if (ch === "$") {
      dollarTag.lastIndex = i;
      const tag = dollarTag.exec(sql);
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        mark(i);
        buf += "$$ $$";
        i = close === -1 ? sql.length : close + tag[0].length;
        continue;
      }
    }
    if (ch === ";") {
      flush();
      i++;
      continue;
    }
    if (!/\s/.test(ch)) mark(i);
    buf += ch;
    i++;
  }
  flush();
  return statements;
}

const IDENT = `(?:"[^"]+"|[a-z_][a-z0-9_$]*)`;
const QNAME = `${IDENT}(?:\\.${IDENT})?`;

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const blankStrings = (s: string) => s.replace(/'(?:[^']|'')*'/g, "''");

function qualify(raw: string): string {
  const parts = raw.split(".").map((p) => p.replace(/"/g, ""));
  return parts.length === 1 ? `public.${parts[0]}` : parts.join(".");
}

/** Split on a separator that is outside parentheses and single quotes. */
function splitTopLevel(text: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") quoted = !quoted;
    else if (quoted) continue;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Contents of the parenthesis group that opens at `open`, and where it ends. */
function readParenGroup(text: string, open: number): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** IN-argument count of a function argument list. OUT arguments are not part of the identity. */
function countArgs(inner: string): number {
  return splitTopLevel(inner).filter((arg) => !/^out\s/.test(arg)).length;
}

interface FunctionRef {
  name: string;
  /** Undefined when the statement named the function without an argument list. */
  arity?: number;
}

function parseFunctionRefs(list: string): FunctionRef[] {
  const refs: FunctionRef[] = [];
  for (const part of splitTopLevel(list)) {
    const m = new RegExp(`^(${QNAME})(?: ?\\((.*)\\))?$`).exec(part);
    if (!m) continue;
    refs.push({ name: qualify(m[1]), arity: m[2] === undefined ? undefined : countArgs(m[2]) });
  }
  return refs;
}

const CREATE_FUNCTION = new RegExp(`^create (?:or replace )?function (${QNAME}) ?\\(`);
const ALTER_FUNCTION = new RegExp(`^alter function (${QNAME}) ?\\(`);
const DROP_FUNCTION = /^drop function (?:if exists )?(.+?)(?: cascade| restrict)?$/;
const CREATE_VIEW = new RegExp(
  `^create (?:or replace )?(?:recursive )?(?:materialized )?view (?:if not exists )?(${QNAME})`,
);
const DROP_VIEW = /^drop (?:materialized )?view (?:if exists )?(.+?)(?: cascade| restrict)?$/;
const FUNCTION_ACL =
  /^(revoke|grant) (?:grant option for )?(.+?) on (?:function|routine) (.+?) (?:from|to) (.+?)(?: with grant option| cascade| restrict)?$/;
// Everything that can follow `on` other than a table or view name.
const NON_TABLE_ACL_TARGETS =
  "functions? |routines? |procedures? |sequences? |schema |database |type |domain |language |all |large |foreign |parameter |tablespace ";
const TABLE_ACL = new RegExp(
  `^(revoke|grant) (?:grant option for )?(.+?) on (?!(?:${NON_TABLE_ACL_TARGETS}))(?:table )?(.+?) (?:from|to) (.+?)(?: with grant option| cascade| restrict)?$`,
);

/** `security_invoker` present and not explicitly switched off. */
const invokerEnabled = (options: string) =>
  /\bsecurity_invoker\b/.test(options) && !/\bsecurity_invoker\s*=\s*'?(?:false|off|0)'?/.test(options);

function newObject(
  kind: SecurityObject["kind"],
  name: string,
  arity: number | undefined,
  definer: boolean,
  returnsTrigger: boolean,
  definedAt: SecurityObject["definedAt"],
): SecurityObject {
  return {
    kind,
    name,
    arity,
    definer,
    returnsTrigger,
    definedAt,
    revokedFromPublic: false,
    revokedFromAnon: false,
    grantedToAuthenticated: false,
  };
}

function applyAcl(
  targets: SecurityObject[],
  verb: string,
  grantees: string[],
): void {
  for (const object of targets) {
    for (const grantee of grantees) {
      const revoke = verb === "revoke";
      if (grantee === "public") object.revokedFromPublic = revoke;
      else if (grantee === "anon") object.revokedFromAnon = revoke;
      else if (grantee === "authenticated") object.grantedToAuthenticated = !revoke;
    }
  }
}

const parseGrantees = (list: string) =>
  splitTopLevel(list).map((g) => g.replace(/^group /, "").replace(/"/g, ""));

function applyStatement(
  objects: Map<string, SecurityObject>,
  file: string,
  statement: Statement,
): void {
  const t = squash(statement.text);
  const at = { file, line: statement.line };
  const find = (kind: SecurityObject["kind"], ref: FunctionRef) =>
    [...objects.values()].filter(
      (o) =>
        o.kind === kind && o.name === ref.name && (ref.arity === undefined || o.arity === ref.arity),
    );

  const createFunction = CREATE_FUNCTION.exec(t);
  if (createFunction) {
    const text = blankStrings(t);
    const group = readParenGroup(text, createFunction[0].length - 1);
    if (!group) return;
    const name = qualify(createFunction[1]);
    const arity = countArgs(group.inner);
    const rest = text.slice(group.end + 1);
    const definer = /\bsecurity definer\b/.test(rest);
    const returnsTrigger = /\breturns trigger\b/.test(rest);
    const key = `function:${name}/${arity}`;
    const existing = objects.get(key);
    if (existing && t.startsWith("create or replace ")) {
      // Replacing a function keeps its privileges; only the definition changes.
      existing.definer = definer;
      existing.returnsTrigger = returnsTrigger;
      existing.definedAt = at;
    } else {
      objects.set(key, newObject("function", name, arity, definer, returnsTrigger, at));
    }
    return;
  }

  const alterFunction = ALTER_FUNCTION.exec(t);
  if (alterFunction) {
    const text = blankStrings(t);
    const group = readParenGroup(text, alterFunction[0].length - 1);
    if (!group) return;
    const rest = text.slice(group.end + 1);
    const ref = { name: qualify(alterFunction[1]), arity: countArgs(group.inner) };
    for (const object of find("function", ref)) {
      if (/\bsecurity definer\b/.test(rest)) object.definer = true;
      else if (/\bsecurity invoker\b/.test(rest)) object.definer = false;
      else continue;
      object.definedAt = at;
    }
    return;
  }

  const dropFunction = DROP_FUNCTION.exec(t);
  if (dropFunction) {
    for (const ref of parseFunctionRefs(dropFunction[1])) {
      for (const object of find("function", ref)) {
        objects.delete(`function:${object.name}/${object.arity}`);
      }
    }
    return;
  }

  const createView = CREATE_VIEW.exec(t);
  if (createView) {
    const name = qualify(createView[1]);
    const head = t.slice(createView[0].length).split(/\bas\b/, 1)[0];
    const key = `view:${name}`;
    const definer = !invokerEnabled(head);
    const existing = objects.get(key);
    if (existing && t.startsWith("create or replace ")) {
      existing.definer = definer;
      existing.definedAt = at;
    } else {
      objects.set(key, newObject("view", name, undefined, definer, false, at));
    }
    return;
  }

  const dropView = DROP_VIEW.exec(t);
  if (dropView) {
    for (const part of splitTopLevel(dropView[1])) objects.delete(`view:${qualify(part)}`);
    return;
  }

  const functionAcl = FUNCTION_ACL.exec(t);
  if (functionAcl) {
    const privileges = splitTopLevel(functionAcl[2]);
    if (!privileges.some((p) => p === "all" || p === "all privileges" || p === "execute")) return;
    const targets = parseFunctionRefs(functionAcl[3]).flatMap((ref) => find("function", ref));
    applyAcl(targets, functionAcl[1], parseGrantees(functionAcl[4]));
    return;
  }

  const tableAcl = TABLE_ACL.exec(t);
  if (tableAcl) {
    const privileges = splitTopLevel(tableAcl[2]);
    if (!privileges.some((p) => p === "all" || p === "all privileges" || p === "select")) return;
    const targets = splitTopLevel(tableAcl[3]).flatMap((part) =>
      find("view", { name: qualify(part) }),
    );
    applyAcl(targets, tableAcl[1], parseGrantees(tableAcl[4]));
  }
}

/**
 * Replay migrations in filename (timestamp) order and return every function and
 * view that exists afterwards, with its latest definition and the privilege
 * changes made since it was last created. A `drop` followed by a `create` starts
 * a fresh object (default privileges again); `create or replace` keeps the
 * existing object's privileges, as Postgres does.
 */
export function analyzeSecurityObjects(files: MigrationFile[]): SecurityObject[] {
  const objects = new Map<string, SecurityObject>();
  const ordered = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const file of ordered) {
    for (const statement of splitStatements(file.sql)) {
      applyStatement(objects, file.name, statement);
    }
  }
  return [...objects.values()];
}

const describeObject = (o: SecurityObject) =>
  o.kind === "view" ? `view ${o.name}` : `${o.name}(${o.arity} arg${o.arity === 1 ? "" : "s"})`;

/**
 * Problems for every privileged object that is still reachable by logged-out
 * clients. A SECURITY DEFINER function must be revoked from PUBLIC and from
 * `anon`; a definer view must be revoked from `anon` (Supabase grants new views
 * to anon directly, PUBLIC has no default grant on them).
 *
 * `anonCallable` names objects that are deliberately left callable by anon.
 * It skips only the anon requirement, and an entry that no longer matches a
 * still-anon-callable definer function is itself reported, so the list cannot
 * rot.
 */
export function findProtectionGaps(
  objects: SecurityObject[],
  anonCallable: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  for (const object of objects) {
    if (!object.definer) continue;
    const missing: string[] = [];
    if (object.kind === "function" && !object.revokedFromPublic) missing.push("public");
    if (!object.revokedFromAnon && !anonCallable.includes(object.name)) missing.push("anon");
    if (missing.length > 0) {
      problems.push(
        `${describeObject(object)} is SECURITY DEFINER (latest definition at ` +
          `${object.definedAt.file}:${object.definedAt.line}) but no revoke from ` +
          `${missing.join(" and ")} follows its creation`,
      );
    }
  }
  for (const name of anonCallable) {
    const stillCallable = objects.some(
      (o) => o.definer && o.name === name && !o.revokedFromAnon,
    );
    if (!stillCallable) {
      problems.push(
        `allowlist entry ${name} is stale: no SECURITY DEFINER object by that name is ` +
          `left callable by anon, so remove it from the allowlist`,
      );
    }
  }
  return problems;
}

/**
 * Problems for functions that must stay callable by signed-in users (RPCs the
 * app calls, RLS helpers) but have no standing GRANT EXECUTE to `authenticated`.
 * `names` are unqualified public-schema function names.
 */
export function findMissingAuthenticatedGrants(
  objects: SecurityObject[],
  names: readonly string[],
): string[] {
  const problems: string[] = [];
  for (const name of names) {
    const matches = objects.filter((o) => o.kind === "function" && o.name === `public.${name}`);
    if (matches.length === 0) {
      problems.push(`public.${name} is expected but no migration defines it`);
      continue;
    }
    for (const object of matches) {
      if (!object.grantedToAuthenticated) {
        problems.push(
          `${describeObject(object)} (${object.definedAt.file}:${object.definedAt.line}) ` +
            `has no grant execute to authenticated`,
        );
      }
    }
  }
  return problems;
}
