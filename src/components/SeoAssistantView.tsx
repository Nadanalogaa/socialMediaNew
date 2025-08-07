
import React, { useState, useCallback } from 'react';
import { generateSeoSuggestions } from '../services/geminiService';
import type { SeoSuggestions } from '../types';

export const SeoAssistantView: React.FC = () => {
    const [url, setUrl] = useState('www.nadanaloga.com');
    const [suggestions, setSuggestions] = useState<SeoSuggestions | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, [url]);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white">SEO Assistant</h1>
                <p className="text-dark-text-secondary mt-1">Boost your website's search engine ranking with AI-powered suggestions.</p>
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
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : "Get Suggestions"}
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
                                <div key={index} className="p-4 bg-dark-bg rounded-md border border-dark-border">
                                    <h3 className="font-semibold text-brand-light">{idea.title}</h3>
                                    <p className="text-sm text-dark-text-secondary mt-1">{idea.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};