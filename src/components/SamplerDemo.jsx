import { useEffect, useMemo, useState } from "react";

const BASE_STAGES = [
  { id: "goal", label: "Image Edit" },
  { id: "sampling", label: "Digital Twin" },
  { id: "candidates", label: "Candidates" },
  { id: "execution", label: "Execution" }
];

const OBJECT_ESTIMATION_STAGE = { id: "object_estimation", label: "Object Estimation" };

const MODES = [
  { id: "default", configKey: "default", key: "novlm", label: "Default", samplerVideo: "unconstrained.mp4" },
  { id: "vlm_assisted", configKey: "vlm_assisted", key: "vlm", label: "VLM-assisted", samplerVideo: "constrained.mp4" }
];

const AXES = [
  { id: "x", label: "X" },
  { id: "y", label: "Y" },
  { id: "z", label: "Z" },
  { id: "roll", label: "Roll" },
  { id: "pitch", label: "Pitch" },
  { id: "yaw", label: "Yaw" }
];

const DEFAULT_SAMPLING_CONSTRAINTS = {
  x: "normal_search",
  y: "normal_search",
  z: "normal_search",
  roll: "normal_search",
  pitch: "normal_search",
  yaw: "normal_search"
};

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function isMeshFreeBenchmark(benchmark) {
  return benchmark?.objectModel === "mesh-free";
}

function getStages(benchmark) {
  if (!isMeshFreeBenchmark(benchmark)) return BASE_STAGES;
  return [BASE_STAGES[0], OBJECT_ESTIMATION_STAGE, ...BASE_STAGES.slice(1)];
}

function assetPath(benchmark, folder, filename) {
  if (!benchmark?.basePath || !filename) return "";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const bench = benchmark.basePath.replace(/^\/|\/$/g, "");
  return `${base}/${bench}/${folder}/${filename}`;
}

function picturePath(benchmark, filename) {
  return assetPath(benchmark, "pictures", filename);
}

function videoPath(benchmark, filename) {
  return assetPath(benchmark, "videos", filename);
}

function getMode(modeId) {
  return MODES.find((mode) => mode.id === modeId) || MODES[0];
}

function isSuccessfulCandidate(candidate) {
  return Boolean(candidate) && candidate.status !== "failed" && candidate.success !== false;
}

function getCandidateCount(benchmark) {
  return benchmark.candidateCount || 3;
}

function makeCandidate(benchmark, mode, index) {
  const n = index + 1;
  const prefix = benchmark.assetPrefix || benchmark.activeObject;
  const failed = new Set(benchmark.failedCandidates?.[mode.key] || []).has(n);
  const failureReason = benchmark.failureReasons?.[`${mode.key}_${n}`] || "Task failure";
  const trajectoryFilename = isMeshFreeBenchmark(benchmark) && !failed
    ? "trajectory.mp4"
    : `${prefix}_${mode.key}_traj${n}.mp4`;

  return {
    id: `cand_${n}`,
    caption: `Candidate ${n}`,
    image: picturePath(benchmark, `${prefix}_${mode.key}_candidate${n}.png`),
    trajectoryAnim: videoPath(benchmark, trajectoryFilename),
    status: failed ? "failed" : "success",
    success: !failed,
    failureReason: failed ? failureReason : undefined
  };
}

function getCandidates(benchmark, mode) {
  return Array.from({ length: getCandidateCount(benchmark) }, (_, index) => (
    makeCandidate(benchmark, mode, index)
  ));
}

