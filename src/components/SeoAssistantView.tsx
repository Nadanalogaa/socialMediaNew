/// <reference lib="dom" />

import React, { useState, useCallback } from 'react';
import { generateSeoSuggestions, generatePostFromIdea } from '../services/geminiService';
import type { SeoSuggestions, View } from '../types';
import { View as ViewEnum } from '../types';


interface SeoConnectorViewProps {
    navigateTo: (view: View, data?: any) => void;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

export const SeoConnectorView: React.FC<SeoConnectorViewProps> = ({ navigateTo }) => {
    const [url, setUrl] = useState('www.nadanaloga.com');
    const [suggestions, setSuggestions] = useState<SeoSuggestions | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingIdea, setLoadingIdea] = useState<number | null>(null);

    const handleGenerate = useCallback(async () => {
        if (!url.trim()) {
            setError("Please enter a website URL.");
            return;
        }
        setError(null);
        setIsLoading(true);
        setSuggestions(null);
        try {
            const result = await generateSeoSuggestions(url);
            setSuggestions(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, [url]);

    const handleCreatePost = useCallback(async (idea: { title: string; description: string }, index: number) => {
        setLoadingIdea(index);
        setError(null);
        try {
            const postIdea = await generatePostFromIdea(idea.title, idea.description);
            navigateTo(ViewEnum.CREATE_POST, postIdea);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`Failed to generate post from idea: ${message}`);
        } finally {
            setLoadingIdea(null);
        }
    }, [navigateTo]);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white">SEO Connector</h1>
                <p className="text-dark-text-secondary mt-1">Generate SEO suggestions and turn them into social media posts instantly.</p>
            </div>

            <div className="bg-dark-card p-6 rounded-lg border border-dark-border mb-8">
                <label htmlFor="website-url" className="block text-sm font-medium text-dark-text-secondary">Your Website URL</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                        type="text"
                        name="website-url"
                        id="website-url"
                        className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md focus:ring-brand-primary focus:border-brand-primary sm:text-sm border-dark-border bg-dark-bg text-dark-text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="www.your-business.com"
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500"
                    >
                        {isLoading ? <LoadingSpinner /> : "Get Suggestions"}
                    </button>
                </div>
                 {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
            </div>

            {isLoading && <p className="text-dark-text-secondary text-center py-8">Analyzing your website and generating suggestions...</p>}

            {suggestions && (
                <div className="space-y-8 animate-fade-in">
                    <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
                        <h2 className="text-xl font-bold text-white mb-3">Meta Title & Description</h2>
                        <div className="p-4 bg-dark-bg rounded-md border border-dark-border">
                            <h3 className="text-lg font-semibold text-brand-light">{suggestions.metaTitle}</h3>
                            <p className="text-dark-text-secondary mt-1">{suggestions.metaDescription}</p>
                        </div>
                    </div>

                    <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
                        <h2 className="text-xl font-bold text-white mb-3">SEO Keywords</h2>
                        <div className="flex flex-wrap gap-2">
                            {suggestions.keywords.map((keyword, index) => (
                                <span key={index} className="px-3 py-1 text-sm bg-brand-primary/20 text-brand-light rounded-full">
                                    {keyword}
                                </span>
                            ))}
                        </div>
                    </div>
                    
                    <div className="bg-dark-card p-6 rounded-lg border border-dark-border">
                        <h2 className="text-xl font-bold text-white mb-4">Blog Post Ideas</h2>
                        <div className="space-y-4">
                            {suggestions.blogIdeas.map((idea, index) => (
                                <div key={index} className="p-4 bg-dark-bg rounded-md border border-dark-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <h3 className="font-semibold text-brand-light">{idea.title}</h3>
                                        <p className="text-sm text-dark-text-secondary mt-1">{idea.description}</p>
                                    </div>
                                    <button 
                                      onClick={() => handleCreatePost(idea, index)}
                                      disabled={isLoading || loadingIdea === index}
                                      className="flex-shrink-0 inline-flex items-center px-4 py-2 border border-transparent text-xs font-medium rounded-md text-brand-primary bg-brand-light hover:bg-gray-200 disabled:opacity-50 disabled:cursor-wait"
                                    >
                                       {loadingIdea === index ? <LoadingSpinner /> : '✨ Create Social Post'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};