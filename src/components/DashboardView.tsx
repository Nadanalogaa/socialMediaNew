


import React, { useState } from 'react';
import type { Post, ConnectionDetails } from '../types';
import { PostCard } from './PostCard';
import { AnalyticsChart } from './AnalyticsChart';
import { getPostInsights } from '../services/geminiService';
import { TrashIcon } from './icons/TrashIcon';

interface DashboardViewProps {
  posts: Post[];
  connectionDetails: ConnectionDetails;
  onDeletePost: (postId: string) => void;
  onDeletePosts: (postIds: string[]) => void;
  onUpdatePostEngagement: (postId: string, engagement: { likes: number, comments: number, shares: number }) => void;
  onEditPost: (post: Post) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ posts, connectionDetails, onDeletePost, onDeletePosts, onUpdatePostEngagement, onEditPost }) => {
  const totalLikes = posts.reduce((sum, post) => sum + post.engagement.likes, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.engagement.comments, 0);
  const totalShares = posts.reduce((sum, post) => sum + post.engagement.shares, 0);
  
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSelectPost = (postId: string) => {
    setSelectedPosts(prev => {
        const newSet = new Set(prev);
        if (newSet.has(postId)) {
            newSet.delete(postId);
        } else {
            newSet.add(postId);
        }
        return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPosts.size === posts.length) {
        setSelectedPosts(new Set());
    } else {
        setSelectedPosts(new Set(posts.map(p => p.id)));
    }
  };
  
  const handleDeleteSelected = () => {
    onDeletePosts(Array.from(selectedPosts));
    setSelectedPosts(new Set());
  };
  
  const handleRefreshInsights = async (postId: string) => {
    if (!connectionDetails?.facebook?.pageAccessToken) {
        setError("Cannot refresh insights: Facebook not connected or token missing.");
        setTimeout(() => setError(null), 5000);
        throw new Error("Facebook connection details not found.");
    }
    setError(null);
    try {
        const newEngagement = await getPostInsights(postId, connectionDetails.facebook.pageAccessToken);
        onUpdatePostEngagement(postId, newEngagement);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to refresh insights for post ${postId}:`, message);
        setError(`Failed to refresh insights: ${message}`);
        setTimeout(() => setError(null), 5000);
        throw err; // Re-throw to be caught in PostCard
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-text-secondary mt-1">
          Welcome back! Here's a summary of your recent activity.
        </p>
      </div>

      {error && (
         <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
            <span className="font-bold">Error:</span> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
          <h3 className="text-dark-text-secondary text-sm font-medium">Total Likes</h3>
          <p className="text-3xl font-bold text-white mt-1">{totalLikes}</p>
        </div>
        <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
          <h3 className="text-dark-text-secondary text-sm font-medium">Total Comments</h3>
          <p className="text-3xl font-bold text-white mt-1">{totalComments}</p>
        </div>
        <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
          <h3 className="text-dark-text-secondary text-sm font-medium">Total Shares</h3>
          <p className="text-3xl font-bold text-white mt-1">{totalShares}</p>
        </div>
      </div>

      <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
         <h2 className="text-xl font-bold text-white mb-4">Engagement Over Time</h2>
         <AnalyticsChart posts={posts} />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Post History</h2>
        {posts.length > 0 && (
             <div className="bg-dark-card p-3 rounded-lg border border-dark-border mb-4 flex items-center justify-between sticky top-4 z-10 backdrop-blur-sm bg-opacity-80">
                <div className="flex items-center gap-4">
                    <input
                        id="select-all"
                        type="checkbox"
                        className="h-5 w-5 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary"
                        checked={selectedPosts.size === posts.length && posts.length > 0}
                        onChange={handleSelectAll}
                        aria-label="Select all posts"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium text-dark-text whitespace-nowrap">
                       {selectedPosts.size > 0 ? `${selectedPosts.size} selected` : "Select All"}
                    </label>
                </div>
                {selectedPosts.size > 0 && (
                    <button onClick={handleDeleteSelected} className="flex items-center gap-2 px-3 py-1.5 border border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors">
                        <TrashIcon className="w-4 h-4" />
                        Delete Selected
                    </button>
                )}
            </div>
        )}
        <div className="space-y-6">
          {posts.length > 0 ? (
            posts.map(post => 
                <PostCard 
                    key={post.id} 
                    post={post}
                    isSelected={selectedPosts.has(post.id)}
                    onSelect={handleSelectPost}
                    onDelete={onDeletePost}
                    onEdit={onEditPost}
                    onRefreshInsights={handleRefreshInsights}
                    isFacebookConnected={!!connectionDetails.facebook}
                />
            )
          ) : (
            <p className="text-dark-text-secondary text-center py-8">No posts yet. Create one to get started!</p>
          )}
        </div>
      </div>
    </div>
  );
};