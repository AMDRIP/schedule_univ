import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { AcademicDegree, Department, Specialty, Teacher } from '../types';
import { LocationMarkerIcon, PhoneIcon, MailIcon } from './icons';

interface FacultyViewProps {
  facultyId: string;
  onNavigate: (view: string, id: string) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`mt-8 ${className}`}>
    <h2 className="text-2xl font-bold text-blue-800 border-b-2 border-blue-200 pb-2 mb-4">{title}</h2>
    {children}
  </div>
);

const DepartmentCard: React.FC<{ department: Department, onNavigate: (view: string, id: string) => void; }> = ({ department, onNavigate }) => {
    const { teachers } = useStore();
    const head = teachers.find(t => t.id === department.headTeacherId);

    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <h3 className="font-semibold text-blue-900 mt-1">{department.name}</h3>
            {head && <p className="text-sm text-gray-600 mt-1">Зав. кафедрой: {head.name}</p>}
            <a href="#" className="text-sm text-blue-600 hover:underline mt-2 inline-block" onClick={e => { e.preventDefault(); onNavigate('Просмотр кафедры', department.id); }}>Перейти на страницу кафедры</a>
        </div>
    );
};

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


const FacultyView: React.FC<FacultyViewProps> = ({ facultyId, onNavigate }) => {
    const store = useStore();

    const faculty = useMemo(() => store.faculties.find(f => f.id === facultyId), [facultyId, store.faculties]);
    const dean = useMemo(() => faculty?.deanId ? store.teachers.find(t => t.id === faculty.deanId) : null, [faculty, store.teachers]);
    
    const facultyDepartments = useMemo(() => store.departments.filter(d => d.facultyId === facultyId), [facultyId, store.departments]);
    const facultyDepartmentIds = useMemo(() => new Set(facultyDepartments.map(d => d.id)), [facultyDepartments]);

    const facultyTeachers = useMemo(() => store.teachers.filter(t => facultyDepartmentIds.has(t.departmentId)), [facultyDepartmentIds, store.teachers]);
    
    const facultySpecialties = useMemo(() => {
        const specialtyIds = new Set(facultyDepartments.flatMap(d => d.specialtyIds || []));
        return store.specialties.filter(s => specialtyIds.has(s.id));
    }, [facultyDepartments, store.specialties]);
    
    const facultyGroups = useMemo(() => store.groups.filter(g => facultyDepartmentIds.has(g.departmentId)), [facultyDepartmentIds, store.groups]);

    const stats = useMemo(() => ({
        departments: facultyDepartments.length,
        teachers: facultyTeachers.length,
        doctors: facultyTeachers.filter(t => t.academicDegree === AcademicDegree.Doctor).length,
        candidates: facultyTeachers.filter(t => t.academicDegree === AcademicDegree.Candidate).length,
        students: facultyGroups.reduce((sum, g) => sum + g.studentCount, 0),
    }), [facultyDepartments, facultyTeachers, facultyGroups]);

    if (!faculty) {
        return <div className="text-center text-red-500">Факультет не найден.</div>;
    }
    
    const deanTitle = useMemo(() => {
        if (!dean) return '';
        const degree = dean.academicDegree
            ? (dean.fieldOfScience
                ? dean.academicDegree.replace(' наук', ` ${dean.fieldOfScience} наук`)
                : dean.academicDegree)
            : '';
        return [degree, dean.academicTitle].filter(Boolean).join(', ');
    }, [dean]);


    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight">{faculty.name}</h1>
            
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
                    {dean && (
                        <div className="p-6 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 shadow-md">
                           <div className="flex items-center space-x-6">
                               <img 
                                src={dean.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(dean.name)}&background=4f46e5&color=fff&size=256`} 
                                alt={dean.name} 
                                className="w-32 h-32 rounded-lg object-cover shadow-lg"
                               />
                               <div>
                                    <p className="font-semibold text-gray-600 text-sm">ДЕКАН ФАКУЛЬТЕТА</p>
                                    <h3 className="text-xl font-bold text-gray-900 mt-1">{dean.name}</h3>
                                    <p className="text-gray-700 mt-1 text-sm">{deanTitle}</p>
                               </div>
                           </div>
                        </div>
                    )}
                    {(faculty.address || faculty.phone || faculty.email) && (
                        <div className="p-6 rounded-lg bg-gray-100 border border-gray-200">
                             <h3 className="font-bold text-gray-800 mb-4">КОНТАКТЫ ДЕКАНАТА</h3>
                             <div className="space-y-3 text-sm text-gray-700">
                                {faculty.address && <p className="flex items-start"><LocationMarkerIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{faculty.address}</p>}
                                {faculty.phone && <p className="flex items-start"><PhoneIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{faculty.phone}</p>}
                                {faculty.email && <p className="flex items-start"><MailIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{faculty.email}</p>}
                             </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2 space-y-8">
                    {faculty.notes && (
                         <div className="p-6 rounded-lg bg-white border border-gray-200">
                             <h3 className="font-bold text-gray-800 mb-2">О ФАКУЛЬТЕТЕ</h3>
                             <p className="text-gray-600 leading-relaxed text-sm">{faculty.notes}</p>
                         </div>
                    )}
                     <div className="p-6 rounded-lg bg-blue-50 border border-blue-200">
                        <h3 className="font-bold text-blue-900 mb-4">ФАКУЛЬТЕТ В ЦИФРАХ</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-center">
                            <div className="bg-white p-3 rounded-md border border-gray-200"><p className="text-3xl font-bold text-blue-700">{stats.departments}</p><p className="text-xs text-gray-600 mt-1">кафедр</p></div>
                            <div className="bg-white p-3 rounded-md border border-gray-200"><p className="text-3xl font-bold text-blue-700">{stats.teachers}</p><p className="text-xs text-gray-600 mt-1">преподавателей</p></div>
                            <div className="bg-white p-3 rounded-md border border-gray-200"><p className="text-3xl font-bold text-blue-700">{stats.doctors}</p><p className="text-xs text-gray-600 mt-1">докторов наук</p></div>
                            <div className="bg-white p-3 rounded-md border border-gray-200"><p className="text-3xl font-bold text-blue-700">{stats.candidates}</p><p className="text-xs text-gray-600 mt-1">кандидатов наук</p></div>
                            <div className="bg-white p-3 rounded-md border border-gray-200"><p className="text-3xl font-bold text-blue-700">{stats.students}</p><p className="text-xs text-gray-600 mt-1">студентов</p></div>
                        </div>
                     </div>
                </div>
            </div>

            <Section title="КАФЕДРЫ ФАКУЛЬТЕТА">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {facultyDepartments.map(dept => <DepartmentCard key={dept.id} department={dept} onNavigate={onNavigate}/>)}
                    {facultyDepartments.length === 0 && <p className="text-gray-500">В состав факультета не входит ни одной кафедры.</p>}
                </div>
            </Section>

            <Section title="ОБРАЗОВАТЕЛЬНЫЕ ПРОГРАММЫ">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {facultySpecialties.map(spec => <ProgramCard key={spec.id} specialty={spec}/>)}
                    {facultySpecialties.length === 0 && <p className="text-gray-500">За факультетом не закреплено ни одной образовательной программы.</p>}
                </div>
            </Section>

            <Section title="ПРОФЕССОРСКО-ПРЕПОДАВАТЕЛЬСКИЙ СОСТАВ">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {facultyTeachers.map(teacher => {
                        const teacherDepartment = store.departments.find(d => d.id === teacher.departmentId);
                        return <TeacherCard key={teacher.id} teacher={teacher} departmentName={teacherDepartment?.name || 'Кафедра не указана'}/>
                    })}
                     {facultyTeachers.length === 0 && <p className="text-gray-500">За факультетом не закреплено ни одного преподавателя.</p>}
                </div>
            </Section>
        </div>
    );
};

export default FacultyView;
