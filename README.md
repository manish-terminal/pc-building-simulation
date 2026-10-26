# Inside the PC

A browser-based Three.js hardware lab for teaching how a typical ATX desktop computer fits together.

## Run locally

Requires Node.js 22.15+ (Node.js 24 recommended).

```sh
npm install
npm run dev
```

Open the local URL printed by the development server. The app uses React/Vinext with a Three.js scene loaded on the client. Fonts, geometry and all textures are included in the build; the model does not download external 3D assets.

## Explore

- Drag to orbit; right-drag to pan; scroll or pinch to zoom.
- Select a component in the model or component list to read its role and connections.
- Isolate any component to examine it from every side.
- Remove and reinstall parts individually, or spread out the complete assembly with the spacing slider.
- Start guided disassembly for a nine-step sequence, leaving the chassis as the final structure.
- Show labels, hide individual parts, choose front/side camera views, or enter focus mode for projection.
- Keyboard: R resets, L toggles labels, Escape exits isolation/focus. Focus the canvas for arrow-key panning and +/− zoom.

The 10 component groups are the chassis, side panel, motherboard, CPU, CPU cooler, RAM pair, graphics card, NVMe SSD, PSU and front fan pair. It is a generic teaching model, not a manufacturer-specific CAD assembly. Cables and fasteners are simplified and the connections are not a physical repair procedure.

## Implementation

- `lib/tower.ts`: original procedural model, instanced details, material/label generation.
- `lib/pc-scene-engine.ts`: lighting, shadows, picking, camera fitting, exploded assembly and resource cleanup.
- `lib/components-data.ts`: teaching content, extraction dependencies and reinstallation rules.
- `components/hardware-lab.tsx`: responsive workbench and teaching interactions.
- `lib/webmcp.ts`: optional, feature-detected agent tools for reading, inspection and assembly spacing.

Rendering requires WebGL 2 and hardware acceleration. An accessible explanation list remains available when WebGL cannot initialize. Reduced-motion preferences disable automatic rotation and smooth movement. The renderer pauses drawing when the scene is unchanged and caps its pixel ratio for classroom devices.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests cover guided and arbitrary assembly sequences, geometry integrity/picking tags, and optional agent-tool input contracts. Production build and route response are checked separately. Manual browser interaction and visual QA were not performed. A supported browser WebMCP context was unavailable for live registry validation; optional tool contracts were checked in Node.

## Learning references

Component explanations were checked against [Intel’s PC assembly guide](https://www.intel.com/content/www/us/en/gaming/resources/how-to-build-a-gaming-pc.html). Example specifications describe fictional hardware and are not a compatibility or shopping list.
