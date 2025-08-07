
import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { CreatePostView } from './components/CreatePostView';
import { SeoAssistantView } from './components/SeoAssistantView';
import { ConnectionsView } from './components/ConnectionsView';
import type { Post, ConnectionStatus } from './types';
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
  const [activeView, setActiveView] = useState<View>(View.CREATE_POST);
  const [posts] = useState<Post[]>(MOCK_POSTS); // Dashboard can still use mock posts for now
  const [connections, setConnections] = useState<ConnectionStatus>({
    [Platform.Facebook]: false,
    [Platform.Instagram]: false,
    [Platform.YouTube]: false,
  });

  // Fetch initial connection state from our own backend on app load.
  useEffect(() => {
    const fetchInitialConnections = async () => {
        try {
            console.log("Fetching connection statuses...");
            const status = await getConnections();
            setConnections(status);
            console.log("Connection statuses updated:", status);
        } catch (error) {
            console.error("Failed to fetch connection statuses:", error);
        }
    };
    fetchInitialConnections();
  }, []);

  // Load and initialize the Facebook SDK, and check login status
  useEffect(() => {
    // This function will be called by FB.getLoginStatus
    function statusChangeCallback(response: any) {
        console.log('Facebook statusChangeCallback:', response);
        if (response.status === 'connected') {
            console.log('User is connected to Facebook and has authorized the app. Syncing status...');
            const accessToken = response.authResponse.accessToken;
            // This call is idempotent. It ensures the connection is marked as true on the backend.
            connectFacebook(accessToken)
                .then(updatedConnections => {
                    setConnections(updatedConnections);
                    console.log('Successfully synced Facebook connection status.');
                })
                .catch(err => {
                     console.error('Failed to sync Facebook connection on backend:', err);
                });

        } else {
            console.log('User is not connected to Facebook or has not authorized the app.');
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
        window.FB.init({
            // Using the App ID you provided.
            appId: '607172899117212', 
            cookie: true,
            xfbml: true,
            version: 'v19.0'
        });
        window.FB.AppEvents.logPageView();
        
        // As you suggested, check the login status on initialization for a smoother UX.
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
        return <CreatePostView connections={connections} />;
      case View.SEO_ASSISTANT:
        return <SeoAssistantView />;
      case View.CONNECTIONS:
        return <ConnectionsView connections={connections} setConnections={setConnections} />;
      case View.DASHBOARD:
      default:
        return <DashboardView posts={posts} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-dark-bg font-sans">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default App;
