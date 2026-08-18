export default function VisaRequirementsWidget() {
  return (
    <section className="visa-requirements-section" aria-labelledby="visa-requirements-heading">
      <div className="visa-requirements-heading">
        <div>
          <p className="eyebrow">Third-party planning tool</p>
          <h2 id="visa-requirements-heading">Check visa requirements</h2>
          <p>
            Compare requirements by nationality, residence, destination, and purpose of travel.
          </p>
        </div>
        <a href="https://www.visahq.in" target="_blank" rel="noopener noreferrer">
          Open VisaHQ
        </a>
      </div>

      <div className="third-party-warning" role="note" aria-label="VisaHQ third-party service notice">
        <strong>Independent third-party information</strong>
        <p>
          This tool is provided by VisaHQ, not a government authority, and its results are not
          live-verified by Smart Visa Tracker. Requirements can change; confirm them with the
          destination&apos;s official embassy or immigration authority before travel.
        </p>
        <p>
          VisaHQ receives the selections you make in the tool. Any application link opens VisaHQ
          separately—Smart Visa Tracker does not submit or verify visa applications.
        </p>
      </div>

      <div className="visahq-widget-frame-shell">
        <iframe
          className="visahq-widget-frame"
          src="/visa-requirements-widget.html"
          title="VisaHQ visa requirements checker"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </section>
  );
}
