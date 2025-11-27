import React from 'react';
import { VideoCameraIcon, DesktopComputerIcon, PresentationChartBarIcon, BookmarkIcon } from './icons';

export const iconMap: { [key: string]: React.FC<React.SVGProps<SVGSVGElement>> } = {
  VideoCameraIcon,
  DesktopComputerIcon,
  PresentationChartBarIcon,
  BookmarkIcon,
};

export const iconNames = Object.keys(iconMap);

export const renderIcon = (iconName: string | undefined, props: React.SVGProps<SVGSVGElement> = {}) => {
  if (!iconName) return null;
  const IconComponent = iconMap[iconName];
  return IconComponent ? <IconComponent {...props} /> : <BookmarkIcon {...props} />;
};
