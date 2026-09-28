' Lanza subir-github.bat sin abrir ninguna ventana (lo usa la tarea de Windows).
Dim fso, dir
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & dir & "\subir-github.bat""", 0, False