function formatGuidanceValue(rawValue) {
  const assessment = typeof rawValue === "object" ? rawValue?.assessment : rawValue;
  const bias = typeof rawValue === "object" ? rawValue?.bias : null;
  const biasSuffix = bias === "positive" ? " (+)" : bias === "negative" ? " (-)" : "";
  const raw = `${assessment || "normal_search"}${biasSuffix}`.trim().toLowerCase();

  const hasPositive = raw.includes("+");
  const hasNegative = raw.includes("-") || raw.includes("−");
  const direction = hasPositive ? " (+)" : hasNegative ? " (-)" : "";

  if (raw.startsWith("correct") || raw.startsWith("tight")) {
    return `correct${direction}`;
  }

  if (raw.startsWith("major") || raw.startsWith("wide")) {
    return `major revision${direction}`;
  }

  return `normal search${direction}`;
}

function getGuidanceVariant(value) {
  if (value.startsWith("correct")) return "correct";
  if (value.startsWith("major revision")) return "major";
  return "minor";
}

function getSamplingConstraints(benchmark, mode) {
  const configuredConstraints = (
    benchmark.samplingConstraints?.[mode.configKey]
    || benchmark.searchGuidance?.[mode.key]
    || benchmark.searchSpace?.[mode.key]
    || {}
  );
  const rawGuidance = {
    ...DEFAULT_SAMPLING_CONSTRAINTS,
    ...(configuredConstraints.translation || {}),
    ...(configuredConstraints.rotation || {}),
    ...configuredConstraints
  };

  return Object.fromEntries(
    Object.entries(rawGuidance).map(([axis, value]) => [axis, formatGuidanceValue(value)])
  );
}

function getConstraintRange(axisId, value) {
  const rotational = ["roll", "pitch", "yaw"].includes(axisId);
  const variant = getGuidanceVariant(value);

  if (rotational) {
    if (variant === "correct") return "15°";
    if (variant === "major") return "120°";
    return "60°";
  }

  if (variant === "correct") return "0.25 Lₐ";
  if (variant === "major") return "1.5 Lₐ";
  return "0.75 Lₐ";
}

function formatProgramList(value) {
  if (value == null) return "Not specified";
  if (!Array.isArray(value)) return String(value);
  if (!value.length) return "None";

  return value.map((item) => {
    if (Array.isArray(item)) return item.join(" ↔ ");
    if (typeof item === "object") {
      if (item.subject && item.relation && item.object) {
        return `${item.subject} ${item.relation} ${item.object}`;
      }
      return item.label || item.objects?.join(" ↔ ") || item.relation || JSON.stringify(item);
    }
    return item;
  }).join(", ");
}

function formatXyzRelations(value) {
  if (value == null) return "Not specified";
  if (typeof value !== "object") return String(value);

  const operatorAliases = {
    positive: ">",
    greater_than: ">",
    gt: ">",
    negative: "<",
    less_than: "<",
    lt: "<",
    equal: "=",
    equals: "=",
    eq: "="
  };
  const relations = Array.isArray(value)
    ? Object.fromEntries(value.filter((item) => item?.axis).map((item) => [item.axis, item.relation]))
    : value;
  const entries = ["x", "y", "z"]
    .filter((axis) => relations[axis] != null)
    .map((axis) => {
      const rawRelation = String(relations[axis]).trim();
      const operator = operatorAliases[rawRelation.toLowerCase()] || rawRelation;
      return `active.${axis} ${operator} passive.${axis}`;
    });

  return entries.length ? entries.join(" · ") : "None";
}

function formatDriftTolerances(value, axes, rotational = false) {
  if (value == null) return "Not specified";
  if (typeof value !== "object") return String(value);

  const thresholds = rotational
    ? { strict: "7.5°", moderate: "30°", permissive: "60°" }
    : { strict: "0.25 Lₐ", moderate: "0.5 Lₐ", permissive: "0.75 Lₐ" };
  const entries = axes
    .filter((axis) => value[axis] != null)
    .map((axis) => {
      const tolerance = String(value[axis]);
      const threshold = thresholds[tolerance.toLowerCase()];
      return `${axis}: ${tolerance}${threshold ? ` (${threshold})` : ""}`;
    });
  return entries.length ? entries.join(" · ") : "Not specified";
}

