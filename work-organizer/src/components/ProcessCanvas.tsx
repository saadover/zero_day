import { useRef } from 'react';
import { Excalidraw, exportToBlob, getSceneVersion, MainMenu, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';

export interface Scene { elements: unknown[]; appState?: Record<string, unknown> }

/**
 * Full drawing editor: shapes, arrows, lines, text, colours, fonts, freehand, grouping, layers,
 * flowcharts from text (Mermaid) — powered by Excalidraw.
 */
export default function ProcessCanvas({ scene, onChange, readOnly, apiRef, fit }: {
  scene: Scene | null;
  onChange: (s: Scene) => void;
  readOnly: boolean;
  /** Zoom to show the whole drawing on open (e.g. right after a diagram was added). */
  fit?: boolean;
  apiRef?: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastVersion = useRef<number>(-1);
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="excalidraw-wrap">
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a; if (apiRef) apiRef.current = a;
          if (fit) setTimeout(() => a.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85, maxZoom: 1, animate: false }), 150);
        }}
        initialData={{
          elements: restoreElements((scene?.elements ?? []) as never, null),
          appState: { viewBackgroundColor: '#ffffff', ...(scene?.appState ?? {}) },
          scrollToContent: true,
        }}
        viewModeEnabled={readOnly}
        theme={dark ? 'dark' : 'light'}
        UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false } }}
        onChange={(elements, appState) => {
          const v = getSceneVersion(elements);
          if (lastVersion.current === -1) { lastVersion.current = v; return; } // initial load
          if (v === lastVersion.current) return;
          lastVersion.current = v;
          onChange({
            elements: elements.filter((e) => !e.isDeleted) as unknown[],
            appState: { viewBackgroundColor: appState.viewBackgroundColor, currentItemFontFamily: appState.currentItemFontFamily },
          });
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

export async function canvasToPng(api: ExcalidrawImperativeAPI): Promise<Blob> {
  return exportToBlob({ elements: api.getSceneElements(), appState: { ...api.getAppState(), exportBackground: true }, files: api.getFiles(), mimeType: 'image/png' });
}
