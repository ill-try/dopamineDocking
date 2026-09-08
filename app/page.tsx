'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Atom, Beaker, BookOpen, CircleDot, FlaskConical, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Features = {
  amine: boolean;
  ohTop: boolean;
  ohBottom: boolean;
  bulky: boolean;
};

type Outcome = 'Stable dock' | 'Transient contact' | 'No stable dock';

type Preset = {
  id: string;
  name: string;
  shortName: string;
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
    id: 'dopamine',
    name: 'Dopamine',
    shortName: 'Dopamine',
    features: { amine: true, ohTop: true, ohBottom: true, bulky: false },
    prediction: 'Stable dock',
    reason: 'Charge match + two polar contacts + ring fit',
  },
  {
    id: 'one-oh',
    name: 'One-OH analog',
    shortName: 'One OH',
    features: { amine: true, ohTop: true, ohBottom: false, bulky: false },
    prediction: 'Transient contact',
    reason: 'One serine contact is missing',
  },
  {
    id: 'neutral',
    name: 'Neutral amine state',
    shortName: 'Neutral tail',
    features: { amine: false, ohTop: true, ohBottom: true, bulky: false },
    prediction: 'No stable dock',
    reason: 'The Asp114 charge match is missing',
  },
  {
    id: 'bulky',
    name: 'Bulky analog',
    shortName: 'Bulky group',
    features: { amine: true, ohTop: true, ohBottom: true, bulky: true },
    prediction: 'Transient contact',
    reason: 'Favorable contacts compete with a steric clash',
  },
];

const MAX_SCORE = 6.9;

function calculateScore(features: Features) {
  const terms = {
    charge: features.amine ? 2.8 : 0,
    topHydrogenBond: features.ohTop ? 1.45 : 0,
    bottomHydrogenBond: features.ohBottom ? 1.45 : 0,
    ringFit: 1.2,
    steric: features.bulky ? -2.2 : 0,
  };
  const score = Math.max(0, Math.min(MAX_SCORE, Object.values(terms).reduce((a, b) => a + b, 0)));
  const outcome: Outcome = score >= 5.5 ? 'Stable dock' : score >= 4.5 ? 'Transient contact' : 'No stable dock';
  return { score, outcome, terms };
}

