import { requireCan } from "@/lib/auth";

export const metadata = { title: "Attendance" };

// UI ONLY. Nothing on this page reads or writes data yet: every control is disabled.
// The backend (roster import, checkpoints, marks, OD report) is being built separately.
// Design notes: docs/ATTENDANCE-FEASIBILITY.md.

const label = "font-mono text-xs uppercase tracking-widest text-ink/60";
const card = "border-2 border-ink p-4";
const disabledBtn = "h-10 cursor-not-allowed border-2 border-ink/40 px-4 text-sm text-ink/50";

export default async function Attendance() {
  await requireCan("read_signups");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold">Attendance</h1>
        <span className="border-2 border-dashed border-clay-deep px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-clay-deep">Not connected yet</span>
      </div>
      <p className="text-sm text-ink/60">
        Layout only: nothing here saves yet. The roster comes from the EventHub CSV plus on-spot additions, attendance is taken at checkpoints, and the OD list is exported at the end.
        See <code>docs/ATTENDANCE-FEASIBILITY.md</code>.
      </p>

      <section className={card}>
        <label className="block max-w-md">
          <span className={label}>Event</span>
          <select disabled className="mt-1 block h-11 w-full cursor-not-allowed border-2 border-ink/40 bg-paper px-2 text-ink/50">
            <option>Choose an event</option>
          </select>
        </label>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-lg font-semibold">1. Roster</h2>
          <p className="mt-1 text-sm text-ink/60">Import the EventHub CSV (can be repeated with newer files). People missing from a newer file are flagged, never deleted.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input type="file" accept=".csv" disabled className="cursor-not-allowed text-sm text-ink/50" />
            <button type="button" disabled className={disabledBtn}>
              Import CSV
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-px border-2 border-ink/30 bg-ink/30 text-center text-sm">
            {[
              ["From EventHub", "–"],
              ["On-spot", "–"],
              ["Flagged", "–"],
            ].map(([k, v]) => (
              <div key={k} className="bg-paper p-3">
                <dt className={label}>{k}</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink/40">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={card}>
          <h2 className="text-lg font-semibold">2. On-spot registration</h2>
          <p className="mt-1 text-sm text-ink/60">Added at the event. Each entry is marked as on-spot, with who added it and when.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {["Registration number", "Full name", "Department", "Year"].map((f) => (
              <label key={f} className="block">
                <span className={label}>{f}</span>
                <input disabled className="mt-1 block h-10 w-full cursor-not-allowed border-2 border-ink/40 bg-paper px-2" />
              </label>
            ))}
          </div>
          <button type="button" disabled className={`${disabledBtn} mt-3`}>
            Add on-spot
          </button>
        </section>
      </div>

      <section className={card}>
        <h2 className="text-lg font-semibold">3. Checkpoints</h2>
        <p className="mt-1 text-sm text-ink/60">For example arrival, mid-event, exit, end. Each opens for a time window; the ones marked “needed for OD” all have to be present.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className={label}>
            <tr>
              <th className="py-2">Checkpoint</th>
              <th>Opens</th>
              <th>Closes</th>
              <th>Needed for OD</th>
              <th>Marked</th>
              <th />
            </tr>
          </thead>
          <tbody className="text-ink/40">
            {["Arrival", "Mid-event", "Exit"].map((c) => (
              <tr key={c} className="border-t border-ink/20">
                <td className="py-2">{c}</td>
                <td>–</td>
                <td>–</td>
                <td>–</td>
                <td>–</td>
                <td className="text-right">
                  <button type="button" disabled className={disabledBtn}>
                    Show code
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" disabled className={`${disabledBtn} mt-3`}>
          Add checkpoint
        </button>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">4. Door check and OD list</h2>
        <p className="mt-1 text-sm text-ink/60">A volunteer scans or types a registration number after checking the ID card. At the end, download who met every required checkpoint.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled className={disabledBtn}>
            Open door scanner
          </button>
          <button type="button" disabled className={disabledBtn}>
            Download OD list (CSV)
          </button>
          <button type="button" disabled className={disabledBtn}>
            View change log
          </button>
        </div>
      </section>
    </div>
  );
}
