'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import type { PartId } from '@/lib/components-data';
import type { SceneController, SceneState } from '@/lib/pc-scene-engine';

export type ViewportHandle = { view: (name: string) => void; zoom: (factor: number) => void; fit: () => void };
type Props = SceneState & { onSelect: (id: PartId | null) => void };
const PCViewport = forwardRef<ViewportHandle, Props>(function PCViewport(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneController | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useImperativeHandle(ref, () => ({ view: (name) => engine.current?.view(name), zoom: (factor) => engine.current?.zoom(factor), fit: () => engine.current?.fit() }), []);
  useEffect(() => {
    let disposed = false;
    import('@/lib/pc-scene-engine').then(({ createPCScene }) => {
      if (disposed || !host.current) return;
      try {
        engine.current = createPCScene(host.current, (id) => latest.current.onSelect(id), () => setError(true));
        engine.current.setState(latest.current);
        setReady(true);
      } catch (error) { console.error('3D scene initialization failed', error); setError(true); }
    }).catch((error) => { console.error('3D scene module failed to load', error); if (!disposed) setError(true); });
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.setState(props); }, [props.selected, props.removed, props.hidden, props.explode, props.isolate, props.labels, props.autoRotate]);
  return <div className="pc-viewport" ref={host}>
    {!ready && !error && <div className="scene-loading" role="status"><div className="scene-loading-mark"><Box size={29} strokeWidth={1.3} /></div><span>Preparing your 3D workbench…</span></div>}
    {error && <div className="scene-error" role="alert"><Box size={36} /><h3>The 3D view couldn’t start.</h3><p>This model needs WebGL 2. Try enabling hardware acceleration or opening it in a recent Chrome, Edge, Firefox or Safari browser. You can still explore the component explanations.</p><button className="outlined-button" onClick={() => window.location.reload()}>Reload 3D view</button></div>}
  </div>;
});
export default PCViewport;
