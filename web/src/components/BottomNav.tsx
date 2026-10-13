import { useEffect, useState } from 'react';

/**
 * Mobile navigation.
 *
 * A thumb-reachable bar of the things people do most, with everything else
 * behind "More". Eight tabs in a scrolling strip at the top of the screen is
 * neither reachable nor discoverable on a phone.
 */

export interface NavItem {
  key: string;
  label: string;
  icon: string;
}

export function BottomNav({
  primary,
  overflow,
  active,
  onSelect,
  onSignOut,
}: {
  primary: NavItem[];
  overflow: NavItem[];
  active: string;
  onSelect: (key: string) => void;
  onSignOut: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // A tab change should always close the sheet, however it was triggered.
  useEffect(() => setMoreOpen(false), [active]);

  const overflowActive = overflow.some((item) => item.key === active);

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
            <ul className="grid grid-cols-3 gap-1">
              {overflow.map((item) => (
                <li key={item.key}>
                  <button
                    onClick={() => onSelect(item.key)}
                    className={`flex w-full flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs transition ${
                      active === item.key
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span aria-hidden className="text-lg">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={onSignOut}
              className="mt-1 w-full rounded-xl px-2 py-3 text-sm text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <ul
          className="mx-auto flex max-w-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {primary.map((item) => (
            <li key={item.key} className="flex-1">
              <button
                onClick={() => onSelect(item.key)}
                aria-current={active === item.key ? 'page' : undefined}
                /* 56px tall: comfortably above the 44px minimum touch target. */
                className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] transition ${
                  active === item.key ? 'text-brand-700' : 'text-slate-500'
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icon}
                </span>
                {item.label}
              </button>
            </li>
          ))}
          <li className="flex-1">
            <button
              onClick={() => setMoreOpen((open) => !open)}
              className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] transition ${
                overflowActive || moreOpen ? 'text-brand-700' : 'text-slate-500'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                ⋯
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
