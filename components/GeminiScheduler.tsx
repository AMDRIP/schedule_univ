import React from 'react';
import { CogIcon } from './icons';

const AutoScheduler: React.FC = () => {
  return (
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-3xl mx-auto text-center">
      <CogIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-800">Автоматическое составление расписания</h2>
      <p className="mt-4 text-gray-600">
        Функции автоматического составления расписания теперь доступны в новом меню <strong>"Планировщик"</strong> в шапке приложения.
      </p>
      <p className="mt-2 text-gray-600">
        Используйте его, чтобы сгенерировать расписание с помощью быстрого эвристического алгоритма или продвинутого ИИ-ассистента Gemini.
      </p>
    </div>
  );
};

export default AutoScheduler;