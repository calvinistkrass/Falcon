; Beim Deinstallieren die Standardbrowser-Registrierung von Falcon entfernen
!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Falcon"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Falcon"
  DeleteRegKey HKCU "Software\Classes\FalconURL"
  DeleteRegKey HKCU "Software\Classes\FalconHTML"
!macroend