function sameFeatures(a: Features, b: Features) {
  return a.amine === b.amine && a.ohTop === b.ohTop && a.ohBottom === b.ohBottom && a.bulky === b.bulky;
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
  const { score, outcome } = useMemo(() => calculateScore(features), [features]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    let animation = 0;
    let width = 760;
    let height = 440;
    const running = runToken > 0;
    let finished = false;
    let elapsed = 0;
    let lastTime = performance.now();
    let x = 86;
    let y = 205;
    let vx = 0.35;
    let vy = -0.05;
    let angle = -0.08;
    let bound = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(320, rect.width);
      height = Math.max(320, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) {
        x = width * 0.16;
        y = height * 0.52;
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
      const gradient = context.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.12, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,0.96)');
      gradient.addColorStop(0.2, fill);
      gradient.addColorStop(1, 'rgba(7,16,28,0.95)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const label = (text: string, lx: number, ly: number, color = 'rgba(231,245,255,.88)', align: CanvasTextAlign = 'center') => {
      context.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      context.textAlign = align;
      context.fillStyle = color;
      context.fillText(text, lx, ly);
    };

    const drawPocket = (tx: number, ty: number) => {
      context.save();
      context.shadowBlur = 36;
      context.shadowColor = 'rgba(64,218,236,.22)';
      const pocketGradient = context.createLinearGradient(tx - 110, ty - 170, tx + 150, ty + 160);
      pocketGradient.addColorStop(0, 'rgba(18,74,96,.96)');
      pocketGradient.addColorStop(0.55, 'rgba(24,48,78,.98)');
      pocketGradient.addColorStop(1, 'rgba(45,25,74,.98)');
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

      context.strokeStyle = 'rgba(166,241,250,.35)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(tx - 76, ty - 74);
      context.bezierCurveTo(tx - 124, ty - 45, tx - 118, ty - 10, tx - 67, ty);
      context.bezierCurveTo(tx - 123, ty + 13, tx - 117, ty + 61, tx - 66, ty + 83);
      context.stroke();

      circle(tx + 42, ty + 1, 24, '#ff668e', 16);
      label('ASP114  −', tx + 42, ty + 5, '#fff5f8');
      circle(tx - 34, ty - 50, 20, '#36d6ea', 12);
      label('SER193', tx - 34, ty - 46, '#effdff');
      circle(tx - 34, ty + 52, 20, '#36d6ea', 12);
      label('SER197', tx - 34, ty + 56, '#effdff');

      context.setLineDash([5, 7]);
      context.strokeStyle = 'rgba(255,255,255,.22)';
      context.beginPath();
      context.arc(tx - 7, ty, 92, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      label('D2 POCKET', tx + 60, 58, 'rgba(197,230,242,.62)');
    };

    const drawLigand = (lx: number, ly: number, rotation: number) => {
      context.save();
      context.translate(lx, ly);
      context.rotate(rotation);

      context.lineCap = 'round';
      context.lineWidth = 7;
      context.strokeStyle = 'rgba(212,225,241,.7)';
      const bonds: Array<[number, number, number, number, boolean]> = [
        [19, 0, 50, 0, true],
        [-14, -19, -30, -39, features.ohTop],
        [-14, 19, -30, 39, features.ohBottom],
        [-26, 0, -58, 0, features.bulky],
      ];
      bonds.forEach(([x1, y1, x2, y2, show]) => {
        if (!show) return;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      });

      context.shadowBlur = 18;
      context.shadowColor = 'rgba(177,122,255,.48)';
      context.fillStyle = '#8f6cff';
      context.strokeStyle = 'rgba(239,233,255,.92)';
      context.lineWidth = 2;
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i;
        const px = Math.cos(a) * 25;
        const py = Math.sin(a) * 25;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      label('ring', 0, 4, '#ffffff');

      if (features.amine) {
        circle(58, 0, 18, '#ff6f9c', 15);
        label('NH₃⁺', 58, 4, '#fff7fa');
      } else {
        circle(58, 0, 18, '#9ba9ba', 7);
        label('NH₂', 58, 4, '#f4f7fb');
      }
      if (features.ohTop) {
        circle(-34, -44, 16, '#36d6ea', 12);
        label('OH', -34, -40, '#effeff');
      }
      if (features.ohBottom) {
        circle(-34, 44, 16, '#36d6ea', 12);
        label('OH', -34, 48, '#effeff');
      }
      if (features.bulky) {
        circle(-64, 0, 24, '#ffb34d', 16);
        label('CH₃', -64, 4, '#fff9ef');
      }
      context.restore();
    };

    const drawConnections = (tx: number, ty: number, proximity: number) => {
      if (proximity < 0.5) return;
      const alpha = Math.min(0.85, (proximity - 0.5) * 1.7);
      context.save();
      context.setLineDash([7, 6]);
      context.lineWidth = 2;
      if (features.amine) {
        context.strokeStyle = `rgba(255,111,156,${alpha})`;
        context.beginPath();
        context.moveTo(x + 58, y);
        context.lineTo(tx + 42, ty + 1);
        context.stroke();
      }
      context.strokeStyle = `rgba(54,214,234,${alpha})`;
      if (features.ohTop) {
        context.beginPath();
        context.moveTo(x - 34, y - 44);
        context.lineTo(tx - 34, ty - 50);
        context.stroke();
      }
      if (features.ohBottom) {
        context.beginPath();
        context.moveTo(x - 34, y + 44);
        context.lineTo(tx - 34, ty + 52);
        context.stroke();
      }
      context.restore();
    };

    const draw = (time: number) => {
      const dt = Math.min(2.4, (time - lastTime) / 16.67 || 1);
      lastTime = time;
      elapsed += running && !bound ? dt * 16.67 : 0;
      frame += dt;
      const tx = width * 0.74;
      const ty = height * 0.53;
      const dx = tx - x;
      const dy = ty - y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const compatibility = score / MAX_SCORE;

      if (running && !bound && !finished) {
        const pull = 0.018 + compatibility * 0.034;
        vx += (dx / distance) * pull * dt + (Math.random() - 0.5) * 0.12 * dt;
        vy += (dy / distance) * pull * dt + (Math.random() - 0.5) * 0.12 * dt;
        const damping = Math.pow(0.974, dt);
        vx *= damping;
        vy *= damping;
        const speed = Math.hypot(vx, vy);
        if (speed > 3.0) {
          vx = (vx / speed) * 3.0;
          vy = (vy / speed) * 3.0;
        }
        x += vx * dt;
        y += vy * dt;
        angle = Math.sin(frame * 0.045) * 0.11 + vy * 0.018;

        if (outcome === 'Stable dock' && distance < 15) {
          x = tx;
          y = ty;
          angle = 0;
          bound = true;
          finished = true;
          onProgress('Docked: several complementary contacts align', 100);
          onFinish(outcome);
        } else if (outcome === 'Transient contact' && distance < 73) {
          finished = true;
          vx = -2.2;
          vy += (Math.random() - 0.5) * 2;
          onProgress('Contact formed, but the fit is not stable', Math.round(compatibility * 100));
          onFinish(outcome);
        } else if (outcome === 'No stable dock' && distance < 105) {
          finished = true;
          vx = -2.6;
          vy += (Math.random() - 0.5) * 2.6;
          onProgress('Collision without enough complementary contacts', Math.round(compatibility * 100));
          onFinish(outcome);
        } else {
          const proximity = Math.max(0, 1 - distance / (width * 0.66));
          onProgress(proximity > 0.7 ? 'Entering the receptor region' : 'Random motion with score-biased drift', Math.round(proximity * compatibility * 100));
        }
      } else if (!running) {
        x = width * 0.16 + Math.sin(frame * 0.025) * 4;
        y = height * 0.52 + Math.cos(frame * 0.031) * 5;
        angle = Math.sin(frame * 0.022) * 0.1;
      } else if (finished && !bound) {
        x += vx * dt;
        y += vy * dt;
        vx *= Math.pow(0.985, dt);
        vy *= Math.pow(0.985, dt);
        angle += 0.01 * dt;
      }

      if ((elapsed > 9500 || x > width + 80 || x < -100) && running && !finished) {
        finished = true;
        onProgress('No stable docking during this run', Math.round(compatibility * 100));
        onFinish(outcome);
      }

      context.clearRect(0, 0, width, height);
      const background = context.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, '#071426');
      background.addColorStop(0.58, '#0a1627');
      background.addColorStop(1, '#130d25');
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      for (let i = 0; i < 42; i++) {
        const px = (i * 83 + frame * (0.08 + (i % 4) * 0.025)) % (width + 30) - 15;
        const py = (i * 47 + Math.sin(frame * 0.018 + i) * 8) % height;
        context.fillStyle = i % 3 === 0 ? 'rgba(54,214,234,.16)' : 'rgba(207,224,244,.1)';
        context.beginPath();
        context.arc(px, py, 1.5 + (i % 3) * 0.55, 0, Math.PI * 2);
        context.fill();
      }

      drawPocket(tx, ty);
      const proximity = Math.max(0, 1 - Math.hypot(tx - x, ty - y) / (width * 0.66));
      drawConnections(tx, ty, proximity);
      drawLigand(x, y, angle);

      context.fillStyle = 'rgba(223,238,250,.58)';
      context.font = '500 12px ui-sans-serif, system-ui, sans-serif';
      context.textAlign = 'left';
      context.fillText('AQUEOUS SPACE', 18, 28);
      animation = requestAnimationFrame(draw);
    };

    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, [features, onFinish, onProgress, outcome, runToken, score]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full min-h-[340px] w-full"
      aria-label={`Animated educational model of a ${outcome.toLowerCase()} between the ligand and a simplified dopamine D2 receptor pocket.`}
    >
      Your browser needs canvas support to show the moving ligand model.
    </canvas>
  );
}

