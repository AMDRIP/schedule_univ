import React, { useState } from 'react';
import { COLOR_MAP, COLOR_PALETTE } from '../constants';
import { iconLabels, iconNames, renderIcon } from './IconMap';

type ColorOption = { name: string; value: string };

interface ColorPalettePickerProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  palette?: ColorOption[];
}

export const ColorPalettePicker: React.FC<ColorPalettePickerProps> = ({
  label,
  value = '',
  onChange,
  allowEmpty = true,
  palette = COLOR_PALETTE,
}) => (
  <div>
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {value && <span className="text-xs text-gray-500">{palette.find(color => color.value === value)?.name || value}</span>}
    </div>
    <div className="grid grid-cols-5 gap-2">
      {allowEmpty && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Без цвета"
          className={`flex h-9 items-center justify-center rounded-md border text-xs font-semibold ${!value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}`}
        >
          Нет
        </button>
      )}
      {palette.map(color => {
        const classes = COLOR_MAP[color.value] || COLOR_MAP.gray;
        const isSelected = value === color.value;
        return (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            title={color.name}
            className={`h-9 rounded-md border ${classes.bg} ${classes.border} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:ring-2 hover:ring-gray-200'}`}
          >
            <span className="sr-only">{color.name}</span>
          </button>
        );
      })}
    </div>
  </div>
);

interface IconSelectProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options?: string[];
}

export const IconSelect: React.FC<IconSelectProps> = ({ label, value, onChange, options = iconNames }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedIcon = value && options.includes(value) ? value : options[0] || 'BookmarkIcon';

  return (
    <div className="relative">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          {renderIcon(selectedIcon, { className: 'h-5 w-5 shrink-0 text-gray-700' })}
          <span className="truncate">{iconLabels[selectedIcon] || selectedIcon}</span>
        </span>
        <span className="text-xs text-gray-400">v</span>
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-2 gap-1">
            {options.map(iconName => (
              <button
                key={iconName}
                type="button"
                onClick={() => {
                  onChange(iconName);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-blue-50 ${selectedIcon === iconName ? 'bg-blue-50 text-blue-800' : 'text-gray-700'}`}
                title={iconName}
              >
                {renderIcon(iconName, { className: 'h-5 w-5 shrink-0' })}
                <span className="truncate">{iconLabels[iconName] || iconName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
