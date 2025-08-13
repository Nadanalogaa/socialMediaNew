
/// <reference lib="dom" />

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Platform, Audience, Post, ConnectionStatus, MediaAsset, GeneratedPostIdea, ConnectionDetails } from '../types';
import { Platform as PlatformEnum, Audience as AudienceEnum } from '../types';
import { publishPost, generateAssetContent } from '../services/geminiService';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { YoutubeIcon } from './icons/YoutubeIcon';
import { getDraftsFromDB, saveDraftsToDB } from '../utils/db';

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            resolve(reader.result);
        } else {
            reject(new Error('Failed to convert file to base64 string.'));
        }
    };
    reader.onerror = error => reject(error);
});

interface CreatePostViewProps {
    connections: ConnectionStatus;
    connectionDetails: ConnectionDetails;
    onPostPublished: (post: Post) => void;
    postSeed: GeneratedPostIdea | Post | null;
    clearPostSeed: () => void;
}

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-5 w-5' }) => (
    <svg className={`animate-spin ${size} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const MediaPlaceholder: React.FC<{ prompt: string; onAddMedia: () => void }> = ({ prompt, onAddMedia }) => (
     <div className="flex flex-col items-center justify-center w-full aspect-video bg-dark-bg rounded-lg p-4 text-center border-2 border-dashed border-dark-border">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-dark-text-secondary"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        <p className="text-xs text-dark-text-secondary mt-2">AI Image Prompt:</p>
        <p className="text-sm font-medium text-white italic mb-3">"{prompt}"</p>
        <button onClick={onAddMedia} className="bg-brand-light text-brand-primary hover:bg-opacity-90 text-xs font-bold py-1 px-3 rounded-md">
            Add Media
        </button>
    </div>
);


export const CreatePostView: React.FC<CreatePostViewProps> = ({ connections, connectionDetails, onPostPublished, postSeed, clearPostSeed }) => {
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [draftsLoaded, setDraftsLoaded] = useState(false);
    const [audience, setAudience] = useState<Audience>(AudienceEnum.Global);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [assetForMediaUpload, setAssetForMediaUpload] = useState<string | null>(null);

    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [isBulkGenerating, setIsBulkGenerating] = useState(false);
    const [isBulkPublishing, setIsBulkPublishing] = useState(false);
    
    const [isFfmpegLoaded, setIsFfmpegLoaded] = useState(false);
    const ffmpegRef = useRef<any>(null);

    // Load assets from IndexedDB on initial mount
    useEffect(() => {
        const loadAssets = async () => {
            try {
                const storedAssets = await getDraftsFromDB();
                if (storedAssets && storedAssets.length > 0) {
                    const assetsWithPreviews = storedAssets.map(asset => {
                        // ALWAYS recreate blob URLs for previews from the File object on load,
                        // because they are session-specific and were not stored in the DB.
                        if (asset.file) {
                             // The 'file' property is a File object that was persisted.
                            return { ...asset, previewUrl: URL.createObjectURL(asset.file) };
                        }
                        // This handles assets that don't have a local file (e.g., from SEO page, or edited posts with remote images)
                        return asset;
                    }).filter(a => a.status !== 'published');
                    
                    setAssets(assetsWithPreviews);
                }
            } catch (error) {
                console.error("Failed to load drafts from IndexedDB:", error);
            } finally {
                setDraftsLoaded(true);
            }
        };
        loadAssets();
    }, []);

    // Sync assets to IndexedDB whenever they change
    useEffect(() => {
        if (draftsLoaded) {
           saveDraftsToDB(assets);
        }
    }, [assets, draftsLoaded]);

    useEffect(() => {
        if (postSeed) {
            let newAsset: MediaAsset;
            if ('postedAt' in postSeed) { // Type guard: it's a Post object
                const post = postSeed as Post;
                newAsset = {
                    id: `asset_${Date.now()}`,
                    file: undefined,
                    previewUrl: post.imageUrl,
                    name: post.generatedContent.youtubeTitle || "Copied Post",
                    prompt: post.prompt,
                    description: post.generatedContent.facebook || post.generatedContent.instagram || post.generatedContent.youtubeDescription || '',
                    hashtags: post.generatedContent.hashtags,
                    platforms: post.platforms,
                    status: 'idle',
                    errorMessage: post.imageUrl ? 'This is a copy. To publish, confirm or change the media.' : 'This is a copy. Please add media to publish.',
                };
            } else { // It's a GeneratedPostIdea
                const idea = postSeed as GeneratedPostIdea;
                newAsset = {
                    id: `asset_${Date.now()}`,
                    file: undefined,
                    previewUrl: undefined,
                    name: "Generated Social Post",
                    prompt: idea.imagePrompt,
                    description: idea.postText,
                    hashtags: idea.hashtags,
                    platforms: [PlatformEnum.Facebook],
                    status: 'idle',
                };
            }
            setAssets(prev => [newAsset, ...prev]);
            clearPostSeed();
        }
    }, [postSeed, clearPostSeed]);

    useEffect(() => {
        const loadFfmpeg = async () => {
            try {
                const { FFmpeg } = await import('@ffmpeg/ffmpeg');
                const { toBlobURL } = await import('@ffmpeg/util');

                const ffmpeg = new FFmpeg();
                ffmpegRef.current = ffmpeg;
                
                ffmpeg.on('log', ({ message }) => {
                    console.log('[FFMPEG]:', message);
                });
                
                // Use the multi-threaded version of FFmpeg core for performance.
                // All assets are loaded as Blob URLs to prevent cross-origin issues.
                // Using a consistent version (@0.12.6) for all core assets.
                const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/esm';
                await ffmpeg.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
                });
                setIsFfmpegLoaded(true);
                console.log('FFmpeg loaded successfully.');
            } catch (err) {
                console.error("Failed to load FFmpeg", err);
            }
        };
        loadFfmpeg();
    }, []);


    const updateAsset = useCallback((id: string, updates: Partial<MediaAsset>) => {
        setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }, []);

    const handleCompressVideo = async (assetId: string, file: File) => {
        const ffmpeg = ffmpegRef.current;
        if (!isFfmpegLoaded || !ffmpeg) {
            updateAsset(assetId, { status: 'error', errorMessage: 'Compression library not ready. Please refresh and try again.' });
            return;
        }

        updateAsset(assetId, { status: 'compressing', errorMessage: undefined });

        try {
            const { fetchFile } = await import('@ffmpeg/util');
            const inputFileName = `input_${file.name}`;
            const outputFileName = 'output.mp4';

            await ffmpeg.writeFile(inputFileName, await fetchFile(file));
            await ffmpeg.exec(['-i', inputFileName, '-vf', 'scale=iw/2:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', outputFileName]);

            const data = await ffmpeg.readFile(outputFileName);
            const compressedFileBlob = new Blob([data], { type: 'video/mp4' });
            const compressedFile = new File([compressedFileBlob], file.name.replace(/\.[^/.]+$/, "") + '_compressed.mp4', { type: 'video/mp4' });

            await ffmpeg.deleteFile(inputFileName);
            await ffmpeg.deleteFile(outputFileName);
            
            updateAsset(assetId, {
                file: compressedFile,
                previewUrl: URL.createObjectURL(compressedFile),
                status: 'idle',
                errorMessage: `Compressed from ${(file.size / 1024 / 1024).toFixed(1)}MB to ${(compressedFile.size / 1024 / 1024).toFixed(1)}MB`,
            });
            
            setTimeout(() => {
                setAssets(currentAssets => currentAssets.map(a => {
                    if (a.id === assetId && a.errorMessage?.startsWith('Compressed')) {
                        return { ...a, errorMessage: undefined };
                    }
                    return a;
                }));
            }, 5000);

        } catch (error) {
            console.error('Video compression failed:', error);
            updateAsset(assetId, { status: 'error', errorMessage: 'Video compression failed. The video might be in an unsupported format.' });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const MAX_VIDEO_SIZE_MB_BEFORE_COMPRESSION = 20;
        const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB_BEFORE_COMPRESSION * 1024 * 1024;
        
        const processFile = (file: File, existingAssetId?: string) => {
            const isVideo = file.type.startsWith('video/');
            const needsCompression = isVideo && file.size > MAX_VIDEO_SIZE_BYTES;

            const assetId = existingAssetId || `asset_${Date.now()}_${Math.random()}`;
            
            const commonAssetData = {
                file,
                previewUrl: URL.createObjectURL(file),
                status: 'idle' as MediaAsset['status'],
                errorMessage: undefined
            };

            if (existingAssetId) {
                 updateAsset(existingAssetId, commonAssetData);
            } else {
                const newAsset: MediaAsset = {
                    id: assetId,
                    name: file.name.split('.').slice(0, -1).join('.').replace(/[\-_]/g, ' '),
                    prompt: '', description: '', hashtags: [], platforms: [PlatformEnum.Facebook],
                    ...commonAssetData
                };
                setAssets(prev => [newAsset, ...prev]);
            }

            if (needsCompression) {
                if(isFfmpegLoaded) {
                    setTimeout(() => handleCompressVideo(assetId, file), 100);
                } else {
                    updateAsset(assetId, { status: 'error', errorMessage: 'Compression engine is loading. Please wait and try re-uploading the file.' });
                }
            }
        };

        if (assetForMediaUpload) {
            const file = files[0];
            if (file) {
                processFile(file, assetForMediaUpload);
            }
        } else {
            Array.from(files).forEach(file => processFile(file));
        }

        if (e.target) e.target.value = '';
        setAssetForMediaUpload(null);
    };


    const handleAddMediaClick = (assetId: string) => {
        setAssetForMediaUpload(assetId);
        fileInputRef.current?.click();
    };
    
    const handleUploadAreaClick = () => {
        setAssetForMediaUpload(null);
        fileInputRef.current?.click();
    }
    
    const handleGenerateContent = useCallback(async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !asset.prompt.trim()) {
            updateAsset(assetId, { status: 'error', errorMessage: 'Please enter a prompt.' });
            return Promise.reject(new Error('Prompt is empty.'));
        }
        
        updateAsset(assetId, { status: 'generating', errorMessage: undefined });
        
        try {
            const result = await generateAssetContent(asset.prompt);
            updateAsset(assetId, {
                name: result.name,
                description: result.description,
                hashtags: result.hashtags,
                status: 'idle',
            });
            return Promise.resolve();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to generate content.';
            updateAsset(assetId, { status: 'error', errorMessage: message });
            return Promise.reject(err);
        }
    }, [assets, updateAsset]);

    const handlePublish = async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || (!asset.file && !asset.previewUrl?.startsWith('data:'))) {
            updateAsset(assetId, { status: 'error', errorMessage: 'Please add an image or video before publishing.' });
            return;
        };
        
        if (asset.status === 'error' && asset.errorMessage?.includes('too large')) {
             updateAsset(assetId, { status: 'error', errorMessage: 'Cannot publish, video file is too large.' });
            return;
        }

        const unconnected = asset.platforms.filter(p => !connections[p]);
        if (unconnected.length > 0) {
            updateAsset(assetId, { status: 'error', errorMessage: `Please connect ${unconnected.join(', ')} first.`});
            return;
        }

        updateAsset(assetId, { status: 'publishing', errorMessage: undefined });
        
        let imageUrlData: string;

        // If the asset came from an edited post, the previewUrl is a data URL (from image)
        // or a regular URL (from video). We handle data URL.
        if (asset.previewUrl?.startsWith('data:')) {
            imageUrlData = asset.previewUrl;
        } else if (asset.file) {
            try {
                imageUrlData = await toBase64(asset.file);
            } catch (error) {
                console.error("Error converting file to base64:", error);
                updateAsset(assetId, { status: 'error', errorMessage: 'Could not read the image file for upload.' });
                return;
            }
        } else {
             updateAsset(assetId, { status: 'error', errorMessage: 'Media is missing.' });
             return;
        }

        const postToCreate: Omit<Post, 'id' | 'engagement' | 'postedAt'> = {
            platforms: asset.platforms,
            audience,
            imageUrl: imageUrlData,
            prompt: asset.prompt,
            generatedContent: {
                facebook: asset.description,
                instagram: asset.description,
                youtubeTitle: asset.name,
                youtubeDescription: asset.description,
                hashtags: asset.hashtags,
            }
        };

        try {
            const newPost = await publishPost(postToCreate, connectionDetails);
            onPostPublished(newPost);
            updateAsset(assetId, { status: 'published' });
            setTimeout(() => {
                setAssets(prev => prev.filter(a => a.id !== assetId));
                 setSelectedAssets(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(assetId);
                    return newSet;
                });
            }, 2000);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to publish.';
            updateAsset(assetId, { status: 'error', errorMessage: message });
        }
    };

    const togglePlatform = (assetId: string, platform: Platform) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset) return;
        
        const currentPlatforms = new Set(asset.platforms);

        if (currentPlatforms.has(platform)) {
            currentPlatforms.delete(platform);
            if (platform === PlatformEnum.Facebook) {
                currentPlatforms.delete(PlatformEnum.Instagram);
            }
        } else {
            currentPlatforms.add(platform);
            if (platform === PlatformEnum.Instagram) {
                currentPlatforms.add(PlatformEnum.Facebook);
            }
        }
        updateAsset(assetId, { platforms: Array.from(currentPlatforms), status: 'idle' });
    };

    const handleToggleSelect = (assetId: string) => {
        setSelectedAssets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(assetId)) {
                newSet.delete(assetId);
            } else {
                newSet.add(assetId);
            }
            return newSet;
        });
    };

    const handleToggleSelectAll = () => {
        const selectableAssets = assets.filter(a => a.status !== 'published');
        if (selectedAssets.size === selectableAssets.length) {
            setSelectedAssets(new Set());
        } else {
            setSelectedAssets(new Set(selectableAssets.map(a => a.id)));
        }
    };
    
    const handleBulkGenerate = async () => {
        setIsBulkGenerating(true);
        const promises = Array.from(selectedAssets).map(assetId => handleGenerateContent(assetId));
        await Promise.allSettled(promises);
        setIsBulkGenerating(false);
    };

    const handleBulkPublish = async () => {
        setIsBulkPublishing(true);
        const selectedAssetIds = Array.from(selectedAssets);
        for (const assetId of selectedAssetIds) {
            const asset = assets.find(a => a.id === assetId);
            if (asset && asset.status !== 'publishing' && asset.status !== 'published') {
                 await handlePublish(assetId);
            }
        }
        setIsBulkPublishing(false);
    };

    const selectableAssetsCount = assets.filter(a => a.status !== 'published').length;
    const isAllSelected = selectableAssetsCount > 0 && selectedAssets.size === selectableAssetsCount;
    
    return (
        <div className="max-w-7xl mx-auto animate-fade-in space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Create Posts</h1>
                <p className="text-dark-text-secondary mt-1">Select assets to bulk generate content or publish them all at once.</p>
            </div>
            
            {selectedAssets.size > 0 && (
                 <div className="sticky top-4 bg-dark-card/90 backdrop-blur-sm z-10 p-4 rounded-lg border border-dark-border animate-fade-in">
                    <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4">
                             <p className="text-sm font-medium text-dark-text">{selectedAssets.size} of {selectableAssetsCount} selected</p>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleBulkGenerate}
                                disabled={isBulkGenerating || isBulkPublishing}
                                className="flex items-center justify-center gap-2 px-3 py-2 border border-transparent rounded-md shadow-sm text-xs font-medium text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                                {isBulkGenerating ? <LoadingSpinner size="h-4 w-4" /> : '✨'}
                                <span>Bulk Generate</span>
                            </button>
                            <button
                                onClick={handleBulkPublish}
                                disabled={isBulkPublishing || isBulkGenerating}
                                className="flex items-center justify-center gap-2 px-3 py-2 border border-transparent rounded-md shadow-sm text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                                {isBulkPublishing && <LoadingSpinner size="h-4 w-4" />}
                                <span>Bulk Publish ({selectedAssets.size})</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="space-y-6">
                <div 
                    className="relative block w-full border-2 border-dark-border border-dashed rounded-lg p-12 text-center hover:border-brand-primary transition-colors cursor-pointer bg-dark-card/50"
                    onClick={handleUploadAreaClick}
                >
                    <svg className="mx-auto h-12 w-12 text-dark-text-secondary" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="mt-2 block text-sm font-semibold text-white">Upload Images or Videos</span>
                    <span className="block text-xs text-dark-text-secondary">Drag and drop or click to select files</span>
                    <input ref={fileInputRef} type="file" multiple={!assetForMediaUpload} onChange={handleFileChange} className="sr-only" accept="image/*,video/*" />
                </div>

                {assets.length > 0 && (
                     <div className="bg-dark-card p-4 rounded-lg border border-dark-border flex items-center justify-between">
                        <div>
                            <label htmlFor="audience" className="block text-sm font-medium text-dark-text-secondary mb-2">Global Target Audience for all Posts</label>
                            <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className="w-full md:w-auto bg-dark-bg border border-dark-border rounded-md p-2 focus:ring-brand-primary focus:border-brand-primary text-dark-text">
                                {Object.values(AudienceEnum).map(a => <option key={a}>{a}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-3">
                             <label htmlFor="select-all" className="text-sm font-medium text-dark-text">Select All</label>
                             <input
                                id="select-all"
                                type="checkbox"
                                className="h-5 w-5 rounded bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary"
                                checked={isAllSelected}
                                onChange={handleToggleSelectAll}
                                aria-label="Select all assets"
                            />
                        </div>
                     </div>
                )}
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
            {assets.map((asset) => (
                <div key={asset.id} className={`relative bg-dark-card rounded-lg border flex flex-col transition-all duration-500 ${selectedAssets.has(asset.id) ? 'border-brand-primary ring-2 ring-brand-primary' : 'border-dark-border'} ${asset.status === 'published' ? 'opacity-50 scale-95' : ''}`}>
                     {asset.status !== 'published' && (
                        <div className="absolute top-2 left-2 z-10 bg-dark-card/50 p-1 rounded-full backdrop-blur-sm">
                            <input
                                type="checkbox"
                                className="h-5 w-5 rounded-full bg-dark-bg border-dark-border text-brand-primary focus:ring-brand-primary focus:ring-offset-0"
                                checked={selectedAssets.has(asset.id)}
                                onChange={() => handleToggleSelect(asset.id)}
                                aria-label={`Select asset ${asset.name}`}
                            />
                        </div>
                     )}
                     {selectedAssets.has(asset.id) && <div className="absolute inset-0 bg-brand-primary/10 rounded-lg pointer-events-none"></div>}

                    {asset.status === 'compressing' && (
                        <div className="absolute inset-0 bg-dark-card/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-lg">
                            <LoadingSpinner size="h-10 w-10" />
                            <p className="mt-4 text-white font-semibold">Compressing video...</p>
                            <p className="text-sm text-dark-text-secondary">This may take a moment.</p>
                        </div>
                    )}

                    <div className="p-4 flex-grow space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-3">
                               {asset.previewUrl && (asset.file?.type.startsWith('image/') || asset.previewUrl.startsWith('data:image')) ? (
                                    <img src={asset.previewUrl} alt="Preview" className="rounded-lg w-full object-cover aspect-video bg-dark-bg" />
                                ) : asset.previewUrl && (asset.file?.type.startsWith('video/') || asset.previewUrl.startsWith('data:video')) ? (
                                    <video src={asset.previewUrl} controls className="rounded-lg w-full aspect-video bg-black"></video>
                                ) : (
                                   <MediaPlaceholder prompt={asset.prompt} onAddMedia={() => handleAddMediaClick(asset.id)} />
                                )}
                                <textarea value={asset.prompt} onChange={(e) => updateAsset(asset.id, { prompt: e.target.value, status: 'idle' })} placeholder="e.g., A dancer in a dramatic pose" className="w-full bg-dark-bg border border-dark-border rounded-md p-2 text-sm focus:ring-brand-primary focus:border-brand-primary" rows={2}/>
                                <button onClick={() => handleGenerateContent(asset.id)} disabled={asset.status === 'generating' || !asset.prompt} className="w-full flex justify-center items-center py-2 px-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500 disabled:cursor-not-allowed">
                                    {asset.status === 'generating' ? <LoadingSpinner /> : '✨ Generate AI Content'}
                                </button>
                            </div>

                            <div className="space-y-3 flex flex-col">
                                 <div>
                                    <label className="text-xs font-bold text-dark-text-secondary">Title</label>
                                    <input type="text" value={asset.name} onChange={(e) => updateAsset(asset.id, { name: e.target.value })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" />
                                 </div>
                                 <div className="flex-grow">
                                    <label className="text-xs font-bold text-dark-text-secondary">Description</label>
                                    <textarea rows={5} value={asset.description} onChange={(e) => updateAsset(asset.id, { description: e.target.value })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm h-full"/>
                                 </div>
                                 <div>
                                    <label className="text-xs font-bold text-dark-text-secondary">Hashtags</label>
                                    <input type="text" value={asset.hashtags.join(' ')} onChange={(e) => updateAsset(asset.id, { hashtags: e.target.value.split(' ').map(h => h.replace('#', '')) })} className="w-full mt-1 bg-dark-bg border border-dark-border rounded-md p-2 text-sm" placeholder="dance art inspiration"/>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-dark-border space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-dark-text-secondary mb-2">Select Platforms</label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.values(PlatformEnum).map(p => (
                                        <button key={p}
                                            onClick={() => togglePlatform(asset.id, p)}
                                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md border text-xs transition-all ${asset.platforms.includes(p) ? 'bg-brand-secondary border-brand-secondary text-white' : 'bg-dark-bg border-dark-border hover:border-brand-secondary'}`}>
                                            {p === PlatformEnum.Facebook && <FacebookIcon className="w-4 h-4" />}
                                            {p === PlatformEnum.Instagram && <InstagramIcon className="w-4 h-4" />}
                                            {p === PlatformEnum.YouTube && <YoutubeIcon className="w-4 h-4" />}
                                            <span>{p}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                         </div>
                    </div>
                    <div className="bg-gray-900/50 p-3 flex items-center gap-4">
                         <button onClick={() => handlePublish(asset.id)} disabled={(!asset.file && !asset.previewUrl?.startsWith('data:')) || (asset.status !== 'idle' && asset.errorMessage?.startsWith('Compressed') === false && asset.errorMessage?.startsWith('This is a copy') === false) || asset.platforms.length === 0} className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                x             {asset.status === 'publishing' ? <LoadingSpinner /> : (asset.status === 'published' ? 'Published!' : 'Publish Asset')}
                         </button>
                         <button onClick={() => setAssets(p => p.filter(a => a.id !== asset.id))} className="text-red-400 hover:text-red-300 text-sm font-medium p-2" aria-label="Remove asset">
                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                         </button>
                    </div>
                    {asset.errorMessage && (
                        <div className={`text-sm text-center p-2 ${asset.status === 'error' ? 'text-red-400 bg-red-900/30' : 'text-blue-300 bg-blue-900/30'}`}>
                            {asset.errorMessage}
                        </div>
                    )}
                </div>
            ))}
            </div>
            {assets.length === 0 && (
                <div className="text-center text-dark-text-secondary py-16">
                    <p>Upload some media to get started!</p>
                    <p className="text-xs mt-1">Or generate ideas from the SEO Connector page.</p>
                </div>
            )}
        </div>
    );
};
