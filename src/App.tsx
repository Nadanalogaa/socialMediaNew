


import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { CreatePostView } from './components/CreatePostView';
import { SeoConnectorView } from './components/SeoAssistantView';
import { ConnectionsView } from './components/ConnectionsView';
import type { Post, ConnectionStatus, ConnectionDetails, GeneratedPostIdea } from './types';
import { View, Platform } from './types';
import { MOCK_POSTS } from './constants';
import { getConnections, connectFacebook } from './services/geminiService';

// Extend the Window interface to include FB
declare global {
    interface Window {
        FB: any;
        fbAsyncInit: () => void;
    }
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>(View.DASHBOARD);
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [connections, setConnections] = useState<ConnectionStatus>({
    [Platform.Facebook]: false,
    [Platform.Instagram]: false,
    [Platform.YouTube]: false,
  });
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>({});
  const [isFbSdkInitialized, setIsFbSdkInitialized] = useState(false);
  const [postSeed, setPostSeed] = useState<GeneratedPostIdea | Post | null>(null);

  const addPost = (post: Post) => {
    setPosts(prevPosts => [post, ...prevPosts]);
  };
  
  const deletePost = (postId: string) => {
    setPosts(prevPosts => prevPosts.filter(p => p.id !== postId));
  };

  const deletePosts = (postIds: string[]) => {
      const idsToDelete = new Set(postIds);
      setPosts(prevPosts => prevPosts.filter(p => !idsToDelete.has(p.id)));
  };

  const updatePostEngagement = (postId: string, newEngagement: { likes: number, comments: number, shares: number }) => {
      setPosts(prevPosts => prevPosts.map(p =>
          p.id === postId ? { ...p, engagement: newEngagement } : p
      ));
  };

  const navigateTo = (view: View, data: any = null) => {
    setPostSeed(data); // Always set data, even if null, to clear previous
    setActiveView(view);
  };

  // Fetch initial connection state from our own backend on app load.
  useEffect(() => {
    const fetchInitialConnections = async () => {
        try {
            console.log("Fetching initial connection statuses...");
            const status = await getConnections();
            setConnections(status);
            console.log("Initial connection statuses set:", status);
        } catch (error) {
            console.error("Failed to fetch connection statuses:", error);
        }
    };
    fetchInitialConnections();
  }, []);
  
  // When Facebook connection is lost, clear the sensitive token details.
  useEffect(() => {
    if (!connections.Facebook && Object.keys(connectionDetails).length > 0) {
        console.log("Facebook disconnected, clearing connection details from state.");
        setConnectionDetails({});
    }
  }, [connections.Facebook, connectionDetails]);

  // Load and initialize the Facebook SDK, and check login status
  useEffect(() => {
    // This function will be called by FB.getLoginStatus and handles state changes.
    function statusChangeCallback(response: any) {
        console.log('Facebook statusChangeCallback:', response);
        if (response.status === 'connected') {
            console.log('User is connected to Facebook and has authorized the app. Syncing status...');
            const accessToken = response.authResponse.accessToken;
            // This call ensures we get a fresh page access token and page details.
            connectFacebook(accessToken)
                .then(result => {
                    setConnections(result.connections);
                    setConnectionDetails(result.details);
                    console.log('Successfully synced Facebook connection status and details.');
                })
                .catch(err => {
                     console.error('Failed to sync Facebook connection on backend:', err);
                });

        } else {
            // Handle cases where the user is not connected to the app.
            if (response.status === 'not_authorized') {
                console.log('User is logged into Facebook, but has not authorized our app.');
            } else {
                console.log('User is not logged into Facebook or has logged out.');
            }
            // If the app's state thinks Facebook is connected, but it's not, we sync the state to false.
            // This handles cases like the user revoking permissions on Facebook's website.
            setConnections(prev => ({ ...prev, [Platform.Facebook]: false, [Platform.Instagram]: false }));
        }
    }

    // Prevent re-loading the script
    if (document.getElementById('facebook-jssdk')) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);

    // Initialize the SDK once it's loaded
    window.fbAsyncInit = function() {
        if (!import.meta.env.VITE_FACEBOOK_APP_ID) {
            console.error("VITE_FACEBOOK_APP_ID is not defined. Facebook integration will not work.");
            setIsFbSdkInitialized(false);
            return;
        }
        window.FB.init({
            appId: import.meta.env.VITE_FACEBOOK_APP_ID, 
            cookie: true,
            xfbml: true,
            version: 'v23.0'
        });
        setIsFbSdkInitialized(true);
        window.FB.AppEvents.logPageView();
        
        // Check the login status on initialization for a smoother UX.
        console.log('Checking Facebook login status...');
        window.FB.getLoginStatus(statusChangeCallback);
    };

    return () => {
        const fbScript = document.getElementById('facebook-jssdk');
        if (fbScript) {
            document.body.removeChild(fbScript);
        }
        // @ts-ignore
        delete window.fbAsyncInit;
        // @ts-ignore
        delete window.FB;
    };
  }, []); // This effect should run only once on mount.


  const renderView = () => {
    switch (activeView) {
      case View.CREATE_POST:
        return <CreatePostView connections={connections} connectionDetails={connectionDetails} onPostPublished={addPost} postSeed={postSeed} clearPostSeed={() => setPostSeed(null)} />;
      case View.SEO_CONNECTOR:
        return <SeoConnectorView navigateTo={navigateTo} />;
      case View.CONNECTIONS:
        return <ConnectionsView connections={connections} setConnections={setConnections} setConnectionDetails={setConnectionDetails} isFbSdkInitialized={isFbSdkInitialized} />;
      case View.DASHBOARD:
      default:
        return <DashboardView 
                    posts={posts}
                    connectionDetails={connectionDetails}
                    onDeletePost={deletePost}
                    onDeletePosts={deletePosts}
                    onUpdatePostEngagement={updatePostEngagement}
                    onEditPost={(post) => navigateTo(View.CREATE_POST, post)}
                />;
    }
  };

  return (
    <div className="flex min-h-screen bg-dark-bg font-sans">
      <Sidebar activeView={activeView} setActiveView={(view) => navigateTo(view)} />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default App;