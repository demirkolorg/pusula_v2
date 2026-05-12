import { Button } from '@pusula/ui';
import { ApiStatus } from '@/components/api-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pusula</h1>
        <p className="text-muted-foreground">
          Trello benzeri görev yönetimi — v2 monorepo iskeleti ayakta. Sıradaki adım: Faz 1
          (auth + workspace).
        </p>
      </div>

      <ApiStatus />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button>Birincil</Button>
        <Button variant="outline">İkincil</Button>
        <Button variant="ghost">Hayalet</Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Mimari: <code>docs/PUSULA_TEKNIK_MIMARI.md</code> · Kurallar (skill):{' '}
        <code>.claude/skills/kontrol/SKILL.md</code>
      </p>
    </main>
  );
}
