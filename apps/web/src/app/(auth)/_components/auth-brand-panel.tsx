import { ArrowUpRight, CheckCircle2, Compass } from 'lucide-react';
import { cn } from '@pusula/ui';

export function AuthBrandPanel({ className }: { className?: string }) {
  return (
    <aside
      aria-hidden="true"
      className={cn(
        'bg-primary text-primary-foreground relative isolate hidden overflow-hidden lg:flex',
        className,
      )}
      style={{
        backgroundImage:
          'radial-gradient(at 20% 10%, color-mix(in oklch, var(--primary) 65%, white) 0%, transparent 55%), radial-gradient(at 80% 90%, color-mix(in oklch, var(--primary) 80%, black) 0%, transparent 60%), linear-gradient(135deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 70%, black) 100%)',
      }}
    >
      <div className="relative z-10 flex h-full w-full flex-col justify-between p-10 xl:p-14">
        <header className="flex items-center gap-2 text-sm/none font-medium opacity-80">
          <Compass className="size-5" aria-hidden />
          <span>Pusula · Görev ve Pano Yönetimi</span>
        </header>

        <div className="flex flex-col gap-6">
          <h2 className="text-4xl/[1.05] font-semibold tracking-tight xl:text-5xl/[1.05]">
            Ekibinizin işlerini
            <br />
            <span className="italic opacity-90">tek yönde</span> toplayın.
          </h2>
          <p className="max-w-md text-sm/relaxed opacity-80 xl:text-base/relaxed">
            Workspace, pano ve kart akışlarını tek ekranda yönetin. Yetki, takip
            ve bildirimler her ekip için açık, hızlı ve tutarlı kalsın.
          </p>
          <ul className="flex flex-col gap-2 text-sm opacity-90">
            {ADVANTAGES.map((advantage) => (
              <li key={advantage} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
                <span>{advantage}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <SummaryCard />
          <p className="text-xs opacity-60">
            Pusula ekiplerin plan, takip ve karar akışını aynı yerde toplar.
          </p>
        </div>
      </div>
    </aside>
  );
}

const ADVANTAGES = [
  'Workspace bazlı yetki ve ekip düzeni',
  'Mobil uyumlu kanban panoları',
  'Bildirimler ve aktivite geçmişiyle görünür takip',
] as const;

function SummaryCard() {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-[0_20px_40px_-20px_rgb(0_0_0_/_0.5)] backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider opacity-60">Aktif Pano</p>
          <p className="mt-0.5 text-base font-medium">Ürün Yol Haritası</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] opacity-90">
          <ArrowUpRight className="size-3" aria-hidden />
          Devam ediyor
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Metric title="Açık kart" value="24" />
        <Metric title="Bu hafta" value="7" />
        <Metric title="Ekip" value="12" />
      </dl>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2.5">
      <dt className="text-[11px] opacity-60">{title}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
