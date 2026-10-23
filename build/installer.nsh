!include nsDialogs.nsh

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Установка приложения Расписание ВУЗ"
  !define MUI_WELCOMEPAGE_TEXT "Версия 6001.2310.2026$\r$\n$\r$\nМастер установит приложение и зарегистрирует файлы .schd.$\r$\n$\r$\nПеред обновлением сохраните проекты и отдельную копию важных данных."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom ScheduleReviewPage

Function ScheduleReviewPage
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Параметры установки и данные" "Проверьте расположение и политику сохранения проектов."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 18u "Расписание ВУЗ 6001.2310.2026"
  Pop $0
  ${NSD_CreateLabel} 0 24u 100% 28u "Папка приложения:$\r$\n$INSTDIR"
  Pop $0
  ${NSD_CreateLabel} 0 58u 100% 40u "Проекты .schd хранятся в выбранных вами папках. До десяти предыдущих версий сохраняются рядом в каталоге <имя проекта>.backups."
  Pop $0
  ${NSD_CreateLabel} 0 105u 100% 36u "Обновление и удаление приложения не удаляют проекты и данные Telegram-бота. Windows не получает новых правил брандмауэра или служб."
  Pop $0
  nsDialogs::Show
FunctionEnd
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Удаление приложения Расписание ВУЗ"
  !define MUI_WELCOMEPAGE_TEXT "Будут удалены файлы приложения и его ярлыки.$\r$\n$\r$\nПроекты, резервные копии и каталог пользовательских данных сохраняются. Секреты бота при необходимости удалите в приложении перед удалением."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
