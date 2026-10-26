'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Fan,
  Focus,
  GripVertical,
  HardDrive,
  Layers,
  Lightbulb,
  Lock,
  Maximize,
  MemoryStick,
  Monitor,
  MousePointer2,
  Move,
  PanelLeft,
  PartyPopper,
  Power,
  RotateCcw,
  Rotate3d,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { COMPONENTS, PART_IDS, PREREQUISITES, type PartId } from '@/lib/components-data';
import PCViewport, { type ViewportHandle } from './pc-viewport';

const ICONS: Record<PartId, typeof Box> = {
  case: Box, panel: PanelLeft, motherboard: CircuitBoard, cpu: Cpu,
  cooler: Fan, ram: MemoryStick, gpu: Monitor, ssd: HardDrive, psu: Power, fans: Fan,
};

/** Assembly order is approximately the reverse of the disassembly removal order. */
const BUILD_ORDER: PartId[] = ['case', 'fans', 'psu', 'motherboard', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'panel'];

const nameOf = (id: PartId) => COMPONENTS.find((part) => part.id === id)!.name;
const shortOf = (id: PartId) => COMPONENTS.find((part) => part.id === id)!.short;

/** Returns true when all prerequisites for `id` are already installed. */
function canInstall(id: PartId, installed: PartId[]): boolean {
  if (id === 'case') return true;
  return PREREQUISITES[id].every((dep) => installed.includes(dep));
}

/** Returns the next part in BUILD_ORDER that can be installed. */
function nextBuildStep(installed: PartId[]): PartId | null {
  return BUILD_ORDER.find((id) => !installed.includes(id) && canInstall(id, installed)) ?? null;
}

