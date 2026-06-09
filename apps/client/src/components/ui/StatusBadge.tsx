export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "OPEN"
      ? "bg-[#dff4e8] text-[#0f5b38]"
      : status === "LOCKED" || status === "RESOLVING"
        ? "bg-[#fff2cc] text-[#7a4a00]"
        : "bg-[#e8edf2] text-[#334155]";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold uppercase ${tone}`}>
      {status}
    </span>
  );
}
