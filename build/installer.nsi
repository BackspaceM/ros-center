; ROS Center Windows installer (NSIS 3, Unicode)
; All __PLACEHOLDER__ values are substituted by build/windows-installer.js.
!include "MUI2.nsh"

Name "ROS Center __VERSION__"
OutFile "__OUTFILE__"
InstallDir "$PROGRAMFILES64\ROS Center"
InstallDirRegKey HKLM "Software\ROSCenter" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
Unicode true
ShowInstDetails show

Icon "__ICOFILE__"
UninstallIcon "__ICOFILE__"
!define MUI_ICON "__ICOFILE__"
!define MUI_UNICON "__ICOFILE__"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Start.bat"
!define MUI_FINISHPAGE_RUN_TEXT "启动 ROS Center"
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Section "ROS Center"
  SetOutPath "$INSTDIR"
  File /r "__STAGEDIR__\*.*"
  File "/oname=Start.bat" "__STARTBAT__"
  File "/oname=appicon.ico" "__ICOFILE__"

  ; 程序装在 Program Files（只读），配置与数据放在当前用户可写目录
  CreateDirectory "$LOCALAPPDATA\ROS Center"
  CopyFiles "$INSTDIR\config.example.env" "$LOCALAPPDATA\ROS Center\config.example.env"

  CreateDirectory "$SMPROGRAMS\ROS Center"
  CreateShortcut "$SMPROGRAMS\ROS Center\ROS Center.lnk" "$INSTDIR\Start.bat" "" "$INSTDIR\appicon.ico" 0
  CreateShortcut "$DESKTOP\ROS Center.lnk" "$INSTDIR\Start.bat" "" "$INSTDIR\appicon.ico" 0
  CreateShortcut "$SMPROGRAMS\ROS Center\卸载 ROS Center.lnk" "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\ROSCenter" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter" "DisplayName" "ROS Center __VERSION__"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter" "DisplayIcon" "$INSTDIR\appicon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter" "DisplayVersion" "__VERSION__"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter" "Publisher" "ROS Center"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter" "URLInfoAbout" "https://github.com/BackspaceM/ros-center"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\ROS Center\ROS Center.lnk"
  Delete "$SMPROGRAMS\ROS Center\卸载 ROS Center.lnk"
  RMDir "$SMPROGRAMS\ROS Center"
  Delete "$DESKTOP\ROS Center.lnk"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ROSCenter"
  DeleteRegKey HKLM "Software\ROSCenter"
  MessageBox MB_OK|MB_ICONINFORMATION "ROS Center 已卸载。$\r$\n配置与数据仍保留在 $LOCALAPPDATA\ROS Center，如需彻底清理请手动删除。"
SectionEnd
