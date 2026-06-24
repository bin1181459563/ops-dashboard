# Logs

Current startup scripts write fresh runtime logs here:

- `backend.log` — FastAPI / uvicorn output
- `frontend.log` — Next.js dev server output

Historical `stdout.log` and `stderr.log` files were moved to `logs/archive/`.
Those archived files may contain old HMR or port-conflict messages from earlier
manual runs and should not be treated as current failures unless reproduced in
the current `backend.log` or `frontend.log`.

Runtime `.log` files are ignored by `.gitignore`.
