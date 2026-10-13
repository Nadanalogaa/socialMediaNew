import { useRef, useState, type ReactNode } from 'react';

/**
 * Bottom sheet for the mobile editor.
 *
 * Overlays the preview rather than pushing it off screen, so what is being
 * edited stays visible while it is edited — the whole problem with putting
 * controls underneath.
 *
 * Three heights: `peek` shows just the tabs, `half` is the working position,
 * and `full` is for long forms. It can be dragged between them.
 */

export type SheetHeight = 'peek' | 'half' | 'full';

/**
 * `half` deliberately leaves the preview visible — the whole reason the sheet
 * overlays rather than stacks. `full` is for long forms and is reached by a
 * deliberate drag.
 */
const HEIGHTS: Record<SheetHeight, string> = {
  peek: '3.5rem',
  half: '42dvh',
  full: '78dvh',
};

export function MobileSheet({
  height,
  onHeightChange,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  height: SheetHeight;
  onHeightChange: (height: SheetHeight) => void;
  tabs: { key: string; label: string }[];
  activeTab: string;
  onTabChange: (key: string) => void;
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
      className="fixed inset-x-0 bottom-14 z-30 flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)] transition-[height] duration-200 lg:hidden"
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

      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
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
