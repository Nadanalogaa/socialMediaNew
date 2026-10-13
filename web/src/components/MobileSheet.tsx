import { useRef, useState, type ReactNode } from 'react';

/**
 * The control panel for the mobile editor.
 *
 * It sits *below* the preview rather than over it. An overlay kept the preview
 * visible but left the toolbar and canvas edge showing underneath, which read
 * as broken; a clean split has no layering to go wrong, and the preview is
 * never covered.
 *
 * Two heights: `half` is the working position and `full` is for long forms,
 * reached by dragging the handle. `peek` collapses it to give the preview the
 * whole screen.
 */

export type SheetHeight = 'peek' | 'half' | 'full';

/**
 * `half` deliberately leaves the preview visible — the whole reason the sheet
 * overlays rather than stacks. `full` is for long forms and is reached by a
 * deliberate drag.
 */
const HEIGHTS: Record<SheetHeight, string> = {
  /** Enough for the scene row and the tabs, so context is never hidden. */
  peek: '6.5rem',
  half: '46dvh',
  full: '72dvh',
};

export function MobileSheet({
  height,
  onHeightChange,
  tabs,
  activeTab,
  onTabChange,
  context,
  children,
}: {
  height: SheetHeight;
  onHeightChange: (height: SheetHeight) => void;
  tabs: { key: string; label: string }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  /** Always visible above the tabs: what the controls below apply to. */
  context?: ReactNode;
  children: ReactNode;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<number | null>(null);

  function handlePointerDown(event: React.PointerEvent) {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (dragStart.current === null) return;
    setDragOffset(event.clientY - dragStart.current);
  }

  function handlePointerUp() {
    if (dragStart.current === null) return;
    const moved = dragOffset;
    dragStart.current = null;
    setDragOffset(0);

    // A deliberate flick, not a stray touch.
    if (Math.abs(moved) < 40) return;

    const order: SheetHeight[] = ['peek', 'half', 'full'];
    const index = order.indexOf(height);
    // Dragging down shrinks, dragging up grows.
    const next = moved > 0 ? order[Math.max(index - 1, 0)] : order[Math.min(index + 1, 2)];
    onHeightChange(next!);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-14 z-30 flex flex-col border-t border-slate-200 bg-white lg:hidden"
      style={{
        height: `calc(${HEIGHTS[height]} + ${dragOffset < 0 ? -dragOffset : 0}px)`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* The grab area: dragging here resizes, tapping cycles the height. */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => onHeightChange(height === 'peek' ? 'half' : 'peek')}
        className="flex cursor-grab touch-none items-center justify-center py-2"
      >
        <span className="h-1 w-10 rounded-full bg-slate-300" />
      </div>

      {context && <div className="border-b border-slate-100 px-3 pb-2">{context}</div>}

      <div className="flex gap-1 overflow-x-auto px-3 py-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              onTabChange(tab.key);
              if (height === 'peek') onHeightChange('half');
            }}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
              activeTab === tab.key
                ? 'bg-brand-600 font-medium text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">{children}</div>
    </div>
  );
}
