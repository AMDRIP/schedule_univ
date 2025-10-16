import React from 'react';
import { CheckCircleIcon } from './icons';

interface UpdateNotificationProps {
  onRestart: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onRestart }) => {
  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg flex items-center gap-4 z-50 animate-fade-in-up">
        <CheckCircleIcon className="w-8 h-8 flex-shrink-0" />
        <div>
            <h4 className="font-bold">Обновление готово</h4>
            <p className="text-sm">Новая версия приложения загружена и готова к установке.</p>
        </div>
        <button
            onClick={onRestart}
            className="ml-4 bg-white text-blue-700 font-bold py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
        >
            Перезапустить
        </button>
    </div>
  );
};

export default UpdateNotification;
