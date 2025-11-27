import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { AcademicDegree, Specialty, Teacher } from '../types';
import { LocationMarkerIcon, PhoneIcon, MailIcon, VkIcon, TelegramIcon, UsersIcon } from './icons';

interface DepartmentViewProps {
  departmentId: string;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`mt-8 ${className}`}>
    <h2 className="text-2xl font-bold text-blue-800 border-b-2 border-blue-200 pb-2 mb-4">{title}</h2>
    {children}
  </div>
);

const ProgramCard: React.FC<{ specialty: Specialty }> = ({ specialty }) => {
    const getProgramLevel = (code: string): string => {
        if (code.match(/^\d{2}\.03\.\d{2}/)) return 'Программа бакалавриата';
        if (code.match(/^\d{2}\.04\.\d{2}/)) return 'Программа магистратуры';
        if (code.match(/^\d{2}\.05\.\d{2}/)) return 'Программа специалитета';
        if (code.match(/^\d{1,2}\.\d{1,2}\./)) return 'Программа аспирантуры';
        return 'Образовательная программа';
    };

    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500">{specialty.code}</p>
            <p className="text-sm text-gray-500">{getProgramLevel(specialty.code)}</p>
            <h3 className="font-semibold text-blue-900 mt-1">{specialty.name}</h3>
            <a href="#" className="text-sm text-blue-600 hover:underline mt-2 inline-block" onClick={e => e.preventDefault()}>Подробнее</a>
        </div>
    );
};

