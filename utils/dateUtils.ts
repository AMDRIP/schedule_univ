export const getWeekNumber = (d: Date): number => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
};

export const getWeekType = (currentDate: Date, semesterStartDate: Date): 'odd' | 'even' => {
  // Normalize dates to midnight to avoid DST issues
  const startOfCurrentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const startOfSemester = new Date(semesterStartDate.getFullYear(), semesterStartDate.getMonth(), semesterStartDate.getDate());

  if (isNaN(startOfSemester.getTime())) return 'odd';

  const daysDiff = Math.floor((startOfCurrentDate.getTime() - startOfSemester.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) return 'odd';

  const weekDiff = Math.floor(daysDiff / 7);

  // Week 0 (the first week) is 'odd'. Week 1 is 'even', and so on.
  return (weekDiff % 2 === 0) ? 'odd' : 'even';
};

export const toYYYYMMDD = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

export const getWeekDays = (currentDate: Date): Date[] => {
    const d = new Date(currentDate);
    const day = d.getDay();
    // Adjust to Monday being the first day of the week (day=1 for Monday, 0 for Sunday)
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d.setDate(diff));
    
    const weekDays: Date[] = [];
    for (let i = 0; i < 6; i++) { // Monday to Saturday
        const weekDay = new Date(monday);
        weekDay.setDate(monday.getDate() + i);
        weekDays.push(weekDay);
    }
    return weekDays;
};

export const calculateExperience = (hireDateStr?: string): string => {
    if (!hireDateStr) return 'N/A';
    try {
        const hireDate = new Date(hireDateStr);
        const today = new Date();

        if (isNaN(hireDate.getTime()) || hireDate > today) return 'N/A';

        let years = today.getFullYear() - hireDate.getFullYear();
        let months = today.getMonth() - hireDate.getMonth();
        let days = today.getDate() - hireDate.getDate();

        if (days < 0) {
            months--;
            const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            days += prevMonth.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        const yearText = (y: number) => {
            if (y % 10 === 1 && y % 100 !== 11) return `${y} год`;
            if ([2, 3, 4].includes(y % 10) && ![12, 13, 14].includes(y % 100)) return `${y} года`;
            return `${y} лет`;
        };
        
        const monthText = (m: number) => {
             if (m === 1) return `${m} месяц`;
             if ([2, 3, 4].includes(m)) return `${m} месяца`;
             return `${m} месяцев`;
        }

        if (years > 0 && months > 0) {
            return `${yearText(years)}, ${monthText(months)}`;
        }
        if (years > 0) {
            return yearText(years);
        }
        if (months > 0) {
            return monthText(months);
        }
        if (days >= 0) {
            return 'Менее месяца';
        }
        return 'Начало работы';

    } catch (e) {
        return 'N/A';
    }
};