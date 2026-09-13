import { useEffect, useState } from "react";

const MEDIA_STEPS = [
  { id: "source", label: "Source image", action: "Edit image" },
  { id: "edited", label: "Edited image", action: "Show trajectory" },
  { id: "trajectory", label: "Trajectory", action: "View source image" }
];

function assetPath(taskStage, fallbackBasePath, filename) {
  const basePath = taskStage?.basePath || fallbackBasePath;
  if (!basePath || !filename) return "";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = basePath.replace(/^\/|\/$/g, "");
  return `${base}/${path}/${filename}`;
}

function GalleryMedia({ benchmark, taskStage, mediaStep }) {
  const [failed, setFailed] = useState(false);
  const src = assetPath(taskStage, benchmark.basePath, taskStage.assets?.[mediaStep.id]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="media placeholder-media gallery-media" role="img" aria-label={mediaStep.label}>
        <span>{mediaStep.label} unavailable</span>
      </div>
    );
  }

  if (mediaStep.id === "trajectory") {
    return (
      <video
        className="media gallery-media"
        src={src}
        aria-label={`${benchmark.title} ${taskStage.title || "stage"} trajectory`}
        autoPlay
        muted
        loop
        playsInline
        controls
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <img
      className="media gallery-media"
      src={src}
      alt={`${benchmark.title}, ${taskStage.title || "stage"}: ${mediaStep.label}`}
      onError={() => setFailed(true)}
    />
  );
}

function BenchmarkCard({ benchmark }) {
  const taskStages = benchmark.stages?.length
    ? benchmark.stages
    : [{ id: "stage_1", title: "Stage 1", basePath: benchmark.basePath, assets: benchmark.assets }];
  const steps = taskStages.flatMap((taskStage, taskStageIndex) => (
    MEDIA_STEPS.map((mediaStep) => ({ taskStage, taskStageIndex, mediaStep }))
  ));
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] || steps[0];
  const nextTaskStage = taskStages[step?.taskStageIndex + 1];
  const action = step?.mediaStep.id === "trajectory" && nextTaskStage
    ? `Continue to ${nextTaskStage.title || `Stage ${step.taskStageIndex + 2}`}`
    : step?.mediaStep.action;

  function advance() {
    setStepIndex((current) => (current + 1) % steps.length);
  }

  return (
    <article className="card gallery-card">
      <div className="gallery-card-heading">
        <h3>{benchmark.title}</h3>
        {benchmark.instruction && <p>{benchmark.instruction}</p>}
      </div>

      <div className="gallery-media-wrap">
        <GalleryMedia
          benchmark={benchmark}
          taskStage={step.taskStage}
          mediaStep={step.mediaStep}
        />
        <span className="gallery-stage-label" aria-live="polite">
          {taskStages.length > 1 && `${step.taskStage.title || `Stage ${step.taskStageIndex + 1}`} · `}
          {step.mediaStep.label}
        </span>
      </div>

      <div className="gallery-progress" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
        {steps.map(({ taskStage, mediaStep }, index) => (
          <span
            key={`${taskStage.id}-${mediaStep.id}`}
            className={index <= stepIndex ? "active" : ""}
            aria-current={index === stepIndex ? "step" : undefined}
          />
        ))}
      </div>

      <button type="button" className="gallery-action" onClick={advance}>
        {action}
        <span aria-hidden="true">&rarr;</span>
      </button>
    </article>
  );
}

export default function BenchmarkGallery() {
  const [benchmarks, setBenchmarks] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");

    fetch(`${base}/assets/gallary/manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load benchmark gallery manifest.");
        return response.json();
      })
      .then((manifest) => setBenchmarks(manifest.benchmarks || []))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!benchmarks) return <p className="muted">Loading benchmark gallery&hellip;</p>;
  if (!benchmarks.length) return <p className="muted">No benchmarks have been added yet.</p>;

  return (
    <div className="benchmark-gallery">
      {benchmarks.map((benchmark) => (
        <BenchmarkCard key={benchmark.id} benchmark={benchmark} />
      ))}
    </div>
  );
}
