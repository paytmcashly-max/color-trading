import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";

export function AdminMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted">{label}</p>
          <div className="mt-2 text-2xl font-extrabold">{value}</div>
          {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
        </div>
        {icon ? <span className="grid size-10 place-items-center rounded-md bg-[#edf4ef] text-ink">{icon}</span> : null}
      </div>
    </Card>
  );
}