function getNextReadyStage(currentStage, completed, stages) {
  const currentIndex = stages.findIndex((item) => item.id === currentStage);
  if (currentIndex < 0 || !completed[currentStage]) return null;
  return stages[currentIndex + 1]?.id || null;
}

function MediaBox({ src, alt, className = "", placeholder = "Replace with asset", onEnded }) {
  const [failed, setFailed] = useState(false);
  const isVideo = /\.(webm|mp4|mov)$/i.test(src || "");

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`media placeholder-media ${className}`} role="img" aria-label={alt}>
        <span>{placeholder}</span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        className={`media ${className}`}
        src={src}
        aria-label={alt}
        autoPlay
        muted
        playsInline
        controls
        onEnded={onEnded}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <img
      className={`media ${className}`}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}

function ActionMediaBox({ label, sublabel, onClick, className = "", icon = "▶" }) {
  return (
    <button
      type="button"
      className={`media placeholder-media action-media ${className}`}
      onClick={onClick}
      aria-label={label}
    >
      <span className="action-click-badge">Click to continue</span>
      <span className="action-media-icon" aria-hidden="true">{icon}</span>
      <span className="action-media-label">{label}</span>
      {sublabel && <small>{sublabel}</small>}
    </button>
  );
}

function BenchmarkTabs({ benchmarks, activeId, onChange }) {
  return (
    <div className="tabs" role="tablist" aria-label="Benchmark selection">
      {benchmarks.map((benchmark) => (
        <button
          key={benchmark.id}
          className={classNames("tab", benchmark.id === activeId && "active")}
          onClick={() => onChange(benchmark.id)}
          type="button"
        >
          {benchmark.title}
        </button>
      ))}
    </div>
  );
}

