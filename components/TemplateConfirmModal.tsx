import React from 'react';

interface TemplateConfirmModalProps {
    onConfirm: (method: 'replace' | 'merge') => void;
    onCancel: () => void;
}

const TemplateConfirmModal: React.FC<TemplateConfirmModalProps> = ({ onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h3 className="text-lg font-bold text-gray-900">Загрузка шаблона</h3>
                <p className="mt-2 text-sm text-gray-600">В выбранной неделе уже есть занятия. Выберите, как применить шаблон:</p>
                <div className="mt-4 space-y-3">
                    <div>
                        <button
                            onClick={() => onConfirm('merge')}
                            className="w-full text-left p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200"
                        >
                            <p className="font-semibold text-blue-800">Слияние (добавить в свободные слоты)</p>
                            <p className="text-xs text-blue-700">Занятия из шаблона будут добавлены только в пустые ячейки недели. Существующие занятия останутся.</p>
                        </button>
                    </div>
                    <div>
                        <button
                            onClick={() => onConfirm('replace')}
                            className="w-full text-left p-3 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200"
                        >
                            <p className="font-semibold text-red-800">Полная замена</p>
                            <p className="text-xs text-red-700">Все существующие занятия на этой неделе будут удалены, а на их место будут вставлены занятия из шаблона.</p>
                        </button>
                    </div>
                </div>
                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TemplateConfirmModal;