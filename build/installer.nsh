; Falcon als Browser bei Windows registrieren, damit er unter
; Einstellungen → Apps → Standard-Apps erscheint (http, https, .html, .pdf …).
; SHCTX = HKCU bei Installation für den aktuellen Benutzer, HKLM bei Installation für alle.

!macro FalconRegisterBrowser
  !define /ifndef FALCON_EXE "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr SHCTX "Software\Classes\FalconURL" "" "Falcon URL"
  WriteRegStr SHCTX "Software\Classes\FalconURL" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\FalconURL\DefaultIcon" "" '"${FALCON_EXE}",0'
  WriteRegStr SHCTX "Software\Classes\FalconURL\shell\open\command" "" '"${FALCON_EXE}" "%1"'

  WriteRegStr SHCTX "Software\Classes\FalconHTML" "" "Falcon HTML Document"
  WriteRegStr SHCTX "Software\Classes\FalconHTML\DefaultIcon" "" '"${FALCON_EXE}",0'
  WriteRegStr SHCTX "Software\Classes\FalconHTML\shell\open\command" "" '"${FALCON_EXE}" "%1"'

  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon" "" "Falcon"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\DefaultIcon" "" '"${FALCON_EXE}",0'
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\shell\open\command" "" '"${FALCON_EXE}"'
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities" "ApplicationName" "Falcon"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities" "ApplicationDescription" "A fast, focused Chromium browser built for gamers."
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities" "ApplicationIcon" '"${FALCON_EXE}",0'
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\StartMenu" "StartMenuInternet" "Falcon"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\URLAssociations" "http" "FalconURL"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\URLAssociations" "https" "FalconURL"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".htm" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".html" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".shtml" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".xht" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".xhtml" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".svg" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".webp" "FalconHTML"
  WriteRegStr SHCTX "Software\Clients\StartMenuInternet\Falcon\Capabilities\FileAssociations" ".pdf" "FalconHTML"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Falcon" "Software\Clients\StartMenuInternet\Falcon\Capabilities"
  ; Explorer und die Einstellungen über die neue Zuordnung informieren
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customInstall
  !insertmacro FalconRegisterBrowser
!macroend

; Beim Deinstallieren die Registrierung wieder entfernen (beide Bereiche, auch Einträge aus Falcon selbst)
!macro customUnInstall
  ; Bei Updates bleibt die Registrierung bestehen
  ${ifNot} ${isUpdated}
    DeleteRegKey SHCTX "Software\Clients\StartMenuInternet\Falcon"
    DeleteRegValue SHCTX "Software\RegisteredApplications" "Falcon"
    DeleteRegKey SHCTX "Software\Classes\FalconURL"
    DeleteRegKey SHCTX "Software\Classes\FalconHTML"
    DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Falcon"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Falcon"
    DeleteRegKey HKCU "Software\Classes\FalconURL"
    DeleteRegKey HKCU "Software\Classes\FalconHTML"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${endIf}
!macroend
