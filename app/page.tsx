'use client';

import { useState } from 'react';
import HardwareLab from '@/components/hardware-lab';
import BuildMode from '@/components/build-mode';

export default function Home() {
  const [mode, setMode] = useState<'explore' | 'build'>('explore');

  if (mode === 'build') {
    return <BuildMode onExit={() => setMode('explore')} />;
  }

  return <HardwareLab onBuild={() => setMode('build')} />;
}
