"""Conecta la carpeta de Pelimatch con un repositorio de tu GitHub y lo sube.

Lo lanza conectar-github.bat (doble clic). Pasos:
  1. Pide a Git Credential Manager tus credenciales de GitHub. La primera vez se
     abre el navegador para que inicies sesión y autorices a Git; este script
     nunca ve ni guarda tu contraseña, solo usa el token que devuelve Git.
  2. Crea el repositorio (público o privado; si ya existe, lo reutiliza).
  3. Configura el remoto "origin" y hace push de la rama main.

Uso: python tools/github/conectar.py [nombre-del-repo] [publico|privado]
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = os.environ.get("PELIMATCH_GITHUB_API", "https://api.github.com")
WEB = os.environ.get("PELIMATCH_GITHUB_WEB", "https://github.com")
HOST = WEB.split("://", 1)[-1].split("/", 1)[0]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DESCRIPCION = "Pelimatch: un Tinder de películas para parejas, con lo que habéis visto en Letterboxd"
SECRETOS = ("server/.env", "app/.env", ".env", ".pelimatch-deploy")


def git(*args, input=None, check=True):
    r = subprocess.run(["git", *args], cwd=ROOT, input=input, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"\n  Error en 'git {' '.join(args)}':\n  {r.stderr.strip() or r.stdout.strip()}")
    return r


def api(method, path, token, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "pelimatch-conectar",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read() or b"{}")
        except ValueError:
            data = {}
        return e.code, data


def credenciales():
    req = f"protocol=https\nhost={HOST}\n\n"
    r = git("credential", "fill", input=req, check=False)
    if r.returncode != 0:
        raise SystemExit("\n  No se pudo iniciar sesión en GitHub (¿cerraste la ventana del navegador?). Vuelve a intentarlo.")
    campos = dict(line.split("=", 1) for line in r.stdout.splitlines() if "=" in line)
    if not campos.get("password"):
        raise SystemExit("\n  Git no devolvió credenciales de GitHub.")
    return req, campos


def main():
    nombre = (sys.argv[1] if len(sys.argv) > 1 else "").strip() or "pelimatch"
    privado = (sys.argv[2] if len(sys.argv) > 2 else "publico").strip().lower().startswith("priv")

    if git("rev-parse", "--is-inside-work-tree", check=False).returncode != 0:
        raise SystemExit("\n  Esta carpeta no es un repositorio git.")
    rama = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if rama != "main":
        raise SystemExit(f"\n  Estás en la rama '{rama}'. Cambia a 'main' y vuelve a ejecutarlo.")

    # Seguridad: nada de secretos en el repositorio.
    for secreto in SECRETOS:
        if git("ls-files", "--error-unmatch", secreto, check=False).returncode == 0:
            raise SystemExit(f"\n  '{secreto}' está en git y no debe subirse. Sácalo del repositorio antes de continuar.")

    print("  Iniciando sesión en GitHub (si es la primera vez se abrirá el navegador)...")
    req, cred = credenciales()
    token = cred["password"]

    status, yo = api("GET", "/user", token)
    if status != 200:
        git("credential", "reject", input=req, check=False)
        raise SystemExit(f"\n  GitHub rechazó las credenciales ({status}). Vuelve a ejecutarlo para iniciar sesión de nuevo.")
    login = yo["login"]
    print(f"  Sesión iniciada como {login}.")

    tipo = "privado" if privado else "público"
    status, repo = api("POST", "/user/repos", token, {
        "name": nombre, "private": privado, "description": DESCRIPCION,
        "has_wiki": False, "auto_init": False,
    })
    if status == 201:
        print(f"  Repositorio {tipo} creado: {login}/{nombre}")
    elif status == 422:
        status, repo = api("GET", f"/repos/{login}/{nombre}", token)
        if status != 200:
            raise SystemExit(f"\n  No se pudo crear ni leer el repositorio {login}/{nombre} ({status}).")
        actual = "privado" if repo.get("private") else "público"
        print(f"  El repositorio {login}/{nombre} ya existía ({actual}): lo reutilizo.")
    else:
        msg = repo.get("message", "")
        raise SystemExit(f"\n  GitHub no dejó crear el repositorio ({status}): {msg}")

    # Guarda la sesión en Git Credential Manager para los push automáticos de cada hora.
    git("credential", "approve", input="".join(f"{k}={v}\n" for k, v in cred.items()) + "\n", check=False)

    url = f"{WEB}/{login}/{nombre}.git"
    if git("remote", "get-url", "origin", check=False).returncode == 0:
        git("remote", "set-url", "origin", url)
    else:
        git("remote", "add", "origin", url)

    print("  Subiendo el código...")
    r = git("push", "-u", "origin", "main", check=False)
    if r.returncode != 0:
        raise SystemExit(f"\n  El push falló:\n  {r.stderr.strip()}")
    print(f"\n  Listo: {WEB}/{login}/{nombre}")


if __name__ == "__main__":
    main()
