import { supabase } from './supabase';
import { exportDateiname } from './datenpflege';

// Holt den Export und gibt ihn dem Browser als Datei. Rueckgabe: Fehlertext
// oder null.
export async function exportHerunterladen(vereinId: string, slug: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('verein_export', { p_verein: vereinId });
  if (error || !data) return error?.message ?? 'Kein Export erhalten.';
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportDateiname(slug, new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
