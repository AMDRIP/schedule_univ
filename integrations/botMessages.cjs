const DEFAULT_OPTIONS = { format: 'html', layout: 'detailed', showTeacher: true, showRoom: true };
const escapeHTML = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (value, max = 250) => String(value || '').replace(/[\r\n]+/g, ' ').slice(0, max);
function writer(options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    const text = (value, max = 250) => {
        let result = '';
        for (const character of clean(value, max)) {
            const piece = settings.format === 'html' ? escapeHTML(character) : character;
            if (result.length + piece.length > max - 3) return result + '...';
            result += piece;
        }
        return result;
    };
    const bold = value => settings.format === 'html' ? `<b>${text(value)}</b>` : text(value);
    return { settings, text, bold };
}
const dateLabel = date => {
    const label = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
    return label[0].toUpperCase() + label.slice(1);
};
function lessonText(item, choice, options = {}) {
    const { settings, text, bold } = writer(options);
    const lines = [`${bold(`${item.startTime}-${item.endTime}`)}  ${bold(item.subjectName)}`, text(item.classType, 70)];
    if (settings.showRoom) lines[1] += ` | ${text(item.classroomName, 140)}`;
    if (settings.showTeacher && choice?.kind !== 'teacher') lines.push((settings.layout === 'detailed' ? 'Преподаватель: ' : '') + (item.teacherNames || []).slice(0, 3).map(name => text(name, 90)).join(', ') + (item.teacherNames?.length > 3 ? `; ещё ${item.teacherNames.length - 3}` : ''));
    if (choice?.kind !== 'group') lines.push('Группы: ' + (item.groupNames || []).slice(0, 6).map(name => text(name, 50)).join(', ') + (item.groupNames?.length > 6 ? `; ещё ${item.groupNames.length - 6}` : ''));
    if (item.subgroupName) lines.push('Подгруппа: ' + text(item.subgroupName, 100));
    if (item.deliveryMode === 'Онлайн') lines.push('Онлайн');
    return lines.filter(Boolean).join('\n');
}
function packBlocks(header, blocks, footer = '') {
    const messages = []; let current = header;
    for (const block of blocks) {
        if (current.length + block.length + footer.length + 4 > 3500 && current !== header) { messages.push(current + footer); current = header; }
        current += '\n\n' + block;
    }
    messages.push(current + footer); return messages;
}
function scheduleMessages(response, choice, period, options = {}) {
    const { bold } = writer(options); const title = bold(choice.name); const footer = `\n\nОпубликовано: v${response.version}`;
    const lessons = [...response.lessons].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.subjectName.localeCompare(b.subjectName));
    if (!lessons.length) return [`${title}\n${period.from === period.to ? dateLabel(period.from) : `${dateLabel(period.from)} - ${dateLabel(period.to)}`}\n\nЗанятий нет.${footer}`];
    const days = new Map(); lessons.forEach(item => { if (!days.has(item.date)) days.set(item.date, []); days.get(item.date).push(item); });
    return [...days].flatMap(([date, items]) => packBlocks(`${title}\n${bold(dateLabel(date))}`, items.map(item => lessonText(item, choice, options)), footer));
}
function changesMessages(changes, choice, version, options = {}) {
    const { bold } = writer(options); const blocks = [];
    changes.added.slice(0, 10).forEach(item => blocks.push(`${bold('Добавлено')} | ${dateLabel(item.date)}\n${lessonText(item, choice, options)}`));
    changes.removed.slice(0, 10).forEach(item => blocks.push(`${bold('Отменено')} | ${dateLabel(item.date)}\n${lessonText(item, choice, options)}`));
    changes.changed.slice(0, 10).forEach(item => blocks.push(`${bold('Было:')} ${dateLabel(item.before.date)}\n${lessonText(item.before, choice, options)}\n\n${bold('Стало:')} ${dateLabel(item.after.date)}\n${lessonText(item.after, choice, options)}`));
    const total = changes.added.length + changes.removed.length + changes.changed.length;
    if (total > blocks.length) blocks.push(`Ещё изменений: ${total - blocks.length}. Откройте расписание кнопкой «На неделю».`);
    return packBlocks(`${bold(choice.name)}\nВерсия ${version}\nДобавлено: ${changes.added.length}; отменено: ${changes.removed.length}; изменено: ${changes.changed.length}.`, blocks.length ? blocks : ['Изменений нет.']);
}
module.exports = { DEFAULT_OPTIONS, escapeHTML, writer, dateLabel, lessonText, packBlocks, scheduleMessages, changesMessages };
