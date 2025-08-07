
import React from 'react';
import type { Post } from '../types';
import { PostCard } from './PostCard';
import { AnalyticsChart } from './AnalyticsChart';

interface DashboardViewProps {
  posts: Post[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({ posts }) => {
  const totalLikes = posts.reduce((sum, post) => sum + post.engagement.likes, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.engagement.comments, 0);
  const totalShares = posts.reduce((sum, post) => sum + post.engagement.shares, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-text-secondary mt-1">
          Welcome back! Here's a summary of your recent activity.
        </p>
      </div>

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
        <div className="space-y-6">
          {posts.length > 0 ? (
            posts.map(post => <PostCard key={post.id} post={post} />)
          ) : (
            <p className="text-dark-text-secondary text-center py-8">No posts yet. Create one to get started!</p>
          )}
        </div>
      </div>
    </div>
  );
};