function StageStepper({ stages, stage, completed, nextReadyStage, onChange }) {
  function canVisit(stageId) {
    const stageIndex = stages.findIndex((item) => item.id === stageId);
    if (stageIndex < 0) return false;
    return stages.slice(0, stageIndex).every((item) => completed[item.id]);
  }

  return (
    <nav
      className={`stage-stepper stage-stepper-${stages.length}`}
      aria-label="Sampler stages"
    >
      {stages.map((item, index) => {
        const active = item.id === stage;
        const complete = completed[item.id];
        const disabled = !canVisit(item.id);
        const ready = item.id === nextReadyStage;

        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            className={classNames(
              "stage-step",
              active && "active",
              complete && "complete",
              ready && "ready",
              disabled && "disabled"
            )}
            onClick={() => onChange(item.id)}
          >
            <span className="stage-dot">{complete ? "✓" : index + 1}</span>
            <span className="stage-copy">
              <span>{item.label}</span>
              {ready && <em className="ready-badge">Ready</em>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ModeSelector({ activeModeId, onChange }) {
  return (
    <div className="mode-row">
      <span className="mode-label">Sampler configuration</span>
      <div className="mode-toggle" role="radiogroup" aria-label="Sampler configuration">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={mode.id === activeModeId}
            className={classNames("mode-option", mode.id === activeModeId && "active")}
            onClick={() => onChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchSpaceStrip({ benchmark, mode }) {
  const samplingConstraints = getSamplingConstraints(benchmark, mode);
  const isVlmMode = mode.configKey === "vlm_assisted";

  return (
    <div className="search-space-strip">
      <div className="search-space-heading">
        <span className="search-space-title">Sampling Constraints (S)</span>
        <span className="constraint-equation">S = (h<sub>p</sub>, h<sub>R</sub>, b<sub>p</sub>)</span>
      </div>
      <div className="axis-strip">
        {AXES.map((axis) => {
          const value = samplingConstraints[axis.id] || "normal search";
          const variant = getGuidanceVariant(value);

          return (
            <span key={axis.id} className={classNames("axis-chip", variant)}>
              <strong>{axis.label}</strong>
              <span>{value}</span>
              <small>{getConstraintRange(axis.id, value)}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ValidationProgramBox({ benchmark, mode }) {
  const program = benchmark.validationPrograms?.[mode.configKey] || null;
  const isVlmMode = mode.configKey === "vlm_assisted";
  const fields = [
    { symbol: "m", label: "Mode", value: program?.mode || "Not specified" },
    { symbol: <>C<sub>req</sub></>, label: "Required contacts", value: formatProgramList(program?.requiredContacts) },
    { symbol: <>C<sub>forb</sub></>, label: "Forbidden contacts", value: formatProgramList(program?.forbiddenContacts) },
    {
      symbol: <>R<sub>xyz</sub></>,
      label: "Active-to-passive XYZ",
      value: formatXyzRelations(program?.xyzRelations)
    },
    {
      symbol: <>ε<sub>p</sub></>,
      label: "Position drift",
      value: formatDriftTolerances(program?.positionDrift, ["x", "y", "z"])
    },
    {
      symbol: <>ε<sub>R</sub></>,
      label: "Orientation drift",
      value: formatDriftTolerances(
        program?.orientationDrift || program?.rotationDrift,
        ["roll", "pitch", "yaw"],
        true
      )
    }
  ];

  return (
    <div className="validation-program-box">
      <div className="validation-program-heading">
        <span className="search-space-title">Validation Program (V)</span>
        <span className="constraint-equation">
          V = (m, C<sub>req</sub>, C<sub>forb</sub>, R<sub>xyz</sub>, ε<sub>p</sub>, ε<sub>R</sub>)
        </span>
      </div>
      <div className="validation-program-grid">
        {fields.map((field) => (
          <div className="validation-program-field" key={field.label}>
            <span className="validation-field-symbol">{field.symbol}</span>
            <span>
              <small>{field.label}</small>
              <strong>{field.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidatePicker({ candidates, selectedCandidateId, onSelect, interactive = true }) {
  return (
    <div className="candidate-grid">
      {candidates.map((candidate) => {
        const failed = !isSuccessfulCandidate(candidate);
        const selected = interactive && selectedCandidateId === candidate.id;
        const CandidateElement = interactive ? "button" : "div";

        return (
          <CandidateElement
            key={candidate.id}
            className={classNames(
              "candidate",
              selected && "active",
              failed && "failed",
              !interactive && "inactive"
            )}
            onClick={interactive ? () => onSelect(candidate) : undefined}
            type={interactive ? "button" : undefined}
            aria-disabled={!interactive ? "true" : undefined}
          >
            <div className="candidate-media-wrap">
              <MediaBox
                src={candidate.image}
                alt={candidate.caption}
                placeholder="Candidate render"
              />
              {failed && <span className="candidate-status failed">Failed</span>}
              {!failed && <span className="candidate-status succeeded">Successful</span>}
            </div>
            <span>{candidate.caption}</span>
            {failed && (
              <small className="candidate-failure-reason">
                {candidate.failureReason || "Task failure"}
              </small>
            )}
          </CandidateElement>
        );
      })}
    </div>
  );
}

function GoalStage({ benchmark, goalReady, onEdit }) {
  return (
    <>
    <div className="goal-stage-grid">
      <div>
        <h4>Input</h4>
        <MediaBox
          src={picturePath(benchmark, "input_scene.png")}
          alt={`${benchmark.title} input scene`}
          placeholder="input_scene.png"
        />
      </div>

      <div>
        <h4>Edited image</h4>
        {goalReady ? (
          <MediaBox
            src={picturePath(benchmark, "goal_edit.png")}
            alt={`${benchmark.title} AI-edited goal`}
            placeholder="goal_edit.png"
          />
        ) : (
          <ActionMediaBox
            label="Generate AI goal"
            sublabel="Click this panel to edit the input image"
            icon="✦"
            onClick={onEdit}
          />
        )}
      </div>
    </div>
    </>
  );
}

function ObjectEstimationStage({ benchmark, meshReady, onGenerateMesh }) {
  const objects = [
    { id: "active", label: "Active object" },
    { id: "passive", label: "Passive object" }
  ];

  return (
    <div className="object-estimation-list">
      {objects.map((object) => {
        const pointCloudFilename = `${object.id}_segmented_point_cloud.png`;
        const meshFilename = `${object.id}_estimated_mesh.png`;

        return (
          <section className="object-estimation-pair" key={object.id}>
            <h4 className="object-estimation-pair-title">{object.label}</h4>
            <div className="goal-stage-grid object-estimation-grid">
              <div>
                <h4>Segmented point cloud</h4>
                <MediaBox
                  src={picturePath(benchmark, pointCloudFilename)}
                  alt={`${benchmark.title} ${object.id} object segmented point cloud`}
                  placeholder={`${object.label} point cloud placeholder`}
                />
              </div>

              <div>
                <h4>Estimated mesh</h4>
                {meshReady[object.id] ? (
                  <MediaBox
                    src={picturePath(benchmark, meshFilename)}
                    alt={`${benchmark.title} ${object.id} estimated object mesh`}
                    placeholder={`${object.label} mesh placeholder`}
                  />
                ) : (
                  <ActionMediaBox
                    label={`Generate ${object.id}-object mesh`}
                    sublabel={`Click this panel to reconstruct the ${object.id} object`}
                    icon="◇"
                    onClick={() => onGenerateMesh(object.id)}
                  />
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GoalEditContext({ benchmark }) {
  return (
    <div className="goal-context-card">
      <h4>Edited image</h4>
      <MediaBox
        src={picturePath(benchmark, "goal_edit.png")}
        alt={`${benchmark.title} AI-edited goal`}
        placeholder="goal_edit.png"
      />
    </div>
  );
}

function SamplingReferenceContext({ benchmark }) {
  const viewGroups = [
    {
      title: "Views with active object frame rendered (for rotation reasoning)",
      views: [
        { title: "Front view", filename: "goal_scene_axes.png" },
        { title: "Back view", filename: "goal_scene_axes_reverse.png" }
      ]
    },
    {
      title: "Views with passive object frame rendered (for translational reasoning)",
      views: [
        { title: "Front view", filename: "goal_scene_world_axes.png" },
        { title: "Back view", filename: "goal_scene_world_axes_reverse.png" }
      ]
    }
  ];

  return (
    <div className="sampling-views-panel">
      {viewGroups.map((group) => (
        <div className="sampling-view-group" key={group.title}>
          <h4>{group.title}</h4>
          <div className="sampling-views-grid">
            {group.views.map((view) => (
              <div className="sampling-view-card" key={view.filename}>
                <MediaBox
                  className="sampling-view-media"
                  src={picturePath(benchmark, view.filename)}
                  alt={`${benchmark.title} ${group.title} ${view.title}`}
                  placeholder={view.filename}
                />
                <span>{view.title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SamplingStage({ benchmark, mode, modeId, onModeChange, started, onRun, replayKey }) {
  return (
    <>
      <ModeSelector activeModeId={modeId} onChange={onModeChange} />
      <div className="demo-layout compact sampling-layout">
        <SamplingReferenceContext benchmark={benchmark} />
        <div className="interaction-panel">
          <div className="panel-title-row">
            <h4>{mode.label} sampling and validation</h4>
          </div>
          {started ? (
            <MediaBox
              key={`sampling-${mode.id}-${replayKey}`}
              className="main-media"
              src={videoPath(benchmark, mode.samplerVideo)}
              alt={`Sampler animation for ${benchmark.title}`}
              placeholder={mode.samplerVideo}
            />
          ) : (
            <ActionMediaBox
              className="main-media"
              label="Refine and validate pose with sampler"
              sublabel="Click this panel to run sampler"
              icon="▶"
              onClick={onRun}
            />
          )}
        </div>
      </div>
      <div className="sampling-program-row">
        <SearchSpaceStrip benchmark={benchmark} mode={mode} />
        <ValidationProgramBox benchmark={benchmark} mode={mode} />
      </div>
    </>
  );
}

function CandidatesStage({ benchmark, mode, selectedCandidate, onSelect }) {
  const candidates = getCandidates(benchmark, mode);
  const alternateMode = MODES.find((item) => item.id !== mode.id) || MODES[0];
  const alternateCandidates = getCandidates(benchmark, alternateMode);
  const failedSelected = selectedCandidate && !isSuccessfulCandidate(selectedCandidate);

  return (
    <div className="demo-layout compact">
      <GoalEditContext benchmark={benchmark} />
      <div className="interaction-panel">
        <h4>{selectedCandidate ? "Selected candidate" : "Choose a valid candidate"}</h4>
        {selectedCandidate ? (
          <>
            <div className="candidate-preview-wrap">
              <MediaBox
                className="main-media"
                src={selectedCandidate.image}
                alt={selectedCandidate.caption}
                placeholder="Selected candidate"
              />
              {failedSelected && <span className="candidate-status failed preview">Failed</span>}
            </div>
          </>
        ) : (
          <div className="media placeholder-media main-media" role="img" aria-label="Candidate selection">
            <span>Choose one candidate below.</span>
          </div>
        )}
      </div>
      <div className="candidate-section compact span-two-columns">
        <div className="candidate-row">
          <div className="candidate-row-heading">
            <h4>{mode.label} candidate poses</h4>
            <span className="candidate-mode-badge active">Selected sampler</span>
          </div>
          <CandidatePicker
            candidates={candidates}
            selectedCandidateId={selectedCandidate?.id}
            onSelect={onSelect}
          />
        </div>
        <div className="candidate-row inactive">
          <div className="candidate-row-heading">
            <h4>For comparison: {alternateMode.label} candidates</h4>
          </div>
          <CandidatePicker
            candidates={alternateCandidates}
            selectedCandidateId={null}
            onSelect={onSelect}
            interactive={false}
          />
        </div>
      </div>
    </div>
  );
}

function ExecutionStage({ benchmark, selectedCandidate, started, onRun, replayKey }) {
  return (
    <div className="interaction-panel execution-panel">
      <div className="panel-title-row">
        <h4>Executed trajectory</h4>
      </div>
      {started ? (
        <MediaBox
          key={`execution-${selectedCandidate?.id || "none"}-${replayKey}`}
          className="main-media"
          src={selectedCandidate?.trajectoryAnim}
          alt={`Trajectory animation for ${selectedCandidate?.caption || "candidate"}`}
          placeholder="Trajectory video"
        />
      ) : (
        <ActionMediaBox
          className="main-media"
          label="Run trajectory"
          sublabel={selectedCandidate ? `Click this panel to execute ${selectedCandidate.caption}` : "Select a successful candidate first"}
          icon="▶"
          onClick={onRun}
        />
      )}
    </div>
  );
}

export default function SamplerDemo({ benchmarks, defaultMode = "vlm_assisted" }) {
  const [benchmarkId, setBenchmarkId] = useState(benchmarks[0]?.id);
  const benchmark = useMemo(
    () => benchmarks.find((item) => item.id === benchmarkId) || benchmarks[0],
    [benchmarks, benchmarkId]
  );
  const stages = useMemo(() => getStages(benchmark), [benchmark]);

  const [modeId, setModeId] = useState(benchmark.defaultMode || defaultMode);
  const mode = getMode(modeId);

  const [stage, setStage] = useState("goal");
  const [goalReady, setGoalReady] = useState(false);
  const [meshReady, setMeshReady] = useState({ active: false, passive: false });
  const [samplingStarted, setSamplingStarted] = useState(false);
  const [samplingDone, setSamplingDone] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [executionStarted, setExecutionStarted] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  function resetBenchmark(nextId) {
    const nextBenchmark = benchmarks.find((item) => item.id === nextId);
    setBenchmarkId(nextId);
    setModeId(nextBenchmark?.defaultMode || defaultMode);
    setStage("goal");
    setGoalReady(false);
    setMeshReady({ active: false, passive: false });
    setSamplingStarted(false);
    setSamplingDone(false);
    setSelectedCandidate(null);
    setExecutionStarted(false);
    setReplayKey((value) => value + 1);
  }

  function resetSamplingBranch() {
    setSamplingStarted(false);
    setSamplingDone(false);
    setSelectedCandidate(null);
    setExecutionStarted(false);
    setReplayKey((value) => value + 1);
  }

  function handleGoalEdit() {
    setGoalReady(true);
  }

  function handleGenerateMesh(objectId) {
    setMeshReady((current) => ({ ...current, [objectId]: true }));
  }

  function handleModeChange(nextModeId) {
    setModeId(nextModeId);
    resetSamplingBranch();
  }

  function handleRunSampler() {
    setSamplingStarted(true);
    setSamplingDone(true);
    setSelectedCandidate(null);
    setExecutionStarted(false);
    setReplayKey((value) => value + 1);
  }

  function handleCandidateSelect(candidate) {
    setSelectedCandidate(candidate);
    setExecutionStarted(false);
  }

  function handleRunExecution() {
    if (!isSuccessfulCandidate(selectedCandidate)) return;
    setExecutionStarted(true);
    setReplayKey((value) => value + 1);
  }

  function canVisit(nextStage) {
    const stageIndex = stages.findIndex((item) => item.id === nextStage);
    if (stageIndex < 0) return false;
    return stages.slice(0, stageIndex).every((item) => completed[item.id]);
  }

  function handleStageChange(nextStage) {
    if (!canVisit(nextStage)) return;
    setStage(nextStage);
  }

  const completed = {
    goal: goalReady,
    object_estimation: meshReady.active && meshReady.passive,
    sampling: samplingDone,
    candidates: isSuccessfulCandidate(selectedCandidate),
    execution: executionStarted
  };

  const nextReadyStage = getNextReadyStage(stage, completed, stages);

  return (
    <div className="demo card">
      <BenchmarkTabs benchmarks={benchmarks} activeId={benchmark.id} onChange={resetBenchmark} />

      <div className="demo-header compact">
        <div>
          <h3>{benchmark.title}</h3>
          <p><strong>Instruction:</strong> {benchmark.instruction}</p>
        </div>
      </div>

      <StageStepper
        stages={stages}
        stage={stage}
        completed={completed}
        nextReadyStage={nextReadyStage}
        onChange={handleStageChange}
      />

      {stage === "goal" && (
        <GoalStage
          benchmark={benchmark}
          goalReady={goalReady}
          onEdit={handleGoalEdit}
        />
      )}

      {stage === "object_estimation" && (
        <ObjectEstimationStage
          benchmark={benchmark}
          meshReady={meshReady}
          onGenerateMesh={handleGenerateMesh}
        />
      )}

      {stage === "sampling" && (
        <SamplingStage
          benchmark={benchmark}
          mode={mode}
          modeId={modeId}
          onModeChange={handleModeChange}
          started={samplingStarted}
          onRun={handleRunSampler}
          replayKey={replayKey}
        />
      )}

      {stage === "candidates" && (
        <CandidatesStage
          benchmark={benchmark}
          mode={mode}
          selectedCandidate={selectedCandidate}
          onSelect={handleCandidateSelect}
        />
      )}

      {stage === "execution" && (
        <ExecutionStage
          benchmark={benchmark}
          selectedCandidate={selectedCandidate}
          started={executionStarted}
          onRun={handleRunExecution}
          replayKey={replayKey}
        />
      )}
    </div>
  );
}
