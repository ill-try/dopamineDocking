"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Atom, Beaker, BookOpen, CircleDot, FlaskConical, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AmineGroup = "primary" | "n-methyl" | "neutral";
type RingGroup = "hydroxyl" | "methoxy" | "hydrogen";
type Features = { amine: AmineGroup; topGroup: RingGroup; bottomGroup: RingGroup };
type Outcome = "Stable dock" | "Transient contact" | "No stable dock";
type MotionProfile = "lock" | "rock" | "graze" | "slide" | "repel";

type Preset = {
  id: string;
  name: string;
  shortName: string;
  replacement: string;
  features: Features;
  prediction: Outcome;
  reason: string;
};

type WebModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const PRESETS: Preset[] = [
  {
    id: "dopamine",
    name: "Dopamine",
    shortName: "Dopamine",
    replacement: "Reference molecule",
    features: { amine: "primary", topGroup: "hydroxyl", bottomGroup: "hydroxyl" },
    prediction: "Stable dock",
    reason: "The ionic contact and both polar contacts can align at once.",
  },
  {
    id: "methoxy",
    name: "3-Methoxytyramine",
    shortName: "3-Methoxy",
    replacement: "OH → OCH₃",
    features: { amine: "primary", topGroup: "methoxy", bottomGroup: "hydroxyl" },
    prediction: "Stable dock",
    reason:
      "A similar oxygen-containing group remains, but its modeled polar contact is weaker and bulkier.",
  },
  {
    id: "n-methyl",
    name: "N-Methyldopamine",
    shortName: "N-Methyl",
    replacement: "NH₃⁺ → NH₂CH₃⁺",
    features: { amine: "n-methyl", topGroup: "hydroxyl", bottomGroup: "hydroxyl" },
    prediction: "Stable dock",
    reason:
      "The positive charge remains, while the methylated tail favors a slightly shifted pose.",
  },
  {
    id: "tyramine",
    name: "Tyramine",
    shortName: "Tyramine",
    replacement: "OH → H",
    features: { amine: "primary", topGroup: "hydrogen", bottomGroup: "hydroxyl" },
    prediction: "Transient contact",
    reason: "One polar anchor is removed, so the ligand can touch the pocket and then slide away.",
  },
];

const MAX_SCORE = 6.9;

const GROUP_LABELS = {
  primary: "NH₃⁺ · primary ammonium",
  "n-methyl": "NH₂CH₃⁺ · N-methyl ammonium",
  neutral: "NH₂ · neutral amine",
  hydroxyl: "OH · hydroxyl",
  methoxy: "OCH₃ · methoxy",
  hydrogen: "H · group removed",
} satisfies Record<AmineGroup | RingGroup, string>;

function calculateScore(features: Features) {
  const ringContact = (group: RingGroup) =>
    group === "hydroxyl" ? 1.45 : group === "methoxy" ? 0.75 : 0;
  const terms = {
    charge: features.amine === "primary" ? 2.8 : features.amine === "n-methyl" ? 2.6 : 0.25,
    topPolarContact: ringContact(features.topGroup),
    bottomPolarContact: ringContact(features.bottomGroup),
    ringFit: 1.2,
    methoxyPenalty:
      -0.3 *
      [features.topGroup, features.bottomGroup].filter((group) => group === "methoxy").length,
  };
  const score = Math.max(
    0,
    Math.min(
      MAX_SCORE,
      Object.values(terms).reduce((a, b) => a + b, 0),
    ),
  );
  const outcome: Outcome =
    score >= 5.5 ? "Stable dock" : score >= 4.5 ? "Transient contact" : "No stable dock";

  let motion: MotionProfile = "lock";
  let behavior = "Clean lock-in";
  if (features.amine === "neutral") {
    motion = "repel";
    behavior = "Weak-charge deflection";
  } else if (features.topGroup === "hydrogen" || features.bottomGroup === "hydrogen") {
    motion = "slide";
    behavior = "One-anchor slide";
  } else if (features.topGroup === "methoxy" || features.bottomGroup === "methoxy") {
    motion = "graze";
    behavior = "Offset methoxy fit";
  } else if (features.amine === "n-methyl") {
    motion = "rock";
    behavior = "Rocking tail fit";
  }
  return { score, outcome, terms, motion, behavior };
}

