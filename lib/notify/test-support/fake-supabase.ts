/**
 * A minimal in-memory fake of the subset of the Supabase query builder that
 * lib/notify and lib/discord actually call (`select/eq/ilike/contains/in/is/
 * order/limit/or/maybeSingle/insert/upsert/update/delete`). Not a
 * general-purpose Supabase mock — just enough surface, with real filtering
 * semantics, to unit-test this stream's idempotency, cursor paging, and
 * retry/backoff logic without a live database. Test-only; not imported by any
 * production code.
 */
export type FakeRow = Record<string, unknown>;

function getPath(row: FakeRow, col: string): unknown {
  return row[col];
}

/** Splits a PostgREST filter list on top-level commas, respecting `and(...)`/`or(...)` groups. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

/** Parses one `col.op.val` PostgREST clause into a row predicate. */
function parseClause(clause: string): (row: FakeRow) => boolean {
  const firstDot = clause.indexOf(".");
  const secondDot = clause.indexOf(".", firstDot + 1);
  const col = clause.slice(0, firstDot);
  const op = clause.slice(firstDot + 1, secondDot);
  const val = clause.slice(secondDot + 1);
  return (row) => {
    const v = getPath(row, col);
    switch (op) {
      case "is":
        return val === "null" ? v == null : String(v) === val;
      case "eq":
        return String(v) === val;
      case "gt":
        return v != null && String(v) > val;
      case "gte":
        return v != null && String(v) >= val;
      case "lt":
        return v != null && String(v) < val;
      case "lte":
        return v != null && String(v) <= val;
      default:
        return false;
    }
  };
}

class FakeQuery {
  private rows: FakeRow[];
  private predicates: Array<(row: FakeRow) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private limitN: number | null = null;

  constructor(rows: FakeRow[]) {
    this.rows = rows;
  }

  select(): this {
    return this;
  }

  eq(col: string, value: unknown): this {
    this.predicates.push((row) => getPath(row, col) === value);
    return this;
  }

  ilike(col: string, pattern: string): this {
    const needle = pattern.replace(/^%/, "").replace(/%$/, "");
    this.predicates.push((row) => {
      const value = getPath(row, col);
      return typeof value === "string" && value.includes(needle);
    });
    return this;
  }

  contains(col: string, obj: FakeRow): this {
    this.predicates.push((row) => {
      const value = getPath(row, col) as FakeRow | undefined;
      if (!value) return false;
      return Object.entries(obj).every(([k, v]) => value[k] === v);
    });
    return this;
  }

  in(col: string, values: unknown[]): this {
    this.predicates.push((row) => values.includes(getPath(row, col)));
    return this;
  }

  is(col: string, value: unknown): this {
    this.predicates.push((row) => getPath(row, col) === value);
    return this;
  }

  gt(col: string, value: unknown): this {
    this.predicates.push((row) => {
      const v = getPath(row, col);
      return v != null && String(v) > String(value);
    });
    return this;
  }

  order(col?: string, opts?: { ascending?: boolean }): this {
    if (col) this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  /**
   * Real OR semantics: a comma-separated list of clauses (a row passes if ANY
   * matches), where a clause is either `col.op.val` or a nested
   * `and(col.op.val,col.op.val)` group (all must match). Enough to exercise
   * the outbox due-time filter and the event-drain keyset cursor.
   */
  or(filter: string): this {
    const clauses = splitTopLevel(filter).map((token) => {
      const t = token.trim();
      if (t.startsWith("and(") && t.endsWith(")")) {
        const subs = splitTopLevel(t.slice(4, -1)).map(parseClause);
        return (row: FakeRow) => subs.every((p) => p(row));
      }
      return parseClause(t);
    });
    this.predicates.push((row) => clauses.some((p) => p(row)));
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private filtered(): FakeRow[] {
    let rows = this.rows.filter((row) => this.predicates.every((p) => p(row)));
    if (this.orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { col, asc } of this.orders) {
          const av = a[col];
          const bv = b[col];
          if (av === bv) continue;
          if (av == null) return asc ? -1 : 1;
          if (bv == null) return asc ? 1 : -1;
          const cmp = av < bv ? -1 : 1;
          return asc ? cmp : -cmp;
        }
        return 0;
      });
    }
    return this.limitN != null ? rows.slice(0, this.limitN) : rows;
  }

  async maybeSingle(): Promise<{ data: FakeRow | null; error: null }> {
    const rows = this.filtered();
    return { data: rows[0] ?? null, error: null };
  }

  // Makes `await client.from(...).select(...).eq(...)` work without an
  // explicit `.maybeSingle()`/terminal call, matching real supabase-js.
  then<TResult1 = { data: FakeRow[]; error: null }>(
    onfulfilled?: ((value: { data: FakeRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): Promise<TResult1> {
    const result = { data: this.filtered(), error: null } as const;
    return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1));
  }
}

class FakeMutation {
  constructor(
    private rows: FakeRow[],
    private apply: (row: FakeRow) => void,
  ) {}

  eq(col: string, value: unknown): Promise<{ data: null; error: null }> {
    for (const row of this.rows) {
      if (getPath(row, col) === value) {
        this.apply(row);
      }
    }
    return Promise.resolve({ data: null, error: null });
  }
}

class FakeDelete {
  constructor(private table: FakeTable) {}

  eq(col: string, value: unknown): Promise<{ data: null; error: null }> {
    this.table.rows = this.table.rows.filter((row) => getPath(row, col) !== value);
    return Promise.resolve({ data: null, error: null });
  }
}

export class FakeTable {
  rows: FakeRow[];

  constructor(rows: FakeRow[] = []) {
    this.rows = rows;
  }

  select(): FakeQuery {
    return new FakeQuery(this.rows);
  }

  insert(values: FakeRow): { then: Promise<{ data: null; error: null }>["then"] } {
    const row: FakeRow = { id: `fake-${this.rows.length + 1}`, created_at: new Date().toISOString(), ...values };
    this.rows.push(row);
    const promise = Promise.resolve({ data: null, error: null });
    return { then: promise.then.bind(promise) };
  }

  upsert(
    values: FakeRow,
    opts?: { onConflict?: string },
  ): { then: Promise<{ data: null; error: null }>["then"] } {
    const conflictCol = opts?.onConflict;
    if (conflictCol) {
      const existing = this.rows.find((r) => getPath(r, conflictCol) === values[conflictCol]);
      if (existing) {
        Object.assign(existing, values);
        const promise = Promise.resolve({ data: null, error: null });
        return { then: promise.then.bind(promise) };
      }
    }
    const row: FakeRow = { id: `fake-${this.rows.length + 1}`, created_at: new Date().toISOString(), ...values };
    this.rows.push(row);
    const promise = Promise.resolve({ data: null, error: null });
    return { then: promise.then.bind(promise) };
  }

  update(patch: FakeRow): FakeMutation {
    return new FakeMutation(this.rows, (row) => Object.assign(row, patch));
  }

  delete(): FakeDelete {
    return new FakeDelete(this);
  }
}

export class FakeSupabase {
  private tables = new Map<string, FakeTable>();

  constructor(seed: Record<string, FakeRow[]> = {}) {
    for (const [name, rows] of Object.entries(seed)) {
      this.tables.set(name, new FakeTable(rows));
    }
  }

  from(name: string): FakeTable {
    let table = this.tables.get(name);
    if (!table) {
      table = new FakeTable([]);
      this.tables.set(name, table);
    }
    return table;
  }

  rowsOf(name: string): FakeRow[] {
    return this.from(name).rows;
  }
}