export default function Home() {
  const [features, setFeatures] = useState<Features>(PRESETS[0].features);
  const [selectedPreset, setSelectedPreset] = useState('dopamine');
  const [runToken, setRunToken] = useState(0);
  const [status, setStatus] = useState('Ready to release');
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
      if (activePreset) {
        setResults((current) => ({ ...current, [activePreset.id]: outcome }));
      }
    },
    [activePreset],
  );

  const applyPreset = useCallback((preset: Preset, run = false) => {
    setFeatures(preset.features);
    setSelectedPreset(preset.id);
    setStatus(run ? 'Ligand released into solution' : 'Preset loaded — release when ready');
    setLiveContact(0);
    if (run) setRunToken((value) => value + 1);
    else setRunToken(0);
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebModelContext }).modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const registration = context.registerTool(
      {
        name: 'start_ligand_test',
        title: 'Start ligand test',
        description: 'Load one of the four visible ligand variants and start its animated receptor-pocket test.',
        inputSchema: {
          type: 'object',
          properties: {
            variant: {
              type: 'string',
              enum: PRESETS.map((preset) => preset.id),
              description: 'The ligand preset to load and release.',
            },
          },
          required: ['variant'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const variant =
            typeof input === 'object' && input !== null && 'variant' in input
              ? (input as { variant?: unknown }).variant
              : undefined;
          const preset = PRESETS.find((candidate) => candidate.id === variant);
          if (!preset) throw new Error('Unknown ligand variant.');
          applyPreset(preset, true);
          const result = calculateScore(preset.features);
          return {
            variant: preset.id,
            state: 'running',
            predictedOutcome: result.outcome,
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

  const changeFeature = (key: keyof Features, checked: boolean) => {
    const next = { ...features, [key]: checked };
    setFeatures(next);
    const match = PRESETS.find((preset) => sameFeatures(preset.features, next));
    setSelectedPreset(match?.id ?? 'custom');
    setStatus('Ligand changed — release to test it');
    setLiveContact(0);
    setRunToken(0);
  };

  const release = () => {
    setStatus('Ligand released into solution');
    setLiveContact(0);
    setRunToken((value) => value + 1 || 1);
  };

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Atom /></span>
          <div>
            <p className="eyebrow">Biochemistry · interactive model</p>
            <h1>Dopamine Docking Lab</h1>
          </div>
        </div>
        <div className="header-note">
          <CircleDot aria-hidden="true" />
          Simplified D2 receptor region
        </div>
      </header>

      <Tabs defaultValue="lab" className="lab-tabs">
        <TabsList aria-label="Lab sections" className="section-tabs">
          <TabsTrigger value="lab"><FlaskConical aria-hidden="true" /> Lab</TabsTrigger>
          <TabsTrigger value="model"><BookOpen aria-hidden="true" /> Model</TabsTrigger>
          <TabsTrigger value="tests"><Beaker aria-hidden="true" /> Prediction tests</TabsTrigger>
        </TabsList>

        <TabsContent value="lab" className="lab-content">
          <aside className="control-panel" aria-label="Ligand controls">
            <div className="panel-intro">
              <p className="step-label">01 · Choose a ligand</p>
              <h2>Change the contact pattern</h2>
            </div>

            <div className="preset-grid" aria-label="Ligand presets">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant={selectedPreset === preset.id ? 'default' : 'outline'}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.shortName}
                </Button>
              ))}
            </div>

            <div className="feature-list">
              <label className="feature-row" htmlFor="amine-switch">
                <span className="feature-copy"><b>Protonated amine</b><small>Ionic match to Asp114</small></span>
                <Switch id="amine-switch" checked={features.amine} onCheckedChange={(checked) => changeFeature('amine', checked)} />
              </label>
              <label className="feature-row" htmlFor="top-oh-switch">
                <span className="feature-copy"><b>Top catechol OH</b><small>Polar contact near Ser193</small></span>
                <Switch id="top-oh-switch" checked={features.ohTop} onCheckedChange={(checked) => changeFeature('ohTop', checked)} />
              </label>
              <label className="feature-row" htmlFor="bottom-oh-switch">
                <span className="feature-copy"><b>Bottom catechol OH</b><small>Polar contact near Ser197</small></span>
                <Switch id="bottom-oh-switch" checked={features.ohBottom} onCheckedChange={(checked) => changeFeature('ohBottom', checked)} />
              </label>
              <label className="feature-row" htmlFor="bulky-switch">
                <span className="feature-copy"><b>Bulky CH₃ group</b><small>Steric penalty in narrow pocket</small></span>
                <Switch id="bulky-switch" checked={features.bulky} onCheckedChange={(checked) => changeFeature('bulky', checked)} />
              </label>
            </div>

            <div className="prediction-box">
              <span>Model prediction</span>
              <strong>{calculation.outcome}</strong>
              <small>{calculation.score.toFixed(2)} / {MAX_SCORE.toFixed(1)} compatibility units</small>
            </div>

            <div className="action-row">
              <Button type="button" onClick={release} className="release-button">
                <Sparkles aria-hidden="true" /> Release ligand
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => applyPreset(PRESETS[0])} aria-label="Reset to dopamine">
                <RotateCcw aria-hidden="true" />
              </Button>
            </div>
          </aside>

          <section className="simulation-panel" aria-labelledby="simulation-title">
            <div className="simulation-topline">
              <div>
                <p className="step-label">02 · Observe the encounter</p>
                <h2 id="simulation-title">Receptor pocket view</h2>
              </div>
              <div className={`outcome-chip outcome-${calculation.outcome.split(' ')[0].toLowerCase()}`}>
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
                <span><i className="legend-dot charge" /> Ionic</span>
                <span><i className="legend-dot polar" /> Polar</span>
                <span><i className="legend-dot ring" /> Ring fit</span>
                <span><i className="legend-dot clash" /> Steric clash</span>
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
          <div className="info-heading">
            <p className="step-label">The rules behind the motion</p>
            <h2>Grounded ideas, transparent simplifications</h2>
            <p>The score combines contact opportunities. It is not a measured energy, force, affinity, or probability.</p>
          </div>
          <div className="rule-grid">
            <article><span className="rule-index">+2.8</span><h3>Charge complementarity</h3><p>NH₃⁺ near the negatively charged Asp114 patch is the strongest modeled contact.</p></article>
            <article><span className="rule-index">+1.45 × 2</span><h3>Polar alignment</h3><p>Each catechol OH can align with one simplified serine polar patch.</p></article>
            <article><span className="rule-index">+1.2</span><h3>Aromatic pocket fit</h3><p>The ring receives a modest packing contribution when it reaches the pocket.</p></article>
            <article><span className="rule-index penalty">−2.2</span><h3>Steric mismatch</h3><p>An invented bulky group collides with the narrow pocket and disrupts fit.</p></article>
          </div>
          <div className="limits-grid">
            <section><h3>Scientifically grounded</h3><p>Charge, hydrogen-bonding capacity, shape, many weak contacts, molecular motion, and collision matter to ligand binding.</p></section>
            <section><h3>Simplified here</h3><p>The receptor is fixed and 2D. Water, ions, flexibility, conformations, entropy, and downstream signaling are omitted.</p></section>
            <section><h3>Do not interpret literally</h3><p>The path is not a molecular trajectory; colored patches are not atom-sized; docking in this model does not prove D2 activation.</p></section>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="info-view">
          <div className="info-heading">
            <p className="step-label">Predictions recorded before running</p>
            <h2>Does the simulation follow its stated rules?</h2>
            <p>Run each variant. Agreement checks the implementation of this teaching model—not real-world affinity.</p>
          </div>
          <div className="test-list">
            {PRESETS.map((preset, index) => {
              const observed = results[preset.id];
              const agrees = observed === preset.prediction;
              return (
                <article className="test-row" key={preset.id}>
                  <span className="test-number">0{index + 1}</span>
                  <div className="test-name"><h3>{preset.name}</h3><p>{preset.reason}</p></div>
                  <div className="test-result"><span>Predicted</span><b>{preset.prediction}</b></div>
                  <div className="test-result"><span>Observed</span><b className={observed ? (agrees ? 'matches' : 'mismatch') : ''}>{observed ?? 'Not run'}</b></div>
                  <Button type="button" variant="outline" onClick={() => applyPreset(preset, true)}>Run</Button>
                </article>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <footer className="lab-footer">
        <span>Educational model · not molecular dynamics</span>
        <a href="https://pubmed.ncbi.nlm.nih.gov/1358663/" target="_blank" rel="noreferrer">D2 mutagenesis evidence</a>
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4704829/" target="_blank" rel="noreferrer">Dopamine-D2 interaction study</a>
      </footer>
    </main>
  );
}
