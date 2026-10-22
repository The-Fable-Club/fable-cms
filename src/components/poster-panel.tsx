import QRCode from "qrcode";

const SITE = "https://www.thefableclub.com";

/** The short link and QR code for an event's poster. */
export async function PosterPanel({ slug, eventhubUrl }: { slug: string; eventhubUrl: string | null }) {
  const short = `${SITE}/e/${slug}`;
  const svg = await QRCode.toString(short, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#141413", light: "#ffffff" } });
  const png = await QRCode.toDataURL(short, { errorCorrectionLevel: "M", margin: 2, width: 1024, color: { dark: "#141413", light: "#ffffff" } });

  return (
    <section className="grid gap-6 border-2 border-ink p-4 sm:grid-cols-[10rem_1fr]">
      <div className="bg-white p-1" aria-label={`QR code for ${short}`} role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="space-y-3 text-sm">
        <h2 className="text-lg font-semibold">For the poster</h2>
        <p>
          Short link: <code className="bg-paper-raised px-1">{short}</code>
          <span className="block text-xs text-ink/60">Opens the event page. Works once this event is published.</span>
        </p>
        <p className="flex flex-wrap gap-3">
          <a download={`${slug}-qr.png`} href={png} className="inline-flex h-9 items-center border-2 border-ink px-3 hover:bg-ink hover:text-paper">
            Download QR (PNG)
          </a>
          <a download={`${slug}-qr.svg`} href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} className="inline-flex h-9 items-center border-2 border-ink px-3 hover:bg-ink hover:text-paper">
            Download QR (SVG)
          </a>
        </p>
        <p className="text-xs text-ink/60">
          {eventhubUrl ? "The event page shows a Register on EventHub button that goes straight to EventHub." : "No EventHub link set yet: add it in the form below."}
        </p>
      </div>
    </section>
  );
}
