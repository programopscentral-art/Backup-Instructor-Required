import { createAuthedClient } from "@/lib/supabase/server";

interface Named {
  id: string;
  name: string;
}
interface Ref {
  options: { value: string; label: string }[];
  map: Record<string, string>;
}

function toRef(arr: Named[] | null): Ref {
  const rows = arr ?? [];
  return {
    options: rows.map((x) => ({ value: x.id, label: x.name })),
    map: Object.fromEntries(rows.map((x) => [x.id, x.name])),
  };
}

/** Fetches the shared FK reference lists (universities, subjects, capabilities). */
export async function getRefs() {
  const supabase = await createAuthedClient();
  const [{ data: u }, { data: s }, { data: c }] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("capabilities").select("id, name").order("name"),
  ]);
  return {
    universities: toRef(u as Named[] | null),
    subjects: toRef(s as Named[] | null),
    capabilities: toRef(c as Named[] | null),
  };
}
