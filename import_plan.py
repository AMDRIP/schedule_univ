# -*- coding: utf-8 -*-
import sys
import json
import pandas as pd

# Словарь для поиска нужных колонок по возможным названиям заголовков.
# Это делает парсер более гибким к разным форматам учебных планов.
HEADER_MAP = {
    'subjectName': ['дисциплина', 'наименование дисциплины', 'предмет'],
    'semester': ['семестр', 'сем.'],
    'lectureHours': ['лекции', 'лек.', 'лекционные часы'],
    'practiceHours': ['практика', 'практ.', 'практические занятия'],
    'labHours': ['лабораторные', 'лаб.', 'лабораторные работы'],
    'attestation': ['форма контроля', 'аттестация', 'контроль'],
    'splitForSubgroups': ['подгруппы', 'деление на подгруппы', 'деление']
}

def find_specialty(df):
    """Ищет название специальности в первых 10 строках файла."""
    for i in range(min(10, df.shape[0])):
        for j in range(df.shape[1]):
            cell_value = str(df.iloc[i, j])
            if 'специальность' in cell_value.lower():
                # Извлекаем текст после двоеточия или саму строку
                return cell_value.split(':')[-1].strip()
    return "Не найдена"

def find_headers(df, header_map):
    """Находит реальные названия колонок в DataFrame по ключевым словам."""
    mapped_headers = {}
    header_row = None

    # Поиск строки с заголовками
    for i in range(min(10, df.shape[0])):
        row_values = [str(v).lower() for v in df.iloc[i].values]
        # Считаем, что строка является заголовком, если в ней есть хотя бы 2 из наших ключевых слов
        matches = sum(1 for key in header_map for keyword in header_map[key] if keyword in row_values)
        if matches >= 2:
            header_row = i
            break
    
    if header_row is None:
        return None, -1

    df_columns = [str(c).lower() for c in df.iloc[header_row].values]
    
    for key, keywords in header_map.items():
        for keyword in keywords:
            try:
                index = df_columns.index(keyword)
                mapped_headers[key] = df.columns[index]
                break
            except ValueError:
                continue
    
    return mapped_headers, header_row

def parse_attestation(value):
    """Преобразует текстовую форму контроля в стандартный enum-вид."""
    val_lower = str(value).lower()
    if 'экзамен' in val_lower:
        return 'Экзамен'
    if 'диф' in val_lower:
        return 'Диф. зачёт'
    if 'зачет' in val_lower or 'зачёт' in val_lower:
        return 'Зачёт'
    return 'Зачёт' # По умолчанию

def parse_split(value):
    """Преобразует значение в колонке 'деление на подгруппы' в boolean."""
    val_lower = str(value).lower()
    return val_lower in ['да', 'yes', '+', '1', 'true']

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Путь к файлу не был передан."}), file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        # Используем openpyxl, т.к. он лучше работает с современными .xlsx
        df = pd.read_excel(file_path, header=None, engine='openpyxl')

        specialty_name = find_specialty(df)
        mapped_headers, header_row_index = find_headers(df, HEADER_MAP)

        if not mapped_headers or 'subjectName' not in mapped_headers:
            print(json.dumps({"error": "Не удалось найти необходимые колонки ('Дисциплина', 'Семестр' и т.д.)."}), file=sys.stderr)
            sys.exit(1)
            
        # Пропускаем строки до заголовков
        df_data = df.iloc[header_row_index + 1:]
        df_data.columns = df.iloc[header_row_index]


        plan_entries = []
        for index, row in df_data.iterrows():
            subject_name = row.get(mapped_headers.get('subjectName'))
            if pd.isna(subject_name) or not str(subject_name).strip():
                continue

            try:
                semester = int(row.get(mapped_headers.get('semester', 0)))
                
                # Получаем часы, обрабатывая пустые ячейки (NaN) как 0
                lecture_hours = int(row.get(mapped_headers.get('lectureHours'), 0) or 0)
                practice_hours = int(row.get(mapped_headers.get('practiceHours'), 0) or 0)
                lab_hours = int(row.get(mapped_headers.get('labHours'), 0) or 0)

                attestation = parse_attestation(row.get(mapped_headers.get('attestation'), ''))
                split = parse_split(row.get(mapped_headers.get('splitForSubgroups'), ''))

                plan_entries.append({
                    "subjectName": str(subject_name).strip(),
                    "semester": semester,
                    "lectureHours": lecture_hours,
                    "practiceHours": practice_hours,
                    "labHours": lab_hours,
                    "attestation": attestation,
                    "splitForSubgroups": split
                })
            except (ValueError, TypeError):
                # Пропускаем строки с некорректными числовыми данными
                continue
        
        result = {
            "specialtyName": specialty_name,
            "entries": plan_entries
        }
        
        print(json.dumps(result, ensure_ascii=False, indent=2))

    except FileNotFoundError:
        print(json.dumps({"error": f"Файл не найден: {file_path}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Произошла ошибка при обработке файла: {str(e)}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
