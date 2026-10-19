import type { Connection, MediaAsset } from '../lib/api';

/**
 * What the post will look like on each network, drawn from the real caption,
 * media and Page name. Not pixel-perfect — enough to catch a caption that
 * runs long, a hashtag wall, or a photo that crops badly on Instagram.
 */
export function PostPreview({
  connection,
  caption,
  hashtags,
  asset,
  firstComment,
}: {
  connection: Connection;
  caption: string;
  hashtags: string[];
  asset: MediaAsset | null;
  firstComment: string;
}) {
  const tags = hashtags.map((h) => `#${h}`).join(' ');
  const isInstagram = connection.provider === 'instagram_business';
  const handle = isInstagram ? connection.displayName.replace(/^@/, '') : connection.displayName;

  return isInstagram ? (
    <InstagramCard handle={handle} avatar={connection.avatarUrl} caption={caption} tags={tags} asset={asset} firstComment={firstComment} />
  ) : (
    <FacebookCard name={handle} avatar={connection.avatarUrl} caption={caption} tags={tags} asset={asset} firstComment={firstComment} />
  );
}

function Avatar({ src, name, round = true }: { src: string | null; name: string; round?: boolean }) {
  const shape = round ? 'rounded-full' : 'rounded-lg';
  return src ? (
    <img src={src} alt="" className={`h-8 w-8 shrink-0 object-cover ${shape}`} />
  ) : (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center bg-slate-200 text-[10px] font-semibold text-slate-600 ${shape}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Media({ asset, square }: { asset: MediaAsset | null; square: boolean }) {
  if (!asset) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${square ? 'aspect-square' : 'aspect-[4/3]'}`}>
        Photo or video goes here
      </div>
    );
  }
  if (asset.kind === 'video') {
    return <video src={asset.url} muted playsInline className={`w-full bg-black object-cover ${square ? 'aspect-square' : 'aspect-[4/5] max-h-80'}`} />;
  }
  return <img src={asset.thumbnailUrl ?? asset.url} alt="" className={`w-full object-cover ${square ? 'aspect-square' : 'max-h-80'}`} />;
}

/** Instagram shows ~125 characters of a caption before "more". */
const IG_FOLD = 125;

function InstagramCard({ handle, avatar, caption, tags, asset, firstComment }: { handle: string; avatar: string | null; caption: string; tags: string; asset: MediaAsset | null; firstComment: string }) {
  const full = [caption.trim(), tags].filter(Boolean).join('\n\n');
  const folded = full.length > IG_FOLD;
  const shown = folded ? `${full.slice(0, IG_FOLD).trimEnd()}` : full;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar src={avatar} name={handle} />
        <span className="font-semibold">{handle}</span>
        <span className="ml-auto text-slate-400">···</span>
      </div>
      <Media asset={asset} square />
      <div className="px-3 pt-2 text-lg text-slate-800">♡ &nbsp; ◯ &nbsp; ⇗</div>
      <div className="px-3 pb-3 pt-1">
        <p className="whitespace-pre-line">
          <span className="font-semibold">{handle}</span> {shown || <span className="text-slate-400">Your caption…</span>}
          {folded && <span className="text-slate-400">… more</span>}
        </p>
        {firstComment.trim() && (
          <p className="mt-1 whitespace-pre-line text-slate-700">
            <span className="font-semibold">{handle}</span> {firstComment.trim()}
          </p>
        )}
        <p className="mt-1 text-[11px] uppercase text-slate-400">Just now</p>
      </div>
    </div>
  );
}

function FacebookCard({ name, avatar, caption, tags, asset, firstComment }: { name: string; avatar: string | null; caption: string; tags: string; asset: MediaAsset | null; firstComment: string }) {
  const full = [caption.trim(), tags].filter(Boolean).join('\n\n');
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar src={avatar} name={name} />
        <div>
          <p className="font-semibold leading-tight">{name}</p>
          <p className="text-[11px] text-slate-500">Just now · 🌐</p>
        </div>
        <span className="ml-auto text-slate-400">···</span>
      </div>
      <p className="whitespace-pre-line px-3 pb-2">{full || <span className="text-slate-400">Your caption…</span>}</p>
      <Media asset={asset} square={false} />
      <div className="flex justify-around border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↗ Share</span>
      </div>
      {firstComment.trim() && (
        <div className="flex items-start gap-2 border-t border-slate-100 px-3 py-2">
          <Avatar src={avatar} name={name} />
          <div className="rounded-2xl bg-slate-100 px-3 py-1.5">
            <p className="font-semibold">{name}</p>
            <p className="whitespace-pre-line text-slate-800">{firstComment.trim()}</p>
          </div>
        </div>
      )}
    </div>
  );
}
