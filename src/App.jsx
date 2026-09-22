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
        <h2 className="eyebrow">VerifLM</h2>
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
          Many manipulation goals are easier to visualize than to specify through explicit geometric constraints. We present VerifLM, a framework that converts image-edited goal configurations into physically verified 6D object poses. VerifLM recovers an initial active--passive relative pose from an edited image, then prompts a vision-language model to generate axis-wise sampling constraints and a task-specific validation program. Candidate poses are evaluated in MuJoCo, and the VLM selects the most task-consistent retained candidate. To operate without predefined object meshes or physical parameters, VerifLM reconstructs metric object geometry from RGB-D observations and predicts multiple joint physics hypotheses. Parallel-world validation evaluates candidates across geometry--physics variations and ranks them by the number of worlds in which they satisfy the validation program. We evaluate VerifLM on nine manipulation tasks. VerifLM achieves the highest task success on eight of nine tasks, with the largest performance gain on goals requiring precise orientation and contact relationships. 
        </p>
      </section>

      <section className="section card">
        <h2>Overview Video</h2>
        <video
          className="media hero-video"
          controls
          playsInline
          preload="metadata"
        >
          <source
            src={`${import.meta.env.BASE_URL}assets/overview.mp4`}
            type="video/mp4"
          />
          Your browser does not support HTML video.
        </video>
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
  author  = {Anonymous Authors},
  journal = {arXiv preprint},
  year    = {2026}
}`}</code></pre>
      </section>
    </main>
  );
}