export default function BuildMode({ onExit }: { onExit: () => void }) {
  const [installed, setInstalled] = useState<PartId[]>([]);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [labels, setLabels] = useState(false);
  const [view, setView] = useState('perspective');
  const [toast, setToast] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState<PartId | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [completed, setCompleted] = useState(false);
  const viewport = useRef<ViewportHandle>(null);
  const next = nextBuildStep(installed);

  // The 3D viewport shows "removed" = everything NOT installed
  const removed = PART_IDS.filter((id) => !installed.includes(id));
  const info = COMPONENTS.find((part) => part.id === selected);
  const InfoIcon = info ? ICONS[info.id] : Box;

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const installPart = useCallback((id: PartId) => {
    if (installed.includes(id)) return;
    if (!canInstall(id, installed)) {
      const missing = PREREQUISITES[id].filter((dep) => !installed.includes(dep));
      setToast(`Install ${missing.map(nameOf).join(', ')} first.`);
      return;
    }
    setInstalled((prev) => [...prev, id]);
    setSelected(id);
    setToast(`${nameOf(id)} installed!`);
    if (installed.length + 1 === PART_IDS.length) {
      setCompleted(true);
      setToast('🎉 Your PC is fully assembled!');
    }
  }, [installed]);

  const uninstallPart = useCallback((id: PartId) => {
    if (id === 'case') return;
    // Remove everything that depends on this part (reverse dependency chain)
    const toRemove = new Set<PartId>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const partId of PART_IDS) {
        if (toRemove.has(partId)) continue;
        if (!installed.includes(partId)) continue;
        if (PREREQUISITES[partId].some((dep) => toRemove.has(dep))) {
          toRemove.add(partId);
          changed = true;
        }
      }
    }
    setInstalled((prev) => prev.filter((pid) => !toRemove.has(pid)));
    setCompleted(false);
    const extras = [...toRemove].filter((pid) => pid !== id);
    setToast(extras.length
      ? `${nameOf(id)} removed, along with ${extras.map(nameOf).join(', ')}.`
      : `${nameOf(id)} removed.`
    );
  }, [installed]);

  const reset = useCallback(() => {
    setInstalled([]);
    setSelected(null);
    setCompleted(false);
    setAutoRotate(false);
    setView('perspective');
    viewport.current?.view('perspective');
    setToast('Starting fresh. Drag components to build!');
  }, []);

  const changeView = (value: string) => {
    setView(value);
    viewport.current?.view(value);
  };

  // ── Drag-and-drop handlers ──
  const handleDragStart = (event: React.DragEvent, id: PartId) => {
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(id);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(false);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    setDragging(null);
    const id = event.dataTransfer.getData('text/plain') as PartId;
    if (id && PART_IDS.includes(id)) {
      installPart(id);
    }
  };

  // Keyboard shortcut
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,button,[role="slider"]') || event.target.isContentEditable)) return;
      if (event.key === 'Escape') setFocusMode(false);
      if (event.key.toLowerCase() === 'r') reset();
      if (event.key.toLowerCase() === 'l') setLabels((old) => !old);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [reset]);

  return (
    <div className={`lab-app ${focusMode ? 'focus-mode' : ''}`}>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Inside the PC home">
          <span className="brand-mark"><Box size={22} strokeWidth={1.7} /></span>
          <span>inside<span className="brand-slash">/</span>pc</span>
        </a>
        <div className="header-center"><span className="header-dot" /> Build mode</div>
        <div className="header-actions">
          <button className="quiet-button" onClick={onExit}><ArrowLeft size={16} /> Back to explorer</button>
          <span className="edition build-edition"><Sparkles size={11} /> Build mode</span>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <div className="breadcrumb">Build your PC <ChevronRight size={12} /> Guided assembly</div>
          <h1>Drag. Drop. Build.</h1>
          <p>Drag components from the parts tray onto the workspace to assemble your PC.</p>
        </div>
        <button className={`outlined-button ${focusMode ? 'active' : ''}`} aria-pressed={focusMode} onClick={() => setFocusMode(!focusMode)}>
          <Maximize size={16} /> {focusMode ? 'Exit focus mode' : 'Focus mode'}
        </button>
      </section>

      <main className="workbench">
        {/* ── Parts tray (left sidebar) ── */}
        <aside className="component-sidebar build-sidebar" aria-label="Parts tray">
          <div className="sidebar-heading">
            <h2>Parts tray</h2>
            <span className="count-badge">{PART_IDS.length - installed.length} left</span>
          </div>

          {next && (
            <div className="build-next-hint">
              <Sparkles size={13} />
              <span>Next: <strong>{nameOf(next)}</strong></span>
            </div>
          )}

          <div className="component-list build-parts-list">
            {BUILD_ORDER.map((id) => {
              const isInstalled = installed.includes(id);
              const isReady = canInstall(id, installed) && !isInstalled;
              const isLocked = !isReady && !isInstalled;
              const Icon = ICONS[id];
              const isCurrentDrag = dragging === id;

              return (
                <div
                  key={id}
                  className={`build-part-card ${isInstalled ? 'installed' : ''} ${isReady ? 'ready' : ''} ${isLocked ? 'locked' : ''} ${isCurrentDrag ? 'dragging' : ''} ${id === next ? 'next-up' : ''}`}
                  draggable={isReady}
                  onDragStart={(event) => handleDragStart(event, id)}
                  onDragEnd={handleDragEnd}
                  aria-disabled={!isReady}
                >
                  <div className="build-part-grip">
                    {isInstalled ? <Check size={14} /> : isLocked ? <Lock size={12} /> : <GripVertical size={14} />}
                  </div>
                  <div className="build-part-icon"><Icon size={20} strokeWidth={1.5} /></div>
                  <div className="build-part-info">
                    <span className="build-part-name">{COMPONENTS.find((c) => c.id === id)!.short}</span>
                    <span className="build-part-status">
                      {isInstalled ? 'Installed' : isReady ? 'Ready to install' : `Needs ${PREREQUISITES[id].filter((dep) => !installed.includes(dep)).map(shortOf).join(', ')}`}
                    </span>
                  </div>
                  {isReady && (
                    <button className="build-part-add" onClick={() => installPart(id)} title={`Install ${nameOf(id)}`}>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="discovery-progress">
            <div>
              <span>{completed ? 'Build complete!' : 'Assembly progress'}</span>
              <span>{installed.length}<span className="muted"> / {PART_IDS.length}</span></span>
            </div>
            <div className="progress-track"><span style={{ width: `${(installed.length / PART_IDS.length) * 100}%` }} /></div>
            <p>{completed ? 'Every component is in place.' : 'Drag parts to the 3D view to install.'}</p>
          </div>
        </aside>

        {/* ── 3D viewport (drop zone) ── */}
        <section
          className={`viewport-panel ${dragOver ? 'drop-active' : ''}`}
          aria-label="3D workspace — drop zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="viewport-topbar">
            <div className="view-presets" role="group" aria-label="Camera view">
              {([['perspective', '3D view'], ['side', 'Side'], ['front', 'Front']] as const).map(([value, label]) => (
                <button key={value} className={view === value ? 'active' : ''} aria-pressed={view === value} onClick={() => changeView(value)}>
                  {value === 'perspective' && <Box size={14} />}{label}
                </button>
              ))}
            </div>
            <label className="labels-control">
              <Switch size="sm" checked={labels} onCheckedChange={setLabels} aria-label="Component labels" /> Labels
            </label>
          </div>

          <PCViewport
            ref={viewport}
            selected={selected}
            removed={removed}
            hidden={[]}
            explode={0}
            isolate={false}
            labels={labels}
            autoRotate={autoRotate}
            onSelect={(id) => { if (id) setSelected(id); }}
          />

          {/* Drop zone visual overlay */}
          {dragOver && (
            <div className="drop-overlay">
              <div className="drop-overlay-content">
                <Layers size={28} />
                <span>Drop to install</span>
              </div>
            </div>
          )}

          <div className="model-caption">
            <span className="status-dot" />
            {completed ? 'Fully assembled PC' : `${installed.length} of ${PART_IDS.length} parts installed`}
            <span className="caption-divider">/</span>
            <span>Build mode</span>
          </div>

          <div className="canvas-tools" role="group" aria-label="3D view controls">
            <button aria-label="Zoom in" title="Zoom in" onClick={() => viewport.current?.zoom(0.8)}><ZoomIn size={18} /></button>
            <button aria-label="Zoom out" title="Zoom out" onClick={() => viewport.current?.zoom(1.25)}><ZoomOut size={18} /></button>
            <span />
            <button className={autoRotate ? 'active' : ''} aria-label="Auto rotate" title="Auto rotate" aria-pressed={autoRotate} onClick={() => setAutoRotate(!autoRotate)}><Rotate3d size={18} /></button>
            <button aria-label="Fit model in view" title="Fit model in view" onClick={() => viewport.current?.fit()}><Focus size={18} /></button>
          </div>

          <div className="viewport-bottom">
            <div className="assembly-controls build-controls">
              {completed ? (
                <>
                  <div className="build-complete-msg">
                    <PartyPopper size={20} />
                    <div>
                      <strong>PC assembled!</strong>
                      <span>All {PART_IDS.length} components installed.</span>
                    </div>
                  </div>
                  <button className="outlined-button" onClick={reset}><RotateCcw size={16} /> Build again</button>
                  <button className="primary-button" onClick={onExit}>Explore your PC <ArrowRight size={15} /></button>
                </>
              ) : (
                <>
                  <div className="build-step-indicator">
                    <div className="build-step-number">{installed.length + 1}</div>
                    <div>
                      <strong>{next ? `Install: ${nameOf(next)}` : 'All done!'}</strong>
                      <span>Step {installed.length + 1} of {PART_IDS.length}</span>
                    </div>
                  </div>
                  <div className="guided-progress">
                    <span>{installed.length} of {PART_IDS.length} installed</span>
                    <div className="progress-track"><span style={{ width: `${(installed.length / PART_IDS.length) * 100}%` }} /></div>
                  </div>
                  {next && (
                    <button className="primary-button" onClick={() => installPart(next)}>
                      Install {shortOf(next)} <ArrowRight size={15} />
                    </button>
                  )}
                  <button className="reset-button" onClick={reset} title="Reset build (R)"><RotateCcw size={16} /><span>Reset</span></button>
                </>
              )}
            </div>
            <div className="interaction-hints">
              <span><MousePointer2 size={12} /> Drag to orbit</span>
              <span><Move size={12} /> Right-drag to pan</span>
              <span>Drag parts from tray to install</span>
            </div>
          </div>
        </section>

        {/* ── Inspector (right sidebar) ── */}
        <aside className="inspector" aria-label="Component information">
          <div className="inspector-top">
            <span>{info ? 'Component details' : 'Build your PC'}</span>
            {info && <button className="icon-button" aria-label="Close" onClick={() => setSelected(null)}><X size={16} /></button>}
          </div>

          {info ? (
            <div className="component-detail" key={info.id}>
              <div className="detail-icon"><InfoIcon size={32} strokeWidth={1.3} /></div>
              <div className="detail-title-line">
                <h2>{info.name}</h2>
                {installed.includes(info.id) && <span className="installed-tag">Installed</span>}
                {!installed.includes(info.id) && <span className="removed-tag">Not installed</span>}
              </div>
              <span className="detail-category">{info.category}</span>
              <p className="component-role">{info.role}</p>
              <div className="analogy"><Lightbulb size={16} /><p>{info.analogy}</p></div>
              <h3>How it connects</h3><p>{info.connection}</p>
              <dl className="spec-list">{info.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              <div className="detail-actions">
                {!installed.includes(info.id) && canInstall(info.id, installed) && (
                  <button className="primary-button full-width" onClick={() => installPart(info.id)}>
                    <Layers size={16} /> Install this component
                  </button>
                )}
                {installed.includes(info.id) && info.id !== 'case' && (
                  <button className="outlined-button full-width" onClick={() => uninstallPart(info.id)}>
                    <Layers size={16} /> Remove component
                  </button>
                )}
              </div>
              <div className="did-you-know"><h3>One thing to remember</h3><p>{info.fact}</p></div>
            </div>
          ) : (
            <div className="overview-detail build-overview">
              <div className="overview-illustration"><Layers size={52} strokeWidth={1} /><span className="mini-chip"><Sparkles size={21} strokeWidth={1.5} /></span></div>
              <span className="lesson-tag">Build mode</span>
              <h2>Build your<br />dream PC.</h2>
              <p>Drag components from the parts tray on the left and drop them onto the 3D workspace to assemble your computer step by step.</p>
              <div className="how-to-item">
                <span><GripVertical size={17} /></span>
                <div><strong>Drag from the tray</strong><p>Grab a ready component and drag it to the 3D view.</p></div>
              </div>
              <div className="how-to-item">
                <span><Layers size={17} /></span>
                <div><strong>Watch it snap</strong><p>Components snap into their correct position automatically.</p></div>
              </div>
              <div className="how-to-item">
                <span><Focus size={17} /></span>
                <div><strong>Follow the guide</strong><p>Green-highlighted parts are ready to install next.</p></div>
              </div>
              <p className="example-note">Components must be installed in a valid order — just like building a real PC. The motherboard goes in before the CPU, the case before anything else.</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="app-footer">
        <span><span className="status-dot" /> Build it yourself. Learn by doing.</span>
        <button onClick={onExit}>Switch to explorer <ArrowRight size={12} /></button>
        <span className="footer-tech">Made with Three.js</span>
      </footer>

      {toast && <div className="lab-toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}
