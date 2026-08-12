/**
 * Generates `src/lib/supabase/database.types.ts` from the migrations —
 * no Docker, no linked cloud project.
 *
 * The Supabase CLI's own `gen types` shells out to a container even when given
 * `--db-url`, so it is unusable here. Instead we apply the migrations to PGlite
 * (WASM Postgres) and introspect the catalog directly, emitting the same
 * `Database` shape that `@supabase/supabase-js` expects: Tables (Row/Insert/
 * Update/Relationships), Views, Functions, Enums.
 *
 * Usage: npm run db:types
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildSchema, root } from './build-schema.mjs';

const OUT = path.join(root, 'src', 'lib', 'supabase', 'database.types.ts');

/** Postgres base type → TypeScript. Anything unmapped falls back to `unknown`. */
const SCALARS = {
  bool: 'boolean',
  bytea: 'string',
  char: 'string',
  name: 'string',
  int8: 'number',
  int2: 'number',
  int4: 'number',
  text: 'string',
  oid: 'number',
  json: 'Json',
  jsonb: 'Json',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  varchar: 'string',
  date: 'string',
  time: 'string',
  timetz: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  interval: 'string',
  uuid: 'string',
  citext: 'string',
  inet: 'string',
  tsvector: 'unknown',
  record: 'Record<string, unknown>',
  void: 'undefined',
};

const quoteKey = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key));