function sameFeatures(a: Features, b: Features) {
  return a.amine === b.amine && a.topGroup === b.topGroup && a.bottomGroup === b.bottomGroup;
}

function SimulationCanvas({
  features,
  runToken,
  onProgress,
  onFinish,
}: {
  features: Features;
  runToken: number;
  onProgress: (status: string, proximity: number) => void;
  onFinish: (outcome: Outcome) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const calculation = useMemo(() => calculateScore(features), [features]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) {
      onProgress("Animation unavailable in this browser — showing the contact map", 0);
      return;
    }

    let animation = 0;
    let width = 760;
    let height = 440;
    const running = runToken > 0;
    let finished = false;
    let elapsed = 0;
    let lastTime = performance.now();
    let frame = 0;
    let startX = width * 0.16;
    let startY = height * 0.52;
    let x = startX;
    let y = startY;
    let angle = -0.08;
    let lastStatus = "";
    let lastMeter = -1;

    const report = (nextStatus: string, nextMeter: number) => {
      const meter = Math.max(0, Math.min(100, Math.round(nextMeter)));
      if (nextStatus !== lastStatus || Math.abs(meter - lastMeter) >= 2) {
        lastStatus = nextStatus;
        lastMeter = meter;
        onProgress(nextStatus, meter);
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(320, rect.width);
      height = Math.max(320, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!elapsed) {
        startX = width * 0.16;
        startY = height * 0.52;
        x = startX;
        y = startY;
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const circle = (cx: number, cy: number, radius: number, fill: string, glow = 0) => {
      context.save();
      if (glow) {
        context.shadowBlur = glow;
        context.shadowColor = fill;
      }
      const gradient = context.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.4,
        radius * 0.12,
        cx,
        cy,
        radius,
      );
      gradient.addColorStop(0, "rgba(255,255,255,0.96)");
      gradient.addColorStop(0.2, fill);
      gradient.addColorStop(1, "rgba(7,16,28,0.95)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const label = (
      text: string,
      lx: number,
      ly: number,
      color = "rgba(231,245,255,.88)",
      align: CanvasTextAlign = "center",
    ) => {
      context.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      context.textAlign = align;
      context.fillStyle = color;
      context.fillText(text, lx, ly);
    };

    const drawPocket = (tx: number, ty: number) => {
      context.save();
      context.shadowBlur = 36;
      context.shadowColor = "rgba(64,218,236,.22)";
      const pocketGradient = context.createLinearGradient(tx - 110, ty - 170, tx + 150, ty + 160);
      pocketGradient.addColorStop(0, "rgba(18,74,96,.96)");
      pocketGradient.addColorStop(0.55, "rgba(24,48,78,.98)");
      pocketGradient.addColorStop(1, "rgba(45,25,74,.98)");
      context.fillStyle = pocketGradient;
      context.beginPath();
      context.moveTo(width + 24, 28);
      context.lineTo(tx + 48, 28);
      context.bezierCurveTo(tx - 8, 62, tx + 8, ty - 112, tx - 86, ty - 84);
      context.bezierCurveTo(tx - 137, ty - 68, tx - 136, ty - 8, tx - 76, ty);
      context.bezierCurveTo(tx - 138, ty + 12, tx - 138, ty + 82, tx - 72, ty + 96);
      context.bezierCurveTo(tx + 8, ty + 114, tx - 4, height - 42, tx + 64, height - 18);
      context.lineTo(width + 24, height - 18);
      context.closePath();
      context.fill();
      context.restore();

      context.strokeStyle = "rgba(166,241,250,.35)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(tx - 76, ty - 74);
      context.bezierCurveTo(tx - 124, ty - 45, tx - 118, ty - 10, tx - 67, ty);
      context.bezierCurveTo(tx - 123, ty + 13, tx - 117, ty + 61, tx - 66, ty + 83);
      context.stroke();

      circle(tx + 42, ty + 1, 24, "#ff668e", 16);
      label("ASP114  −", tx + 42, ty + 5, "#fff5f8");
      circle(tx - 34, ty - 50, 20, "#36d6ea", 12);
      label("SER193", tx - 34, ty - 46, "#effdff");
      circle(tx - 34, ty + 52, 20, "#36d6ea", 12);
      label("SER197", tx - 34, ty + 56, "#effdff");

      context.setLineDash([5, 7]);
      context.strokeStyle = "rgba(255,255,255,.22)";
      context.beginPath();
      context.arc(tx - 7, ty, 92, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      label("D2 POCKET", tx + 60, 58, "rgba(197,230,242,.62)");
    };

    const drawRingGroup = (group: RingGroup, gx: number, gy: number) => {
      if (group === "hydroxyl") {
        circle(gx, gy, 16, "#36d6ea", 12);
        label("OH", gx, gy + 4, "#effeff");
      } else if (group === "methoxy") {
        circle(gx, gy, 19, "#45c6cf", 10);
        label("OCH₃", gx, gy + 4, "#effeff");
      } else {
        circle(gx, gy, 10, "#8090a5", 4);
        label("H", gx, gy + 4, "#f3f6fa");
      }
    };

    const drawLigand = (lx: number, ly: number, rotation: number) => {
      context.save();
      context.translate(lx, ly);
      context.rotate(rotation);
      context.lineCap = "round";
      context.lineWidth = 7;
      context.strokeStyle = "rgba(212,225,241,.7)";
      [
        [19, 0, 50, 0],
        [-14, -19, -30, -39],
        [-14, 19, -30, 39],
      ].forEach(([x1, y1, x2, y2]) => {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      });

      context.shadowBlur = 18;
      context.shadowColor = "rgba(177,122,255,.48)";
      context.fillStyle = "#8f6cff";
      context.strokeStyle = "rgba(239,233,255,.92)";
      context.lineWidth = 2;
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = Math.cos(a) * 25;
        const py = Math.sin(a) * 25;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      label("ring", 0, 4, "#ffffff");

      if (features.amine === "primary") {
        circle(58, 0, 18, "#ff6f9c", 15);
        label("NH₃⁺", 58, 4, "#fff7fa");
      } else if (features.amine === "n-methyl") {
        circle(58, 0, 20, "#ff6f9c", 15);
        label("N⁺", 58, 4, "#fff7fa");
        context.strokeStyle = "rgba(212,225,241,.7)";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(67, -14);
        context.lineTo(79, -27);
        context.stroke();
        circle(84, -31, 12, "#ffb34d", 8);
        label("CH₃", 84, -27, "#fff9ef");
      } else {
        circle(58, 0, 18, "#9ba9ba", 7);
        label("NH₂", 58, 4, "#f4f7fb");
      }
      drawRingGroup(features.topGroup, -34, -44);
      drawRingGroup(features.bottomGroup, -34, 44);
      context.restore();
    };

    const drawConnections = (tx: number, ty: number, proximity: number) => {
      if (proximity < 0.5) return;
      const alpha = Math.min(0.85, (proximity - 0.5) * 1.7);
      context.save();
      context.setLineDash([7, 6]);
      context.lineWidth = 2;
      if (features.amine !== "neutral") {
        context.strokeStyle = `rgba(255,111,156,${alpha})`;
        context.beginPath();
        context.moveTo(x + 58, y);
        context.lineTo(tx + 42, ty + 1);
        context.stroke();
      }
      (
        [
          [features.topGroup, x - 34, y - 44, tx - 34, ty - 50],
          [features.bottomGroup, x - 34, y + 44, tx - 34, ty + 52],
        ] as Array<[RingGroup, number, number, number, number]>
      ).forEach(([group, x1, y1, x2, y2]) => {
        if (group === "hydrogen") return;
        context.strokeStyle =
          group === "hydroxyl" ? `rgba(54,214,234,${alpha})` : `rgba(255,190,95,${alpha * 0.72})`;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      });
      context.restore();
    };

    const finish = (message: string, meter: number) => {
      if (finished) return;
      finished = true;
      report(message, meter);
      onFinish(calculation.outcome);
    };

    const draw = (time: number) => {
      const dtMs = Math.min(40, Math.max(0, time - lastTime));
      lastTime = time;
      frame += dtMs / 16.67;
      if (running && !finished) elapsed += dtMs;

      const tx = width * 0.74;
      const ty = height * 0.53;
      const p = Math.min(1, elapsed / 4800);
      const compatibility = calculation.score / MAX_SCORE;
      const ease = (value: number) => 1 - Math.pow(1 - value, 3);
      const lerp = (a: number, b: number, value: number) => a + (b - a) * value;

      if (running && !finished) {
        if (calculation.motion === "lock") {
          const approach = ease(Math.min(1, p / 0.78));
          x = lerp(startX, tx, approach);
          y = lerp(startY, ty, approach) + Math.sin(p * Math.PI * 5) * 8 * (1 - approach);
          angle = -0.12 * (1 - approach);
          report(
            p < 0.62
              ? "Two polar anchors guide the charged tail inward"
              : "All three contacts are aligning",
            p * compatibility * 100,
          );
          if (p >= 1) finish("Locked in: charge and two OH contacts align", compatibility * 100);
        } else if (calculation.motion === "rock") {
          const approach = ease(Math.min(1, p / 0.68));
          const settle = Math.max(0, (p - 0.68) / 0.32);
          x = lerp(startX, tx - 7, approach);
          y =
            lerp(startY, ty + 4, approach) +
            Math.sin(settle * Math.PI * 6) * 8 * (1 - settle * 0.7);
          angle = Math.sin(settle * Math.PI * 6) * 0.16 * (1 - settle * 0.55);
          report(
            p < 0.68
              ? "Charged N-methyl tail approaches Asp114"
              : "The added methyl group tests a shifted pose",
            p * compatibility * 100,
          );
          if (p >= 1) finish("Stable dock with a small rocking tail motion", compatibility * 100);
        } else if (calculation.motion === "graze") {
          const approach = ease(Math.min(1, p / 0.64));
          const settle = Math.max(0, (p - 0.64) / 0.36);
          x = lerp(startX, tx - 12, approach) + Math.sin(settle * Math.PI) * 28;
          y = lerp(startY, ty + 10, approach) - Math.sin(settle * Math.PI * 2) * 18;
          angle = -0.08 + Math.sin(settle * Math.PI * 2) * 0.24;
          report(
            p < 0.64
              ? "Hydroxyl contact leads the approach"
              : "Methoxy group grazes the polar edge",
            p * compatibility * 100,
          );
          if (p >= 1)
            finish("Offset dock: the methoxy contact is weaker and bulkier", compatibility * 100);
        } else if (calculation.motion === "slide") {
          if (p < 0.58) {
            const approach = ease(p / 0.58);
            x = lerp(startX, tx - 64, approach);
            y = lerp(startY, ty - 8, approach);
            angle = -0.1 * (1 - approach);
            report("One remaining OH contact guides an edge approach", p * compatibility * 100);
          } else {
            const slide = ease((p - 0.58) / 0.42);
            x = tx - 64 - slide * 72;
            y = ty - 8 + slide * (height * 0.52);
            angle = slide * 0.85;
            report(
              "The missing polar anchor lets the ligand slide away",
              (1 - slide * 0.32) * compatibility * 100,
            );
          }
          if (p >= 1) finish("Brief edge contact, then a one-anchor slide", compatibility * 68);
        } else {
          if (p < 0.5) {
            const approach = ease(p / 0.5);
            x = lerp(startX, tx - 92, approach);
            y = lerp(startY, ty, approach);
            angle = Math.sin(p * Math.PI * 3) * 0.12;
            report(
              "Neutral tail approaches without a strong charge match",
              p * compatibility * 100,
            );
          } else {
            const deflect = ease((p - 0.5) / 0.5);
            x = tx - 92 - deflect * width * 0.38;
            y = ty - deflect * height * 0.42;
            angle = -deflect * 0.9;
            report(
              "Without the ionic anchor, the encounter deflects",
              (1 - deflect * 0.45) * compatibility * 100,
            );
          }
          if (p >= 1) finish("Deflected: no strong ionic anchor formed", compatibility * 55);
        }
      } else if (!running) {
        x = startX + Math.sin(frame * 0.025) * 4;
        y = startY + Math.cos(frame * 0.031) * 5;
        angle = Math.sin(frame * 0.022) * 0.1;
      } else if (calculation.motion === "rock") {
        x = tx - 7;
        y = ty + 4 + Math.sin(frame * 0.035) * 2;
        angle = Math.sin(frame * 0.035) * 0.035;
      } else if (calculation.motion === "graze") {
        x = tx - 12;
        y = ty + 10;
        angle = -0.08;
      } else if (calculation.motion === "lock") {
        x = tx;
        y = ty;
        angle = 0;
      }

      context.clearRect(0, 0, width, height);
      const background = context.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#071426");
      background.addColorStop(0.58, "#0a1627");
      background.addColorStop(1, "#130d25");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      for (let i = 0; i < 42; i++) {
        const px = ((i * 83 + frame * (0.08 + (i % 4) * 0.025)) % (width + 30)) - 15;
        const py = (i * 47 + Math.sin(frame * 0.018 + i) * 8) % height;
        context.fillStyle = i % 3 === 0 ? "rgba(54,214,234,.16)" : "rgba(207,224,244,.1)";
        context.beginPath();
        context.arc(px, py, 1.5 + (i % 3) * 0.55, 0, Math.PI * 2);
        context.fill();
      }

      drawPocket(tx, ty);
      const proximity = Math.max(0, 1 - Math.hypot(tx - x, ty - y) / (width * 0.66));
      drawConnections(tx, ty, proximity);
      drawLigand(x, y, angle);
      context.fillStyle = "rgba(223,238,250,.58)";
      context.font = "500 12px ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "left";
      context.fillText("AQUEOUS SPACE", 18, 28);
      if (!canvasReady) setCanvasReady(true);
      animation = requestAnimationFrame(draw);
    };

    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, [calculation, canvasReady, features, onFinish, onProgress, runToken]);

  return (
    <>
      {!canvasReady && (
        <img
          className="canvas-fallback"
          src="./dopamine-d2-contact-map.svg"
          alt="Dopamine aligned with Asp114, Ser193, and Ser197 in the simplified D2 pocket."
        />
      )}
      <canvas
        ref={canvasRef}
        className={`simulation-canvas h-full min-h-[340px] w-full${canvasReady ? " is-ready" : ""}`}
        aria-label={`Animated educational model showing ${calculation.behavior.toLowerCase()} and a predicted ${calculation.outcome.toLowerCase()}.`}
      />
    </>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("lab");
  const [features, setFeatures] = useState<Features>(PRESETS[0].features);
  const [selectedPreset, setSelectedPreset] = useState("dopamine");
  const [runToken, setRunToken] = useState(0);
  const [status, setStatus] = useState("Choose a molecule or replace one group");
  const [liveContact, setLiveContact] = useState(0);
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const calculation = useMemo(() => calculateScore(features), [features]);
  const activePreset = PRESETS.find((preset) => sameFeatures(preset.features, features));

  const updateProgress = useCallback((nextStatus: string, proximity: number) => {
    setStatus(nextStatus);
    setLiveContact(proximity);
  }, []);
  const finishRun = useCallback(
    (outcome: Outcome) => {
      if (activePreset) setResults((current) => ({ ...current, [activePreset.id]: outcome }));
    },
    [activePreset],
  );
  const runFeatures = useCallback((nextFeatures: Features, presetId = "custom") => {
    setFeatures(nextFeatures);
    setSelectedPreset(presetId);
    setActiveTab("lab");
    setStatus("Replacement applied — starting encounter");
    setLiveContact(0);
    setRunToken((value) => value + 1);
  }, []);
  const applyPreset = useCallback(
    (preset: Preset) => runFeatures(preset.features, preset.id),
    [runFeatures],
  );

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: WebModelContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = modelContext.registerTool(
      {
        name: "start_ligand_test",
        title: "Start ligand test",
        description:
          "Load one of the four visible dopamine-related molecules and start its distinct receptor-pocket encounter.",
        inputSchema: {
          type: "object",
          properties: {
            variant: {
              type: "string",
              enum: PRESETS.map((preset) => preset.id),
              description: "The molecule to load and release.",
            },
          },
          required: ["variant"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const variant =
            typeof input === "object" && input !== null && "variant" in input
              ? (input as { variant?: unknown }).variant
              : undefined;
          const preset = PRESETS.find((candidate) => candidate.id === variant);
          if (!preset) throw new Error("Unknown ligand variant.");
          applyPreset(preset);
          const result = calculateScore(preset.features);
          return {
            variant: preset.id,
            state: "running",
            predictedOutcome: result.outcome,
            motion: result.behavior,
            compatibilityUnits: result.score,
          };
        },
      },
      { signal: lifecycle.signal },
    );
    void Promise.resolve(registration).catch(() => {
      // The visible lab remains fully usable when WebMCP is unavailable.
    });
    return () => lifecycle.abort();
  }, [applyPreset]);

  const replaceFeature = <Key extends keyof Features>(key: Key, value: Features[Key] | null) => {
    if (!value) return;
    const next = { ...features, [key]: value };
    const match = PRESETS.find((preset) => sameFeatures(preset.features, next));
    runFeatures(next, match?.id ?? "custom");
  };
  const release = () => {
    setStatus("Starting another encounter");
    setLiveContact(0);
    setRunToken((value) => value + 1);
  };
  const reset = () => {
    setFeatures(PRESETS[0].features);
    setSelectedPreset("dopamine");
    setStatus("Dopamine restored — ready to run");
    setLiveContact(0);
    setRunToken(0);
  };

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Atom />
          </span>
          <div>
            <p className="eyebrow">Biochemistry · interactive model</p>
            <h1>Dopamine Docking Lab</h1>
          </div>
        </div>
        <div className="header-note">
          <CircleDot aria-hidden="true" /> Simplified D2 receptor region
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="lab-tabs">
        <TabsList aria-label="Lab sections" className="section-tabs">
          <TabsTrigger value="lab">
            <FlaskConical aria-hidden="true" /> Lab
          </TabsTrigger>
          <TabsTrigger value="model">
            <BookOpen aria-hidden="true" /> Model
          </TabsTrigger>
          <TabsTrigger value="tests">
            <Beaker aria-hidden="true" /> Prediction tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lab" className="lab-content" keepMounted>
          <aside className="control-panel" aria-label="Molecule controls">
            <div className="panel-intro">
              <p className="step-label">01 · Choose an alternative</p>
              <h2>Replace one functional group</h2>
              <p className="panel-help">
                A selection runs immediately. Watch the molecule take a different path.
              </p>
            </div>
            <div className="preset-grid" aria-label="Dopamine-related molecules">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant={selectedPreset === preset.id ? "default" : "outline"}
                  className="preset-button"
                  aria-pressed={selectedPreset === preset.id}
                  onClick={() => applyPreset(preset)}
                >
                  <b>{preset.shortName}</b>
                  <small>{preset.replacement}</small>
                </Button>
              ))}
            </div>
            <div className="active-molecule" aria-live="polite">
              <span>Now testing</span>
              <strong>{activePreset?.name ?? "Custom analog"}</strong>
              <small>{calculation.behavior}</small>
            </div>
            <div className="replacement-list">
              <div className="replacement-row">
                <label htmlFor="amine-select">
                  <b>Amine tail</b>
                  <small>Changes charge and tail size</small>
                </label>
                <Select
                  value={features.amine}
                  onValueChange={(value) => replaceFeature("amine", value as AmineGroup)}
                >
                  <SelectTrigger id="amine-select" aria-label="Replace the amine tail">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {(["primary", "n-methyl", "neutral"] as AmineGroup[]).map((group) => (
                      <SelectItem value={group} key={group}>
                        {GROUP_LABELS[group]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="replacement-row">
                <label htmlFor="top-group-select">
                  <b>Upper ring group</b>
                  <small>Contact near Ser193</small>
                </label>
                <Select
                  value={features.topGroup}
                  onValueChange={(value) => replaceFeature("topGroup", value as RingGroup)}
                >
                  <SelectTrigger id="top-group-select" aria-label="Replace the upper ring group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {(["hydroxyl", "methoxy", "hydrogen"] as RingGroup[]).map((group) => (
                      <SelectItem value={group} key={group}>
                        {GROUP_LABELS[group]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="replacement-row">
                <label htmlFor="bottom-group-select">
                  <b>Lower ring group</b>
                  <small>Contact near Ser197</small>
                </label>
                <Select
                  value={features.bottomGroup}
                  onValueChange={(value) => replaceFeature("bottomGroup", value as RingGroup)}
                >
                  <SelectTrigger id="bottom-group-select" aria-label="Replace the lower ring group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {(["hydroxyl", "methoxy", "hydrogen"] as RingGroup[]).map((group) => (
                      <SelectItem value={group} key={group}>
                        {GROUP_LABELS[group]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="prediction-box">
              <span>Model prediction</span>
              <strong>{calculation.outcome}</strong>
              <small>
                {calculation.score.toFixed(2)} / {MAX_SCORE.toFixed(1)} compatibility units
              </small>
            </div>
            <div className="action-row">
              <Button type="button" onClick={release} className="release-button">
                <Sparkles aria-hidden="true" /> Run again
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={reset}
                aria-label="Reset to dopamine"
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            </div>
          </aside>

          <section className="simulation-panel" aria-labelledby="simulation-title">
            <div className="simulation-topline">
              <div>
                <p className="step-label">02 · Compare the motion</p>
                <h2 id="simulation-title">{calculation.behavior}</h2>
              </div>
              <div
                className={`outcome-chip outcome-${calculation.outcome.split(" ")[0].toLowerCase()}`}
              >
                {calculation.outcome}
              </div>
            </div>
            <div className="canvas-frame">
              <SimulationCanvas
                features={features}
                runToken={runToken}
                onProgress={updateProgress}
                onFinish={finishRun}
              />
              <div className="canvas-legend" aria-hidden="true">
                <span>
                  <i className="legend-dot charge" /> Ionic
                </span>
                <span>
                  <i className="legend-dot polar" /> Strong polar
                </span>
                <span>
                  <i className="legend-dot modified" /> Modified group
                </span>
                <span>
                  <i className="legend-dot ring" /> Ring fit
                </span>
              </div>
            </div>
            <div className="meter-row">
              <div className="meter-copy">
                <span>Live interaction meter</span>
                <strong aria-live="polite">{status}</strong>
              </div>
              <div className="meter-value">{liveContact}%</div>
              <Progress value={liveContact} aria-label="Current interaction strength" />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="model" className="info-view">
          <div className="model-intro">
            <div className="info-heading">
              <p className="step-label">The rules behind the motion</p>
              <h2>Similar replacements, visibly different encounters</h2>
              <p>
                The score combines contact opportunities. Each motion is an explanatory cue—not a
                measured trajectory, energy, affinity, or probability.
              </p>
            </div>
            <figure className="contact-map">
              <img
                src="./dopamine-d2-contact-map.svg"
                alt="Contact map of dopamine's modeled ring fit, ionic contact with Asp114, and polar contacts with Ser193 and Ser197."
              />
              <figcaption>
                A static key to the dopamine reference geometry used in the animated lab.
              </figcaption>
            </figure>
          </div>
          <div className="rule-grid">
            <article>
              <span className="rule-index">+2.8</span>
              <h3>Primary ammonium</h3>
              <p>NH₃⁺ near the negative Asp114 patch is the strongest modeled contact.</p>
            </article>
            <article>
              <span className="rule-index">+1.45</span>
              <h3>Hydroxyl contact</h3>
              <p>Each OH can align with one simplified serine polar patch.</p>
            </article>
            <article>
              <span className="rule-index">+0.75</span>
              <h3>Methoxy replacement</h3>
              <p>
                OCH₃ keeps an oxygen but receives a weaker contact and a small size penalty in this
                model.
              </p>
            </article>
            <article>
              <span className="rule-index penalty">0</span>
              <h3>Hydrogen replacement</h3>
              <p>
                Replacing OH with H removes that modeled polar anchor and produces an edge-slide
                motion.
              </p>
            </article>
          </div>
          <div className="limits-grid">
            <section>
              <h3>Scientifically grounded</h3>
              <p>
                Charge, hydrogen-bonding capacity, shape, molecular motion, and many weak contacts
                all matter to ligand binding.
              </p>
            </section>
            <section>
              <h3>Simplified here</h3>
              <p>
                The receptor is fixed and 2D. Water, ions, flexibility, conformations, entropy,
                metabolism, and signaling are omitted.
              </p>
            </section>
            <section>
              <h3>Read motion as explanation</h3>
              <p>
                Locking, rocking, grazing, sliding, and deflection distinguish the model rules; they
                are not molecular-dynamics results.
              </p>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="info-view">
          <div className="info-heading">
            <p className="step-label">Predictions recorded before running</p>
            <h2>Does each replacement follow its stated rule?</h2>
            <p>
              Run any molecule again. Agreement checks this teaching model’s implementation—not
              real-world affinity.
            </p>
          </div>
          <div className="test-list">
            {PRESETS.map((preset, index) => {
              const observed = results[preset.id];
              const agrees = observed === preset.prediction;
              return (
                <article className="test-row" key={preset.id}>
                  <span className="test-number">0{index + 1}</span>
                  <div className="test-name">
                    <h3>{preset.name}</h3>
                    <p>
                      <b>{preset.replacement}</b> · {preset.reason}
                    </p>
                  </div>
                  <div className="test-result">
                    <span>Predicted</span>
                    <b>{preset.prediction}</b>
                  </div>
                  <div className="test-result">
                    <span>Observed</span>
                    <b className={observed ? (agrees ? "matches" : "mismatch") : ""}>
                      {observed ?? "Not run"}
                    </b>
                  </div>
                  <Button type="button" variant="outline" onClick={() => applyPreset(preset)}>
                    Run
                  </Button>
                </article>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <footer className="lab-footer">
        <span>Educational contact model · not molecular dynamics</span>
        <a href="https://pubmed.ncbi.nlm.nih.gov/1358663/" target="_blank" rel="noreferrer">
          D2 mutagenesis evidence
        </a>
        <a
          href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4704829/"
          target="_blank"
          rel="noreferrer"
        >
          Dopamine–D2 interaction study
        </a>
      </footer>
    </main>
  );
}
