
import React from 'react';
import { DashboardIcon } from './icons/DashboardIcon';
import { CreatePostIcon } from './icons/CreatePostIcon';
import { SeoIcon } from './icons/SeoIcon';
import { ConnectIcon } from './icons/ConnectIcon';
import { PrivacyIcon } from './icons/PrivacyIcon';
import { View } from '../types';

interface BottomNavProps {
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
    aria-label={label}
    className={`flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs font-medium transition-colors ${
      isActive ? 'text-brand-primary' : 'text-dark-text-secondary hover:text-dark-text'
    }`}
  >
    {icon}
    <span className="mt-1">{label}</span>
  </button>
);

export const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
  const navItems = [
    { view: View.DASHBOARD, label: 'Dashboard', icon: <DashboardIcon className="w-6 h-6" /> },
    { view: View.CREATE_POST, label: 'Create', icon: <CreatePostIcon className="w-6 h-6" /> },
    { view: View.SEO_CONNECTOR, label: 'SEO', icon: <SeoIcon className="w-6 h-6" /> },
    { view: View.CONNECTIONS, label: 'Connect', icon: <ConnectIcon className="w-6 h-6" /> },
    { view: View.PRIVACY_POLICY, label: 'Privacy', icon: <PrivacyIcon className="w-6 h-6" /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-dark-border md:hidden">
      <div className="flex justify-around items-center max-w-xl mx-auto">
        {navItems.map(item => (
          <NavItem
            key={item.view}
            icon={item.icon}
            label={item.label}
            isActive={activeView === item.view}
            onClick={() => setActiveView(item.view)}
          />
        ))}
      </div>
    </nav>
  );
};