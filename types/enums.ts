export enum Role {
    Student = 'Студент',
    Teacher = 'Преподаватель',
    Methodist = 'Методист',
    Admin = 'Администратор',
}

export enum ClassType {
    Lecture = 'Лекция',
    Practical = 'Практика',
    Lab = 'Лабораторная',
    Consultation = 'Консультация',
    Test = 'Зачёт',
    Exam = 'Экзамен',
    Elective = 'Факультатив',
}

export enum AvailabilityType {
    Allowed = 'Разрешено',
    Desirable = 'Желательно',
    Undesirable = 'Нежелательно',
    Forbidden = 'Запрещено',
}

export enum AttestationType {
    Exam = 'Экзамен',
    Test = 'Зачёт',
    DifferentiatedTest = 'Диф. зачёт',
}

export enum FormOfStudy {
    FullTime = 'Очная',
    PartTime = 'Заочная',
    Mixed = 'Очно-заочная',
}

export enum DeliveryMode {
    Offline = 'Офлайн',
    Online = 'Онлайн',
}

export enum AcademicDegree {
    Candidate = 'Кандидат наук',
    Doctor = 'Доктор наук',
}

export enum FieldOfScience {
    Agricultural = 'сельскохозяйственных',
    Architectural = 'архитектуры',
    Biological = 'биологических',
    Chemical = 'химических',
    Culturology = 'культурологии',
    Economic = 'экономических',
    Engineering = 'технических',
    Geographical = 'географических',
    GeologicalMineralogical = 'геолого-минералогических',
    Historical = 'исторических',
    ArtHistory = 'искусствоведения',
    Juridical = 'юридических',
    Medical = 'медицинских',
    Pedagogical = 'педагогических',
    Pharmaceutical = 'фармацевтических',
    Philological = 'филологических',
    Philosophical = 'философских',
    PhysicalMathematical = 'физико-математических',
    Political = 'политических',
    Psychological = 'психологических',
    Sociological = 'социологических',
    Theology = 'теологии',
    Veterinary = 'ветеринарных',
}

export enum AcademicTitle {
    Assistant = 'Ассистент',
    Teacher = 'Преподаватель',
    SeniorTeacher = 'Старший преподаватель',
    Docent = 'Доцент',
    Professor = 'Профессор',
    SeniorResearcher = 'Старший научный сотрудник',
}

export enum RuleSeverity {
    Strict = 'Строгое требование (нельзя нарушать)',
    Strong = 'Сильное предпочтение',
    Medium = 'Среднее предпочтение',
    Weak = 'Слабое предпочтение',
}

export enum RuleAction {
    AvoidTime = 'Избегать времени/дня',
    RequireTime = 'Требовать время/день',
    PreferTime = 'Предпочитать время/день',
    SameDay = 'Размещать в один день',
    DifferentDay = 'Размещать в разные дни',
    Consecutive = 'Размещать пары подряд',
    MaxPerDay = 'Максимум пар в день',
    MinPerDay = 'Минимум пар в день',
    MaxConsecutive = 'Максимум пар подряд',
    AtMostNGaps = 'Не более N "окон" в день',
    Order = 'Определенный порядок (A перед B)',
    NoOverlap = 'Не пересекать с (по времени)',
    StartAfter = 'Начинать не ранее',
    EndBefore = 'Заканчивать не позднее',
}

export type RuleEntityType = 'teacher' | 'group' | 'subject' | 'classroom' | 'classType' | 'department';

export type RuleLogicalOperator = 'AND' | 'OR';

export enum ProductionCalendarEventType {
    Holiday = 'Государственный праздник',
    PreHoliday = 'Предпраздничный день',
    MovedHoliday = 'Перенесенный выходной',
    RegionalHoliday = 'Региональный праздник',
    SpecialWorkday = 'Особый рабочий день',
}
