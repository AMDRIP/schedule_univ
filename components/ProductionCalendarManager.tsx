import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { ProductionCalendarEvent, ProductionCalendarEventType } from '../types';
import { toYYYYMMDD } from '../utils/dateUtils';
import { CalendarIcon, ChevronLeftIcon, PlusIcon, TrashIcon, EditIcon, UploadIcon, DocumentSearchIcon } from './icons';
import { PRODUCTION_CALENDAR_COLORS } from '../constants';

// NOTE: This is a simplified version of ChevronRight, as it wasn't in the original icons file
const ChevronRightIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}>
    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
  </svg>
);

// Holiday generation utility
const getRussianHolidays = (year: number): Omit<ProductionCalendarEvent, 'id'>[] => {
    const holidays = [
      { date: `${year}-01-01`, name: 'Новый год', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-02`, name: 'Новогодние каникулы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-03`, name: 'Новогодние каникулы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-04`, name: 'Новогодние каникулы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-05`, name: 'Новогодние каникулы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-06`, name: 'Новогодние каникулы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-07`, name: 'Рождество Христово', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-01-08`, name: 'Новогодние каникулы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-02-23`, name: 'День защитника Отечества', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-03-08`, name: 'Международный женский день', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-05-01`, name: 'Праздник Весны и Труда', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-05-09`, name: 'День Победы', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-06-12`, name: 'День России', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
      { date: `${year}-11-04`, name: 'День народного единства', type: ProductionCalendarEventType.Holiday, isWorkDay: false },
    ];
    // This is a simplified list. Real calendar depends on government decrees for moved holidays.
    return holidays;
};


// The modal for adding/editing events
const EventModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (eventData: Omit<ProductionCalendarEvent, 'id'>) => void;
    onDelete: (eventId: string) => void;
    event: ProductionCalendarEvent | null;
    date: Date;
}> = ({ isOpen, onClose, onSave, onDelete, event, date }) => {
    // FIX: Initialize useState with a default object to match the state's type and prevent a TypeScript error.
    const [formData, setFormData] = useState<Omit<ProductionCalendarEvent, 'id' | 'date'> & { date?: string }>({
        name: '',
        type: ProductionCalendarEventType.Holiday,
        isWorkDay: false,
    });
    
    useEffect(() => {
        if (event) {
            setFormData(event);
        } else {
            setFormData({
                name: '',
                type: ProductionCalendarEventType.Holiday,
                isWorkDay: false,
            });
        }
    }, [event]);

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const type = e.target.value as ProductionCalendarEventType;
        const isWorkDay = ![
            ProductionCalendarEventType.Holiday, 
            ProductionCalendarEventType.MovedHoliday, 
            ProductionCalendarEventType.RegionalHoliday
        ].includes(type);

        setFormData(prev => ({ ...prev, type, isWorkDay }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, date: toYYYYMMDD(date) } as Omit<ProductionCalendarEvent, 'id'>);
        onClose();
    };

    if (!isOpen) return null;
    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">{event ? 'Редактировать событие' : 'Добавить событие'} на {date.toLocaleDateString('ru-RU')}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Название</label>
                        <input type="text" value={formData.name || ''} onChange={e => setFormData(p => ({...p, name: e.target.value}))} className={defaultInputClass} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Тип</label>
                        <select value={formData.type} onChange={handleTypeChange} className={defaultInputClass}>
                            {Object.values(ProductionCalendarEventType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center pt-2">
                         <input type="checkbox" id="isWorkDay" checked={!!formData.isWorkDay} onChange={e => setFormData(p => ({...p, isWorkDay: e.target.checked}))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                         <label htmlFor="isWorkDay" className="ml-2 block text-sm font-medium text-gray-700">Рабочий день</label>
                    </div>
                    <div className="flex justify-between items-center mt-6">
                        <div>
                            {event && <button type="button" onClick={() => { onDelete(event.id); onClose(); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"><TrashIcon className="w-4 h-4"/>Удалить</button>}
                        </div>
                        <div className="flex space-x-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Отмена</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Сохранить</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Main calendar component
const ProductionCalendarManager: React.FC = () => {
  const { productionCalendar, addItem, updateItem, deleteItem } = useStore();
  const [displayDate, setDisplayDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<ProductionCalendarEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductionCalendarEvent, direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'asc' });
  const [filterText, setFilterText] = useState('');

  const getDayInfo = (date: Date): { event: ProductionCalendarEvent | undefined, isWeekend: boolean } => {
      const dateStr = toYYYYMMDD(date);
      const dayOfWeek = date.getDay();
      const event = productionCalendar.find(d => d.date === dateStr);
      return { event, isWeekend: dayOfWeek === 0 || dayOfWeek === 6 };
  };
  
  const calendarData = useMemo(() => {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const dayOfWeekOfFirst = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1; // Monday is 0
    const calendarStartDate = new Date(firstDayOfMonth);
    calendarStartDate.setDate(calendarStartDate.getDate() - dayOfWeekOfFirst);
    
    const days = [];
    let currentDate = new Date(calendarStartDate);
    for (let i = 0; i < 42; i++) {
        days.push({
            date: new Date(currentDate),
            isCurrentMonth: currentDate.getMonth() === month,
            ...getDayInfo(currentDate),
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return days;
  }, [displayDate, productionCalendar]);

  const changeMonth = (delta: number) => {
      setDisplayDate(prev => {
          const newDate = new Date(prev);
          newDate.setDate(1); 
          newDate.setMonth(newDate.getMonth() + delta);
          return newDate;
      });
  };

  const handleDayClick = (date: Date, event?: ProductionCalendarEvent) => {
    setSelectedDate(date);
    setEditingEvent(event || null);
    setIsModalOpen(true);
  };
  
  const handleSaveEvent = (eventData: Omit<ProductionCalendarEvent, 'id'>) => {
    if(editingEvent) {
      updateItem('productionCalendar', { ...eventData, id: editingEvent.id });
    } else {
      const existing = productionCalendar.find(e => e.date === eventData.date);
      if(existing) {
          updateItem('productionCalendar', {...eventData, id: existing.id});
      } else {
          addItem('productionCalendar', eventData);
      }
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    if (window.confirm('Вы уверены, что хотите удалить это событие?')) {
        deleteItem('productionCalendar', eventId);
    }
  };
  
  const handleAddHolidays = () => {
    const yearStr = prompt("Введите год, за который нужно добавить государственные праздники:", String(new Date().getFullYear()));
    if (!yearStr || isNaN(parseInt(yearStr))) return;
    const year = parseInt(yearStr);
    
    if (window.confirm(`Добавить стандартные государственные праздники РФ на ${year} год? Существующие события в эти даты будут перезаписаны. \n\nВнимание: переносы выходных дней, выпадающих на праздники, необходимо будет настроить вручную.`)) {
        const holidays = getRussianHolidays(year);
        holidays.forEach(holiday => {
            const existing = productionCalendar.find(e => e.date === holiday.date);
            if (existing) {
                updateItem('productionCalendar', {...holiday, id: existing.id});
            } else {
                addItem('productionCalendar', holiday);
            }
        });
    }
  };
  
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmationMessage = "Импортировать данные из CSV? Существующие даты будут перезаписаны.\n\n" +
      "Ожидаемый формат CSV с заголовком:\n" +
      "date,name,type,isWorkDay\n" +
      "Пример: 2024-12-31,Предпраздничный день,Предпраздничный день,false";

    if (!window.confirm(confirmationMessage)) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const rows = text.split(/\r?\n/).slice(1); // skip header
            let importedCount = 0;
            let errorCount = 0;

            rows.forEach(row => {
                if (!row) return;
                const [date, name, type, isWorkDayStr] = row.split(',').map(s => s.trim());
                
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || !type || !isWorkDayStr) { 
                    errorCount++; 
                    return; 
                }
                if (!Object.values(ProductionCalendarEventType).includes(type as ProductionCalendarEventType)) {
                    console.warn(`Неизвестный тип события '${type}' в строке: ${row}`);
                    errorCount++; 
                    return;
                }
                const isWorkDay = isWorkDayStr.toLowerCase() === 'true' || isWorkDayStr === '1';

                const eventData: Omit<ProductionCalendarEvent, 'id'> = { date, name, type: type as ProductionCalendarEventType, isWorkDay };

                const existing = productionCalendar.find(e => e.date === date);
                if (existing) {
                    updateItem('productionCalendar', { ...eventData, id: existing.id });
                } else {
                    addItem('productionCalendar', eventData);
                }
                importedCount++;
            });
            alert(`Импорт завершен. Добавлено/обновлено: ${importedCount}. Ошибок (пропущено строк): ${errorCount}.`);
        } catch (err) {
            console.error("Ошибка при импорте CSV:", err);
            alert("Произошла ошибка при чтении файла. Убедитесь, что он в правильном формате.");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };
    reader.readAsText(file);
  };

    const sortedAndFilteredData = useMemo(() => {
        let sortableItems = [...productionCalendar];
        
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        if (!filterText) {
            return sortableItems;
        }

        return sortableItems.filter(item => 
            item.name.toLowerCase().includes(filterText.toLowerCase()) ||
            item.date.toLowerCase().includes(filterText.toLowerCase()) ||
            item.type.toLowerCase().includes(filterText.toLowerCase())
        );
    }, [productionCalendar, sortConfig, filterText]);
    
    const requestSort = (key: keyof ProductionCalendarEvent) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <div className="space-y-8">
        <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
            <div className="flex items-center">
                <CalendarIcon className="h-8 w-8 text-blue-600 mr-3" />
                <h2 className="text-2xl font-bold text-gray-800">Производственный календарь</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center select-none border rounded-lg p-1">
                <button onClick={() => changeMonth(-1)} className="p-2 rounded-md hover:bg-gray-100 text-gray-600"><ChevronLeftIcon /></button>
                <span className="w-48 text-center font-semibold text-lg text-gray-700 capitalize">{displayDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => changeMonth(1)} className="p-2 rounded-md hover:bg-gray-100 text-gray-600"><ChevronRightIcon /></button>
            </div>
            <button onClick={handleAddHolidays} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                <PlusIcon className="w-4 h-4 mr-1"/>
                Добавить гос. праздники
            </button>
            <button onClick={handleImportClick} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                <UploadIcon className="w-4 h-4 mr-1"/>
                Импорт из CSV
            </button>
             <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".csv" />
            </div>
        </div>
        
        <div className="grid grid-cols-7 gap-1">
            {weekdays.map(day => (
            <div key={day} className="text-center font-medium text-gray-500 p-2 text-sm">{day}</div>
            ))}
            {calendarData.map(({ date, isCurrentMonth, event, isWeekend }, index) => {
                let bgClass = 'bg-white';
                let textClass = 'text-gray-800';
                if (event) {
                    bgClass = PRODUCTION_CALENDAR_COLORS[event.type].bg;
                    textClass = PRODUCTION_CALENDAR_COLORS[event.type].text;
                } else if (isWeekend) {
                    bgClass = 'bg-gray-50';
                    textClass = 'text-gray-500';
                }
                if (!isCurrentMonth) {
                    textClass = 'text-gray-400';
                    bgClass = 'bg-white';
                }

                return (
                <div 
                    key={index}
                    onClick={() => handleDayClick(date, event)}
                    className={`h-24 border border-gray-200 rounded-md p-1.5 flex flex-col justify-between text-xs transition-all cursor-pointer hover:ring-2 hover:ring-blue-400 hover:z-10 ${bgClass}`}
                >
                    <span className={`font-semibold ${textClass}`}>
                        {date.getDate()}
                    </span>
                    {event && <div className="text-center p-1 rounded-sm text-xs break-words">
                        <p className={`font-semibold ${textClass}`}>{event.name}</p>
                        </div>
                    }
                </div>
                );
            })}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
            {Object.values(PRODUCTION_CALENDAR_COLORS).map(style => (
                <div key={style.label} className="flex items-center">
                    <div className={`w-3 h-3 rounded-sm mr-2 ${style.bg} border ${style.border}`}></div>
                    <span className="text-xs text-gray-600">{style.label}</span>
                </div>
            ))}
            <div className="flex items-center">
                <div className="w-3 h-3 rounded-sm mr-2 bg-gray-50 border border-gray-200"></div>
                <span className="text-xs text-gray-600">Выходной</span>
            </div>
        </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">Список всех событий</h3>
                <input 
                    type="text" 
                    placeholder="Поиск по названию, дате..." 
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    className="p-2 border border-gray-300 rounded-md text-sm w-64"
                />
            </div>
             <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-200">
                    {['date', 'name', 'type', 'isWorkDay'].map(key => (
                        <th key={key} className="p-3 text-sm font-semibold uppercase text-gray-600 border-b border-gray-300 text-left">
                           <button onClick={() => requestSort(key as keyof ProductionCalendarEvent)} className="w-full text-left font-semibold">
                             {{date: 'Дата', name: 'Название', type: 'Тип события', isWorkDay: 'Рабочий день'}[key]}
                             {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                           </button>
                        </th>
                    ))}
                    <th className="p-3 text-sm font-semibold uppercase text-gray-600 border-b border-gray-300 text-left">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedAndFilteredData.length > 0 ? (
                    sortedAndFilteredData.map((item, index) => (
                        <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                        <td className="p-3 text-gray-800 border-b border-gray-200">{new Date(item.date + 'T00:00:00').toLocaleDateString('ru-RU')}</td>
                        <td className="p-3 text-gray-800 border-b border-gray-200">{item.name}</td>
                        <td className="p-3 text-gray-800 border-b border-gray-200">{item.type}</td>
                        <td className="p-3 text-gray-800 border-b border-gray-200">{item.isWorkDay ? 'Да' : 'Нет'}</td>
                        <td className="p-3 text-gray-800 border-b border-gray-200">
                            <button onClick={() => handleDayClick(new Date(item.date + 'T00:00:00'), item)} className="text-blue-600 hover:text-blue-800 mr-4 transition-transform transform hover:scale-110">
                            <EditIcon />
                            </button>
                            <button onClick={() => handleDeleteEvent(item.id)} className="text-red-600 hover:text-red-800 transition-transform transform hover:scale-110">
                            <TrashIcon />
                            </button>
                        </td>
                        </tr>
                    ))
                    ) : (
                    <tr>
                        <td colSpan={5} className="text-center py-12 text-gray-500">
                        <DocumentSearchIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2 font-semibold">События не найдены</p>
                        <p className="text-sm">Добавьте события через календарь или импортируйте файл.</p>
                        </td>
                    </tr>
                    )}
                </tbody>
                </table>
            </div>
        </div>

        {isModalOpen && selectedDate && (
            <EventModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                event={editingEvent}
                date={selectedDate}
            />
        )}
    </div>
  );
};

export default ProductionCalendarManager;