const normalizePositiveNumber = (value: number | undefined, fallback = 1) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
};

export const getCourseForSemester = (semester?: number): number => {
    const safeSemester = normalizePositiveNumber(semester);
    return Math.ceil(safeSemester / 2);
};

export const getSemestersForCourse = (course?: number): [number, number] => {
    const safeCourse = normalizePositiveNumber(course);
    return [safeCourse * 2 - 1, safeCourse * 2];
};

export const isSemesterInCourse = (semester?: number, course?: number): boolean => {
    const safeSemester = normalizePositiveNumber(semester);
    const [firstSemester, secondSemester] = getSemestersForCourse(course);
    return safeSemester === firstSemester || safeSemester === secondSemester;
};

export const formatSemesterCourse = (semester?: number): string => {
    const safeSemester = normalizePositiveNumber(semester);
    return `${safeSemester} семестр · ${getCourseForSemester(safeSemester)} курс`;
};
