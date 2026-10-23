import { ClassType, EducationalPlan, Group, PlanEntry, Specialty, Subject } from '../types';

export type EducationLevel = NonNullable<Specialty['educationLevel']>;
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
    bachelor: 'Бакалавриат', specialist: 'Специалитет', master: 'Магистратура',
    postgraduate: 'Аспирантура', secondary: 'СПО', additional: 'Допобразование',
};

export const getEducationLevel = (specialty?: Specialty): EducationLevel => {
    if (specialty?.educationLevel) return specialty.educationLevel;
    const code = specialty?.oksoCode || specialty?.code || '';
    if (/^\d+\.\d+\.\d+$/.test(code) && code.split('.')[1] === '06') return 'postgraduate';
    if (code.split('.')[1] === '04') return 'master';
    if (code.split('.')[1] === '05') return 'specialist';
    if (code.split('.')[1] === '02') return 'secondary';
    return 'bachelor';
};

export const getPlanForGroup = (group: Pick<Group, 'specialtyId' | 'formOfStudy' | 'admissionYear' | 'profile' | 'educationalPlanId'>, plans: EducationalPlan[]) => {
    const compatible = plans.filter(plan => plan.specialtyId === group.specialtyId &&
        (!plan.formOfStudy || plan.formOfStudy === group.formOfStudy) &&
        (!plan.profile || plan.profile === group.profile) &&
        (!plan.admissionYear || plan.admissionYear === group.admissionYear));
    if (group.educationalPlanId) return compatible.find(plan => plan.id === group.educationalPlanId);
    return compatible.sort((a, b) =>
        Number(!!b.admissionYear) - Number(!!a.admissionYear) ||
        Number(!!b.profile) - Number(!!a.profile) ||
        Number(!!b.formOfStudy) - Number(!!a.formOfStudy) || a.id.localeCompare(b.id))[0];
};

export const getPlanContactActivities = (entry: PlanEntry) => [
    { type: ClassType.Lecture, hours: entry.lectureHours || 0 },
    { type: ClassType.Practical, hours: entry.practiceHours || 0 },
    { type: ClassType.Lab, hours: entry.labHours || 0 },
    { type: ClassType.ResearchSeminar, hours: entry.researchSeminarHours || 0 },
    { type: ClassType.ResearchConsultation, hours: entry.researchConsultationHours || 0 },
    { type: ClassType.CourseworkConsultation, hours: entry.coursework?.consultationHours || 0 },
];

export const getPlanContactHours = (entry: PlanEntry) =>
    getPlanContactActivities(entry).reduce((total, activity) => total + activity.hours, 0);

export const matchesSemesterParity = (semester: number, parity: 'odd' | 'even' | 'all' = 'all') =>
    parity === 'all' || semester % 2 === (parity === 'odd' ? 1 : 0);

export const getRequiredClassroomTypes = (subject: Subject | undefined, classType: ClassType) => {
    const requirements = subject?.classroomTypeRequirements;
    if (requirements?.[classType]?.length) return requirements[classType];
    if ([ClassType.ResearchSeminar, ClassType.ResearchConsultation, ClassType.CourseworkConsultation, ClassType.CourseworkDefense, ClassType.ResearchAttestation, ClassType.CandidateExam, ClassType.ThesisDefense].includes(classType)) {
        return requirements?.[ClassType.Consultation]?.length ? requirements[ClassType.Consultation] : requirements?.[ClassType.Practical]?.length ? requirements[ClassType.Practical] : requirements?.[ClassType.Lecture];
    }
    return requirements?.[classType];
};
