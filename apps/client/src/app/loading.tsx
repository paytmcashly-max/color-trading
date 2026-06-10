export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 text-ink">
      <section className="w-full max-w-sm rounded-md border border-line bg-white p-4 text-center shadow-sm">
        <div className="mx-auto size-9 animate-spin rounded-full border-4 border-line border-t-[#16874f]" />
        <p className="mt-3 text-sm font-black text-muted">Loading</p>
      </section>
    </main>
  );
}
