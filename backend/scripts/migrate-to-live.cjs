/**
 * One-off migration: copies ALL rows from the local dev Postgres
 * (postgres:adi@localhost:5432/kaamwala) into the live Supabase database.
 *
 * Prerequisites: the schema must already exist on the target (see README / the
 * two commands in the migration notes). Run from the backend/ folder:
 *
 *   node scripts/migrate-to-live.cjs
 *
 * Overrides (optional env vars):
 *   SOURCE_DATABASE_URL  – where to read rows  (default: local kaamwala)
 *   TARGET_DATABASE_URL  – where to write rows (default: Supabase session pooler, port 5432)
 *
 * Notes:
 *   - All 58 models use String @id @default(cuid()), so IDs are preserved and
 *     there are no Postgres sequences to reset.
 *   - Models are loaded in FK dependency order (parents before children).
 *   - Each table is inserted in a single createMany call, so self-referencing
 *     rows satisfy their own foreign keys.
 *   - The Prisma DMMF does NOT expose `relationFrom` for object fields, so FK
 *     parents are detected via a non-empty `relationFromFields` (the scalar FK
 *     columns) — this excludes the non-FK side of 1:1 relations, which would
 *     otherwise form cycles. A greedy topo-sort then loads parents first.
 */
require("dotenv").config({ path: ".env" });
const { PrismaClient, Prisma } = require("@prisma/client");

const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ||
  "postgresql://postgres:adi@localhost:5432/kaamwala";

// Session-mode pooler (port 5432) — transaction pooler on 6543 can hang on DDL,
// and while simple inserts are fine, 5432 is the safe default for the copy too.
// Matches the Supabase project that backend/.env DATABASE_URL points at.
const TARGET_URL =
  process.env.TARGET_DATABASE_URL ||
  "postgresql://postgres.sgaqtwxwljmpzkyulvaq:Adihipbhat@1729@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

const accessor = (name) => name[0].toLowerCase() + name.slice(1);

(async () => {
  const source = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
  const target = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });

  const models = Prisma.dmmf.datamodel.models;

  // modelName -> set of models it holds an FK to (relation fields from "one")
  const deps = new Map();
  for (const m of models) {
    const refs = new Set();
    for (const f of m.fields) {
      // DMMF object fields don't reliably carry `relationFrom`, and isReadOnly
      // is false even on non-FK sides, so the FK holder is identified by its
      // scalar `relationFromFields` (the FK columns). A 1:1 side without the FK
      // has an empty relationFromFields and must NOT count as a dependency
      // (User/CustomerProfile would otherwise form a cycle and block the sort).
      if (
        f.kind === "object" &&
        Array.isArray(f.relationFromFields) &&
        f.relationFromFields.length > 0
      ) {
        refs.add(f.type);
      }
    }
    deps.set(m.name, refs);
  }

  // Topological sort: load parents before children.
  const done = new Set();
  const order = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const m of models) {
      if (done.has(m.name)) continue;
      if ([...deps.get(m.name)].every((d) => done.has(d))) {
        order.push(m.name);
        done.add(m.name);
        progressed = true;
      }
    }
  }
  const unresolved = models.map((m) => m.name).filter((n) => !done.has(n));
  if (unresolved.length) {
    console.warn("Cyclic relations, loading after first pass:", unresolved.join(", "));
    order.push(...unresolved);
  }

  const summary = [];
  for (const name of order) {
    const acc = accessor(name);
    try {
      const rows = await source[acc].findMany();
      if (rows.length === 0) {
        summary.push(`${name}: 0 (empty)`);
        continue;
      }
      await target[acc].createMany({ data: rows });
      summary.push(`${name}: ${rows.length} copied`);
    } catch (e) {
      summary.push(`${name}: FAILED -> ${(e.message || "").split("\n")[0].slice(0, 140)}`);
    }
  }

  console.log("\n=== MIGRATION SUMMARY ===");
  console.log(summary.join("\n"));

  console.log("\n=== VERIFY (source vs target) ===");
  let mismatches = 0;
  for (const name of order) {
    const acc = accessor(name);
    try {
      const s = await source[acc].count();
      const t = await target[acc].count();
      const ok = s === t;
      if (!ok) mismatches++;
      console.log(`${ok ? "OK  " : "MISMATCH"} ${name}: local=${s} live=${t}`);
    } catch (e) {
      console.log(`ERROR ${name}: ${(e.message || "").split("\n")[0].slice(0, 100)}`);
    }
  }
  console.log(mismatches === 0 ? "\nAll tables match ✔" : `\n${mismatches} table(s) do NOT match — investigate above`);

  await source.$disconnect();
  await target.$disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
