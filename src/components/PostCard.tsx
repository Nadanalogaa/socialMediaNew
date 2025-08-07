
import React from 'react';
import type { Post } from '../types';
import { Platform } from '../types';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';

interface PostCardProps {
  post: Post;
}

const PlatformIcons: React.FC<{ platforms: Platform[] }> = ({ platforms }) => (
    <div className="flex space-x-2">
        {platforms.includes(Platform.Facebook) && <FacebookIcon className="w-5 h-5 text-blue-500" />}
        {platforms.includes(Platform.Instagram) && <InstagramIcon className="w-5 h-5 text-pink-500" />}
        {platforms.includes(Platform.YouTube) && <YoutubeIcon className="w-5 h-5 text-red-600" />}
    </div>
);

const timeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden flex flex-col md:flex-row">
      {post.imageUrl && (
        <div className="md:w-1/3">
          <img
            src={post.imageUrl}
            alt="Post visual"
            className="w-full h-48 md:h-full object-cover"
          />
        </div>
      )}
      <div className={`p-6 ${post.imageUrl ? 'md:w-2/3' : 'w-full'}`}>
        <div className="flex justify-between items-start mb-3">
            <div>
                 <p className="text-sm text-dark-text-secondary">Posted to <span className="font-semibold text-dark-text">{post.audience}</span></p>
                 <p className="text-xs text-dark-text-secondary">{timeAgo(post.postedAt)}</p>
            </div>
          <PlatformIcons platforms={post.platforms} />
        </div>
        
        <p className="text-sm text-dark-text-secondary italic mb-4">Prompt: "{post.prompt}"</p>

        <div className="space-y-4 text-sm">
            {post.platforms.includes(Platform.Facebook) && post.generatedContent.facebook && (
                <div>
                    <h4 className="font-bold text-blue-400">Facebook Post</h4>
                    <p className="text-dark-text">{post.generatedContent.facebook}</p>
                </div>
            )}
            {post.platforms.includes(Platform.Instagram) && post.generatedContent.instagram && (
                <div>
                    <h4 className="font-bold text-pink-400">Instagram Caption</h4>
                    <p className="text-dark-text">{post.generatedContent.instagram}</p>
                </div>
            )}
            {post.platforms.includes(Platform.YouTube) && post.generatedContent.youtubeTitle && (
                 <div>
                    <h4 className="font-bold text-red-500">YouTube</h4>
                    <p className="text-dark-text font-semibold">{post.generatedContent.youtubeTitle}</p>
                    <p className="text-dark-text-secondary whitespace-pre-wrap">{post.generatedContent.youtubeDescription}</p>
                </div>
            )}
             {post.generatedContent.hashtags && post.generatedContent.hashtags.length > 0 && (
                 <p className="text-brand-secondary text-xs">
                    {post.generatedContent.hashtags.map(h => `#${h}`).join(' ')}
                 </p>
             )}
        </div>

        <div className="mt-6 pt-4 border-t border-dark-border flex space-x-6 text-sm text-dark-text-secondary">
            <span>❤️ {post.engagement.likes} Likes</span>
            <span>💬 {post.engagement.comments} Comments</span>
            <span>🔁 {post.engagement.shares} Shares</span>
        </div>
      </div>
    </div>
  );
};