const TeacherCard: React.FC<{ teacher: Teacher; departmentName: string; }> = ({ teacher, departmentName }) => {
    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center hover:shadow-lg transition-shadow transform hover:-translate-y-1">
            <img 
                src={teacher.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=e0e7ff&color=4338ca&size=128`} 
                alt={teacher.name}
                className="w-24 h-24 rounded-full mx-auto mb-3 object-cover"
            />
            <h3 className="font-bold text-gray-800">{teacher.name}</h3>
            <p className="text-sm text-gray-600">{teacher.academicTitle || ''}</p>
            <p className="text-xs text-gray-500 mt-1">{departmentName}</p>
        </div>
    );
};


const DepartmentView: React.FC<DepartmentViewProps> = ({ departmentId }) => {
    const store = useStore();

    const department = useMemo(() => store.departments.find(d => d.id === departmentId), [departmentId, store.departments]);
    const headOfDepartment = useMemo(() => department?.headTeacherId ? store.teachers.find(t => t.id === department.headTeacherId) : null, [department, store.teachers]);
    const departmentTeachers = useMemo(() => store.teachers.filter(t => t.departmentId === departmentId), [departmentId, store.teachers]);
    const departmentSpecialties = useMemo(() => store.specialties.filter(s => department?.specialtyIds?.includes(s.id)), [department, store.specialties]);
    const departmentGroups = useMemo(() => store.groups.filter(g => g.departmentId === departmentId), [departmentId, store.groups]);

    const stats = useMemo(() => ({
        teachers: departmentTeachers.length,
        doctors: departmentTeachers.filter(t => t.academicDegree === AcademicDegree.Doctor).length,
        candidates: departmentTeachers.filter(t => t.academicDegree === AcademicDegree.Candidate).length,
        students: departmentGroups.reduce((sum, g) => sum + g.studentCount, 0),
        postgraduates: 12, // Mock data as per screenshot
    }), [departmentTeachers, departmentGroups]);


    if (!department) {
        return <div className="text-center text-red-500">Кафедра не найдена.</div>;
    }
    
    const headTitle = useMemo(() => {
        if (!headOfDepartment) return '';
        const degree = headOfDepartment.academicDegree
            ? (headOfDepartment.fieldOfScience
                ? headOfDepartment.academicDegree.replace(' наук', ` ${headOfDepartment.fieldOfScience} наук`)
                : headOfDepartment.academicDegree)
            : '';
        return [degree, headOfDepartment.academicTitle].filter(Boolean).join(', ');
    }, [headOfDepartment]);


    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight">{department.name}</h1>
            
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Head of Dept + Contacts */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Head of Department */}
                    {headOfDepartment && (
                        <div className="p-6 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 shadow-md">
                           <div className="flex items-center space-x-6">
                               <img 
                                src={headOfDepartment.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(headOfDepartment.name)}&background=4f46e5&color=fff&size=256`} 
                                alt={headOfDepartment.name} 
                                className="w-32 h-32 rounded-lg object-cover shadow-lg"
                               />
                               <div>
                                    <p className="font-semibold text-gray-600 text-sm">ЗАВЕДУЮЩИЙ КАФЕДРОЙ</p>
                                    <h3 className="text-xl font-bold text-gray-900 mt-1">{headOfDepartment.name}</h3>
                                    <p className="text-gray-700 mt-1 text-sm">{headTitle}</p>
                               </div>
                           </div>
                        </div>
                    )}
                     {/* Contacts */}
                    <div className="p-6 rounded-lg bg-gray-100 border border-gray-200">
                         <h3 className="font-bold text-gray-800 mb-4">КОНТАКТЫ КАФЕДРЫ</h3>
                         <div className="space-y-3 text-sm text-gray-700">
                            {department.address && <p className="flex items-start"><LocationMarkerIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{department.address}</p>}
                            {department.phone && <p className="flex items-start"><PhoneIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{department.phone}</p>}
                            {department.email && <p className="flex items-start"><MailIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{department.email.split(',').join(', ')}</p>}
                         </div>
                         <div className="flex items-center space-x-4 mt-4">
                             {department.vkLink && <a href={department.vkLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-900"><VkIcon className="w-7 h-7"/></a>}
                             {department.telegramLink && <a href={department.telegramLink} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-800"><TelegramIcon className="w-7 h-7"/></a>}
                         </div>
                    </div>
                </div>

                {/* Right Column: Notes + Stats */}
                <div className="lg:col-span-2 space-y-8">
                     {/* Notes */}
                    {department.notes && (
                         <div className="p-6 rounded-lg bg-white border border-gray-200">
                             <h3 className="font-bold text-gray-800 mb-2">ЗАМЕТКИ</h3>
                             <p className="text-gray-600 leading-relaxed text-sm">{department.notes}</p>
                         </div>
                    )}
                     {/* Stats */}
                     <div className="p-6 rounded-lg bg-blue-50 border border-blue-200">
                        <h3 className="font-bold text-blue-900 mb-4">КАФЕДРА В ЦИФРАХ</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-center">
                            <div className="bg-white p-3 rounded-md border border-gray-200">
                                <p className="text-3xl font-bold text-blue-700">{stats.teachers}</p>
                                <p className="text-xs text-gray-600 mt-1">преподавателей</p>
                            </div>
                             <div className="bg-white p-3 rounded-md border border-gray-200">
                                <p className="text-3xl font-bold text-blue-700">{stats.doctors}</p>
                                <p className="text-xs text-gray-600 mt-1">докторов наук</p>
                            </div>
                             <div className="bg-white p-3 rounded-md border border-gray-200">
                                <p className="text-3xl font-bold text-blue-700">{stats.candidates}</p>
                                <p className="text-xs text-gray-600 mt-1">кандидатов наук</p>
                            </div>
                             <div className="bg-white p-3 rounded-md border border-gray-200">
                                <p className="text-3xl font-bold text-blue-700">{stats.postgraduates}</p>
                                <p className="text-xs text-gray-600 mt-1">аспирантов</p>
                            </div>
                            <div className="bg-white p-3 rounded-md border border-gray-200 col-span-2 sm:col-span-1 md:col-span-1">
                                <p className="text-3xl font-bold text-blue-700">{stats.students}</p>
                                <p className="text-xs text-gray-600 mt-1">студентов</p>
                            </div>
                        </div>
                     </div>
                </div>
            </div>

            <Section title="ОБРАЗОВАТЕЛЬНЫЕ ПРОГРАММЫ">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {departmentSpecialties.map(spec => <ProgramCard key={spec.id} specialty={spec}/>)}
                    {departmentSpecialties.length === 0 && <p className="text-gray-500">За кафедрой не закреплено ни одной образовательной программы.</p>}
                </div>
            </Section>

            <Section title="ПРОФЕССОРСКО-ПРЕПОДАВАТЕЛЬСКИЙ СОСТАВ">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {departmentTeachers.map(teacher => {
                        const teacherDepartment = store.departments.find(d => d.id === teacher.departmentId);
                        return <TeacherCard key={teacher.id} teacher={teacher} departmentName={teacherDepartment?.name || 'Кафедра не указана'}/>
                    })}
                     {departmentTeachers.length === 0 && <p className="text-gray-500">За кафедрой не закреплено ни одного преподавателя.</p>}
                </div>
            </Section>
        </div>
    );
};

export default DepartmentView;
