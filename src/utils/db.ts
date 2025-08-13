
import type { MediaAsset, Post } from '../types';

const DB_NAME = 'SocialBoostDB';
const DRAFTS_STORE_NAME = 'draftAssets';
const POSTS_STORE_NAME = 'publishedPosts';
const DB_VERSION = 2; // Increment version due to new object store

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error('Error opening IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE_NAME)) {
        db.createObjectStore(DRAFTS_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(POSTS_STORE_NAME)) {
        db.createObjectStore(POSTS_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// --- Draft Assets Functions ---

export const getDraftsFromDB = async (): Promise<MediaAsset[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFTS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(DRAFTS_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const saveDraftsToDB = async (assets: MediaAsset[]): Promise<void> => {
    try {
        const db = await initDB();
        const transaction = db.transaction(DRAFTS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(DRAFTS_STORE_NAME);

        // Clear existing drafts before saving the new state
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
             // Add or update assets
            for (const asset of assets) {
                // Create a clone to avoid mutating state and prepare for storage.
                const storableAsset = { ...asset };
                if (storableAsset.previewUrl?.startsWith('blob:')) {
                    delete storableAsset.previewUrl;
                }
                store.put(storableAsset);
            }
        };
        clearRequest.onerror = () => {
            console.error('Failed to clear drafts store', clearRequest.error);
        }

    } catch (error) {
        console.error("Could not sync drafts with IndexedDB", error);
    }
};

// --- Published Posts Functions ---

export const getPostsFromDB = async (): Promise<Post[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(POSTS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(POSTS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            // Sort by postedAt descending before returning
            const posts = (request.result || []).sort((a: Post, b: Post) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
            resolve(posts);
        }
        request.onerror = () => reject(request.error);
    });
};

export const savePostsToDB = async (posts: Post[]): Promise<void> => {
    try {
        const db = await initDB();
        const transaction = db.transaction(POSTS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(POSTS_STORE_NAME);

        const clearRequest = store.clear();
        clearRequest.onsuccess = () => {
            for (const post of posts) {
                store.put(post);
            }
        };
        clearRequest.onerror = () => {
            console.error('Failed to clear posts store', clearRequest.error);
        }
    } catch (error) {
        console.error("Could not save posts to IndexedDB", error);
    }
};
