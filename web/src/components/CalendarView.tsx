import { useMemo, useState } from 'react';
import type { Post } from '../lib/api';
import { formatTime, monthGrid, sameDay, startOfDay } from '../lib/dates';

/** The date a post sits on: when it is due, else when it went out. */
export function postDate(post: Post): Date {
  return new Date(post.scheduledAt ?? post.publishedAt ?? post.createdAt);
}

const MOVABLE = new Set(['draft', 'scheduled']);

const STATUS_DOT: Record<string, string> = {
  published: 'bg-emerald-500',
  scheduled: 'bg-blue-500',
  publishing: 'bg-blue-400',
  draft: 'bg-slate-400',
  failed: 'bg-red-500',
  partially_failed: 'bg-amber-500',
};

/**
 * A month of posts.
 *
 * Drafts and scheduled posts can be dragged to another day (the time of day
 * is kept). Published posts stay where they happened.
 */
export function CalendarView({
  year,
  month,
  posts,
  selectedDay,
  onSelectDay,
  onSelectPost,
  onMove,
}: {
  year: number;
  month: number;
  posts: Post[];
  selectedDay: Date | null;
  onSelectDay: (day: Date) => void;
  onSelectPost: (post: Post) => void;
  /** Called with the post and the new day; the caller decides the time. */
  onMove: (post: Post, day: Date) => void;
}) {
  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const today = startOfDay(new Date());
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      const key = startOfDay(postDate(post)).toDateString();
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    for (const list of map.values()) list.sort((a, b) => postDate(a).getTime() - postDate(b).getTime());
    return map;
  }, [posts]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const inMonth = day.getMonth() === month;
          const list = byDay.get(day.toDateString()) ?? [];
          const isToday = sameDay(day, today);
          const isSelected = selectedDay ? sameDay(day, selectedDay) : false;
          const past = day < today;
          return (
            <div
              key={i}
              onClick={() => onSelectDay(day)}
              onDragOver={(e) => {
                if (dragging && !past) {
                  e.preventDefault();
                  setOver(i);
                }
              }}
              onDragLeave={() => setOver((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const post = posts.find((p) => p.id === dragging);
                setDragging(null);
                if (post && !past) onMove(post, day);
              }}
              className={`min-h-[5.5rem] border-b border-r border-slate-100 p-1 transition sm:min-h-[6.5rem] ${
                inMonth ? 'bg-white' : 'bg-slate-50/60'
              } ${over === i ? 'bg-brand-50 ring-2 ring-inset ring-brand-400' : ''} ${
                isSelected ? 'ring-2 ring-inset ring-brand-500' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    isToday ? 'bg-brand-600 font-medium text-white' : inMonth ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {day.getDate()}
                </span>
                {list.length > 2 && (
                  <span className="text-[10px] text-slate-400">{list.length}</span>
                )}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {list.slice(0, 3).map((post) => {
                  const movable = MOVABLE.has(post.status);
                  const thumb = post.media[0]?.thumbnailUrl ?? post.media[0]?.url;
                  return (
                    <li key={post.id}>
                      <button
                        draggable={movable}
                        onDragStart={(e) => {
                          if (!movable) return e.preventDefault();
                          setDragging(post.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPost(post);
                        }}
                        title={post.caption || 'No caption'}
                        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-slate-100 ${
                          movable ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${dragging === post.id ? 'opacity-40' : ''}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[post.status] ?? 'bg-slate-400'}`}
                        />
                        {thumb && post.media[0]?.kind === 'image' ? (
                          <img src={thumb} alt="" className="hidden h-4 w-4 shrink-0 rounded object-cover sm:block" />
                        ) : null}
                        <span className="hidden shrink-0 text-slate-500 sm:inline">{formatTime(postDate(post))}</span>
                        <span className="truncate text-slate-800">{post.caption || 'No caption'}</span>
                      </button>
                    </li>
                  );
                })}
                {list.length > 3 && (
                  <li className="px-1 text-[10px] text-slate-500">+{list.length - 3} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
