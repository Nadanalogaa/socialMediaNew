import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Undoable state.
 *
 * Changes are coalesced by a label: dragging a slider or a layer produces one
 * history entry rather than a hundred, so undo steps back by something the
 * user recognises as an action rather than by a single frame of movement.
 */

const LIMIT = 60;
const COALESCE_MS = 600;

export interface History<T> {
  state: T;
  set: (next: T, coalesceKey?: string) => void;
  /** Replaces the state without recording it — for loading a saved document. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): History<T> {
  const [state, setState] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  // Forces a re-render when only the stacks change, so buttons enable.
  const [, bump] = useState(0);

  const set = useCallback((next: T, coalesceKey?: string) => {
    setState((current) => {
      const now = Date.now();
      const sameAction =
        coalesceKey &&
        lastKey.current?.key === coalesceKey &&
        now - lastKey.current.at < COALESCE_MS;

      // A continuing action amends the entry already on the stack.
      if (!sameAction) {
        past.current = [...past.current, current].slice(-LIMIT);
        future.current = [];
      }
      lastKey.current = coalesceKey ? { key: coalesceKey, at: now } : null;
      return next;
    });
    bump((n) => n + 1);
  }, []);

  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    lastKey.current = null;
    setState(next);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      const previous = past.current[past.current.length - 1];
      if (previous === undefined) return current;
      past.current = past.current.slice(0, -1);
      future.current = [current, ...future.current].slice(0, LIMIT);
      lastKey.current = null;
      return previous;
    });
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      const next = future.current[0];
      if (next === undefined) return current;
      future.current = future.current.slice(1);
      past.current = [...past.current, current].slice(-LIMIT);
      lastKey.current = null;
      return next;
    });
    bump((n) => n + 1);
  }, []);

  // Cmd/Ctrl+Z and Cmd+Shift+Z, ignored while typing so a text field keeps
  // its own undo.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (typing) return;

      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return {
    state,
    set,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
