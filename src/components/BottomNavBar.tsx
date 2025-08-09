
import React from 'react';
import { DashboardIcon } from './icons/DashboardIcon';
import { CreatePostIcon } from './icons/CreatePostIcon';
import { SeoIcon } from './icons/SeoIcon';
import { ConnectIcon } from './icons/ConnectIcon';
import type { View } from '../types';
import { View as ViewEnum } from '../types';

interface BottomNavBarProps {
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
    className={`flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs font-medium transition-colors duration-200 ${
      isActive ? 'text-brand-primary' : 'text-dark-text-secondary hover:text-white'
    }`}
    aria-label={label}
  >
    {icon}
    <span className="mt-1">{label}</span>
  </button>
);

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeView, setActiveView }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-dark-border z-50 md:hidden">
      <div className="flex justify-around items-center h-16">
        <NavItem
          icon={<DashboardIcon className="w-6 h-6" />}
          label="Dashboard"
          isActive={activeView === ViewEnum.DASHBOARD}
          onClick={() => setActiveView(ViewEnum.DASHBOARD)}
        />
        <NavItem
          icon={<CreatePostIcon className="w-6 h-6" />}
          label="Create"
          isActive={activeView === ViewEnum.CREATE_POST}
          onClick={() => setActiveView(ViewEnum.CREATE_POST)}
        />
        <NavItem
          icon={<SeoIcon className="w-6 h-6" />}
          label="SEO"
          isActive={activeView === ViewEnum.SEO_ASSISTANT}
          onClick={() => setActiveView(ViewEnum.SEO_ASSISTANT)}
        />
        <NavItem
          icon={<ConnectIcon className="w-6 h-6" />}
          label="Connections"
          isActive={activeView === ViewEnum.CONNECTIONS}
          onClick={() => setActiveView(ViewEnum.CONNECTIONS)}
        />
      </div>
    </nav>
  );
};
