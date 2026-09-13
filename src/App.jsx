import { useEffect, useState } from "react";
import BenchmarkGallery from "./components/BenchmarkGallery.jsx";
import SamplerDemo from "./components/SamplerDemo.jsx";

export default function App() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");

    fetch(`${base}/assets/sampler_demos/manifest.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load sampler demo manifest.");
        }
        return response.json();
      })
      .then(setManifest)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">VerifLM</p>
        <h1>Physically Verified Image-Edit-Guided
          Goal Pose Generation for Robotic Manipulation</h1>
        <div className="authors" aria-label="Paper authors">
          Anonymous Authors
        </div>
        <nav className="publication-links" aria-label="Publication resources">
          <span className="publication-link-unavailable">Code — Coming Soon</span>
          <span className="publication-link-unavailable">arXiv — Coming Soon</span>
        </nav>
      </section>

      <section className="section card">
        <h2>Abstract</h2>
        <p className="section-intro">
          Abstract Placeholder
        </p>
      </section>

      <section className="section card">
        <h2>Overview Video</h2>
        <div className="media placeholder-media hero-video" role="img" aria-label="Video placeholder">
          <span>Video Coming Soon!</span>
        </div>
      </section>

      <section className="section">
        <div className="section-heading-row">
          <h2>Interactive Demo</h2>
          <small className="demo-disclaimer">
            Not a demonstration of the full method. Certain details are omitted for a smoother playthrough.
          </small>
        </div>
        {error && <p className="error">{error}</p>}
        {manifest?.benchmarks ? (
          <SamplerDemo benchmarks={manifest.benchmarks} defaultMode={manifest.defaultMode} />
        ) : (
          !error && <p className="muted">Loading sampler demo…</p>
        )}
      </section>

      <section className="section">
        <h2>Benchmark Gallery</h2>
        <BenchmarkGallery />
      </section>

      <section className="section card bibtex-section" id="bibtex">
        <h2>BibTeX</h2>
        <p className="section-intro">Citation details will be added when the paper is available.</p>
        <pre className="bibtex-placeholder" aria-label="BibTeX citation placeholder"><code>{`@article{veriflm2026,
  title   = {VerifLM: Physically Verified Image-Edit-Guided
          Goal Pose Generation for Robotic Manipulation},
  author  = {Author One and Author Two and Author Three and Author Four},
  journal = {arXiv preprint},
  year    = {2026}
}`}</code></pre>
      </section>
    </main>
  );
}
