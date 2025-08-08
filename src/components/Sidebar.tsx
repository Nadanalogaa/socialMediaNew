

  import React from 'react';
  import { DashboardIcon } from './icons/DashboardIcon';
  import { CreatePostIcon } from './icons/CreatePostIcon';
  import { SeoIcon } from './icons/SeoIcon';
  import { ConnectIcon } from './icons/ConnectIcon';
  import type { View } from '../types';
  import { View as ViewEnum } from '../types';


  interface SidebarProps {
    activeView: View;
    setActiveView: (view: View) => void;
  }

  const NavItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
  }> = ({ icon, label, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-brand-primary text-white'
          : 'text-dark-text-secondary hover:bg-dark-card hover:text-dark-text'
      }`}
    >
      {icon}
      <span className="ml-3">{label}</span>
    </button>
  );

  export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView }) => {
    return (
      <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col sticky top-0 h-screen border-r border-dark-border">
        <div className="flex items-center mb-10">
          <div className="p-2 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-lg">
            <CreatePostIcon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold ml-3">SocialBoost AI</h1>
        </div>
        <nav className="flex flex-col space-y-2">
          <NavItem
            icon={<DashboardIcon className="w-5 h-5" />}
            label="Dashboard"
            isActive={activeView === ViewEnum.DASHBOARD}
            onClick={() => setActiveView(ViewEnum.DASHBOARD)}
          />
          <NavItem
            icon={<CreatePostIcon className="w-5 h-5" />}
            label="Create Post"
            isActive={activeView === ViewEnum.CREATE_POST}
            onClick={() => setActiveView(ViewEnum.CREATE_POST)}
          />
          <NavItem
            icon={<SeoIcon className="w-5 h-5" />}
            label="SEO Assistant"
            isActive={activeView === ViewEnum.SEO_ASSISTANT}
            onClick={() => setActiveView(ViewEnum.SEO_ASSISTANT)}
          />
          <NavItem
            icon={<ConnectIcon className="w-5 h-5" />}
            label="Connections"
            isActive={activeView === ViewEnum.CONNECTIONS}
            onClick={() => setActiveView(ViewEnum.CONNECTIONS)}
          />
        </nav>
        <div className="mt-auto text-center text-dark-text-secondary text-xs space-y-1">
          <p>Powered by Gemini API</p>
          <div>
            <span>&copy; 2024 Nadanaloga</span>
            <span className="mx-1">·</span>
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-dark-text underline"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </aside>
    );
  };