async function main() {
  const db = await buildSchema({ seed: false, quiet: true });

  // ── Enums ────────────────────────────────────────────────────────────────
  const { rows: enumRows } = await db.query(`
    select t.typname as name,
           array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname;
  `);
  const enumNames = new Set(enumRows.map((r) => r.name));

  /** @param {string} udt @param {boolean} isArray */
  const tsType = (udt, isArray) => {
    const base = enumNames.has(udt)
      ? `Database["public"]["Enums"][${JSON.stringify(udt)}]`
      : (SCALARS[udt] ?? 'unknown');
    return isArray ? `${base}[]` : base;
  };

  // ── Relations (tables + views) and their columns ─────────────────────────
  const { rows: relations } = await db.query(`
    select c.oid, c.relname as name, c.relkind as kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
    order by c.relname;
  `);

  const { rows: columns } = await db.query(`
    select
      a.attrelid                                as rel_oid,
      a.attname                                 as name,
      a.attnotnull                              as not_null,
      a.attidentity <> ''                       as is_identity,
      a.attgenerated <> ''                      as is_generated,
      pg_get_expr(d.adbin, d.adrelid) is not null as has_default,
      case when t.typcategory = 'A' then true else false end as is_array,
      coalesce(elem.typname, t.typname)         as udt
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    left join pg_type elem on elem.oid = t.typelem
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm')
      and a.attnum > 0
      and not a.attisdropped
    order by a.attrelid, a.attnum;
  `);

  const columnsByRel = new Map();
  for (const col of columns) {
    if (!columnsByRel.has(col.rel_oid)) columnsByRel.set(col.rel_oid, []);
    columnsByRel.get(col.rel_oid).push(col);
  }

  // ── Foreign keys → the `Relationships` array supabase-js uses to type joins ─
  const { rows: fks } = await db.query(`
    select
      con.conname                          as name,
      src.relname                          as table_name,
      tgt.relname                          as foreign_table,
      (select array_agg(att.attname order by u.ord)
         from unnest(con.conkey) with ordinality as u(attnum, ord)
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.attnum
      )                                    as columns,
      (select array_agg(att.attname order by u.ord)
         from unnest(con.confkey) with ordinality as u(attnum, ord)
         join pg_attribute att on att.attrelid = con.confrelid and att.attnum = u.attnum
      )                                    as foreign_columns,
      -- One-to-one when the referencing columns are themselves unique.
      exists (
        select 1 from pg_constraint u
        where u.conrelid = con.conrelid
          and u.contype in ('p', 'u')
          and u.conkey @> con.conkey and con.conkey @> u.conkey
      )                                    as is_one_to_one
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = src.relnamespace
    where con.contype = 'f' and n.nspname = 'public'
    order by src.relname, con.conname;
  `);

  const fksByTable = new Map();
  for (const fk of fks) {
    if (!fksByTable.has(fk.table_name)) fksByTable.set(fk.table_name, []);
    fksByTable.get(fk.table_name).push(fk);
  }

  // ── Functions ────────────────────────────────────────────────────────────
  const { rows: functions } = await db.query(`
    select
      p.proname                                   as name,
      p.proretset                                 as returns_set,
      rt.typname                                  as return_udt,
      rt.typcategory = 'A'                        as return_is_array,
      coalesce(relem.typname, rt.typname)         as return_elem_udt,
      retrel.relname                              as return_relation,
      p.pronargs                                  as nargs,
      p.pronargdefaults                           as ndefaults,
      coalesce(p.proargnames, '{}')               as arg_names,
      coalesce(p.proargmodes, '{}')               as arg_modes,
      (select array_agg(coalesce(aelem.typname, at.typname) order by u.ord)
         from unnest(p.proargtypes) with ordinality as u(oid, ord)
         join pg_type at on at.oid = u.oid
         left join pg_type aelem on aelem.oid = at.typelem and at.typcategory = 'A'
      )                                           as arg_udts,
      (select array_agg(at.typcategory = 'A' order by u.ord)
         from unnest(p.proargtypes) with ordinality as u(oid, ord)
         join pg_type at on at.oid = u.oid
      )                                           as arg_is_array,
      -- Set for RETURNS TABLE(...) / OUT parameters: every declared column.
      (select array_agg(coalesce(aelem.typname, at.typname) order by u.ord)
         from unnest(coalesce(p.proallargtypes, '{}')) with ordinality as u(oid, ord)
         join pg_type at on at.oid = u.oid
         left join pg_type aelem on aelem.oid = at.typelem and at.typcategory = 'A'
      )                                           as all_udts,
      (select array_agg(at.typcategory = 'A' order by u.ord)
         from unnest(coalesce(p.proallargtypes, '{}')) with ordinality as u(oid, ord)
         join pg_type at on at.oid = u.oid
      )                                           as all_is_array
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type rt on rt.oid = p.prorettype
    left join pg_type relem on relem.oid = rt.typelem and rt.typcategory = 'A'
    left join pg_class retrel on retrel.reltype = p.prorettype
    where n.nspname = 'public'
      and p.prokind = 'f'
      and rt.typname <> 'trigger'
    order by p.proname;
  `);

  // ── Emit ─────────────────────────────────────────────────────────────────
  const out = [];
  out.push('// Generated from supabase/migrations by `npm run db:types`. Do not edit by hand.');
  out.push('// Regenerate after every migration; the whole app compiles against this file.');
  out.push('');
  out.push('export type Json =');
  out.push('  | string');
  out.push('  | number');
  out.push('  | boolean');
  out.push('  | null');
  out.push('  | { [key: string]: Json | undefined }');
  out.push('  | Json[];');
  out.push('');
  out.push('export type Database = {');
  out.push('  public: {');

  const emitRelationships = (tableName, indent) => {
    const list = fksByTable.get(tableName) ?? [];
    if (list.length === 0) {
      out.push(`${indent}Relationships: [];`);
      return;
    }
    out.push(`${indent}Relationships: [`);
    for (const fk of list) {
      out.push(`${indent}  {`);
      out.push(`${indent}    foreignKeyName: ${JSON.stringify(fk.name)};`);
      out.push(`${indent}    columns: [${fk.columns.map((c) => JSON.stringify(c)).join(', ')}];`);
      out.push(`${indent}    isOneToOne: ${fk.is_one_to_one ? 'true' : 'false'};`);
      out.push(`${indent}    referencedRelation: ${JSON.stringify(fk.foreign_table)};`);
      out.push(
        `${indent}    referencedColumns: [${fk.foreign_columns.map((c) => JSON.stringify(c)).join(', ')}];`,
      );
      out.push(`${indent}  },`);
    }
    out.push(`${indent}];`);
  };

  const tables = relations.filter((r) => r.kind === 'r');
  const views = relations.filter((r) => r.kind !== 'r');

  // Tables
  out.push('    Tables: {');
  for (const rel of tables) {
    const cols = columnsByRel.get(rel.oid) ?? [];
    out.push(`      ${quoteKey(rel.name)}: {`);

    out.push('        Row: {');
    for (const c of cols) {
      const type = tsType(c.udt, c.is_array);
      out.push(`          ${quoteKey(c.name)}: ${type}${c.not_null ? '' : ' | null'};`);
    }
    out.push('        };');

    out.push('        Insert: {');
    for (const c of cols) {
      if (c.is_generated) continue;
      const type = tsType(c.udt, c.is_array);
      // A column is optional on insert when the database can fill it in.
      const optional = !c.not_null || c.has_default || c.is_identity;
      out.push(
        `          ${quoteKey(c.name)}${optional ? '?' : ''}: ${type}${c.not_null ? '' : ' | null'};`,
      );
    }
    out.push('        };');

    out.push('        Update: {');
    for (const c of cols) {
      if (c.is_generated) continue;
      const type = tsType(c.udt, c.is_array);
      out.push(`          ${quoteKey(c.name)}?: ${type}${c.not_null ? '' : ' | null'};`);
    }
    out.push('        };');

    emitRelationships(rel.name, '        ');
    out.push('      };');
  }
  out.push('    };');

  // Views
  out.push('    Views: {');
  for (const rel of views) {
    const cols = columnsByRel.get(rel.oid) ?? [];
    out.push(`      ${quoteKey(rel.name)}: {`);
    out.push('        Row: {');
    for (const c of cols) {
      // Postgres cannot prove not-null through a view, so every column is nullable.
      out.push(`          ${quoteKey(c.name)}: ${tsType(c.udt, c.is_array)} | null;`);
    }
    out.push('        };');
    out.push('        Relationships: [];');
    out.push('      };');
  }
  out.push('    };');

  // Functions
  out.push('    Functions: {');
  for (const fn of functions) {
    const names = fn.arg_names ?? [];
    const modes = fn.arg_modes ?? [];
    const inUdts = fn.arg_udts ?? [];
    const inIsArray = fn.arg_is_array ?? [];
    const allUdts = fn.all_udts ?? [];
    const allIsArray = fn.all_is_array ?? [];
    const firstDefaulted = fn.nargs - fn.ndefaults;

    // With OUT/TABLE columns present, `proallargtypes` holds inputs *and*
    // outputs and `proargmodes` says which is which. Without it, every entry
    // in `proargtypes` is an input.
    const hasModes = modes.length > 0 && allUdts.length > 0;
    const inputs = [];
    const outputs = [];

    if (hasModes) {
      allUdts.forEach((udt, i) => {
        const entry = { name: names[i], udt, isArray: allIsArray[i] };
        if (modes[i] === 't' || modes[i] === 'o') outputs.push(entry);
        else inputs.push(entry);
      });
    } else {
      inUdts.forEach((udt, i) => inputs.push({ name: names[i], udt, isArray: inIsArray[i] }));
    }

    out.push(`      ${quoteKey(fn.name)}: {`);
    if (inputs.length === 0) {
      out.push('        Args: Record<PropertyKey, never>;');
    } else {
      out.push('        Args: {');
      inputs.forEach((arg, i) => {
        const argName = arg.name || `arg${i + 1}`;
        const optional = i >= firstDefaulted;
        out.push(
          `          ${quoteKey(argName)}${optional ? '?' : ''}: ${tsType(arg.udt, arg.isArray)};`,
        );
      });
      out.push('        };');
    }

    if (outputs.length > 0) {
      // RETURNS TABLE(...) — emit the row shape inline.
      out.push('        Returns: {');
      outputs.forEach((col, i) => {
        out.push(
          `          ${quoteKey(col.name || `column${i + 1}`)}: ${tsType(col.udt, col.isArray)} | null;`,
        );
      });
      out.push(`        }${fn.returns_set ? '[]' : ''};`);
    } else {
      const returns = fn.return_relation
        ? `Database["public"]["${tables.some((t) => t.name === fn.return_relation) ? 'Tables' : 'Views'}"][${JSON.stringify(fn.return_relation)}]["Row"]`
        : tsType(fn.return_elem_udt, fn.return_is_array);
      out.push(`        Returns: ${returns}${fn.returns_set ? '[]' : ''};`);
    }
    out.push('      };');
  }
  out.push('    };');

  // Enums
  out.push('    Enums: {');
  for (const e of enumRows) {
    out.push(`      ${quoteKey(e.name)}: ${e.labels.map((l) => JSON.stringify(l)).join(' | ')};`);
  }
  out.push('    };');

  out.push('    CompositeTypes: Record<PropertyKey, never>;');
  out.push('  };');
  out.push('};');
  out.push('');

  // Convenience aliases so feature code never spells the deep path out.
  out.push('type PublicSchema = Database["public"];');
  out.push('');
  out.push('export type Tables<T extends keyof PublicSchema["Tables"]> =');
  out.push('  PublicSchema["Tables"][T]["Row"];');
  out.push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> =');
  out.push('  PublicSchema["Tables"][T]["Insert"];');
  out.push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =');
  out.push('  PublicSchema["Tables"][T]["Update"];');
  out.push('export type Views<T extends keyof PublicSchema["Views"]> =');
  out.push('  PublicSchema["Views"][T]["Row"];');
  out.push('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];');
  out.push('export type FunctionArgs<T extends keyof PublicSchema["Functions"]> =');
  out.push('  PublicSchema["Functions"][T]["Args"];');
  out.push('export type FunctionReturns<T extends keyof PublicSchema["Functions"]> =');
  out.push('  PublicSchema["Functions"][T]["Returns"];');
  out.push('');

  await writeFile(OUT, out.join('\n'), 'utf8');
  await db.close();

  console.log(
    `· wrote ${path.relative(root, OUT)} — ${tables.length} tables, ${views.length} views, ` +
      `${functions.length} functions, ${enumRows.length} enums`,
  );
}

await main();
