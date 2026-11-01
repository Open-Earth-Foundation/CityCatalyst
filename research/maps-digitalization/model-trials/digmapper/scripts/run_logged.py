"""Run one bounded command and retain exact argv, timing, stdout and exit code."""
import datetime, json, os, pathlib, subprocess, sys, time
ROOT = pathlib.Path(__file__).resolve().parents[1]
name, timeout, cwd, *command = sys.argv[1:]
cwd = str(pathlib.Path(cwd).resolve())
if ('/' in command[0] or '\\' in command[0]) and not pathlib.Path(command[0]).is_absolute():
    command[0] = str((pathlib.Path(cwd) / command[0]).resolve())
env = os.environ.copy()
for key, subdir in {
    'UV_CACHE_DIR': '.uv-cache', 'PIP_CACHE_DIR': '.pip-cache',
    'TEMP': 'tmp', 'TMP': 'tmp', 'TORCH_HOME': '.torch',
    'HF_HOME': '.huggingface', 'XDG_CACHE_HOME': '.cache',
    'MPLCONFIGDIR': '.matplotlib', 'UV_PYTHON_INSTALL_DIR': '.python',
}.items():
    path = ROOT / subdir
    path.mkdir(exist_ok=True)
    env[key] = str(path)
env.update(PYTHONDONTWRITEBYTECODE='1', PYTHONUTF8='1', CUDA_VISIBLE_DEVICES='',
           OMP_NUM_THREADS='2', MKL_NUM_THREADS='2', MAX_JOBS='2',
           AWS_EC2_METADATA_DISABLED='true')
# Process-scoped Git setting; do not change the host's system configuration.
env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='core.longpaths', GIT_CONFIG_VALUE_0='true')
start = time.monotonic()
record = dict(argv=command, cwd=cwd, started_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), timeout_s=int(timeout))
log = ROOT / 'logs' / (name + '.log')
with log.open('w', encoding='utf-8') as f:
    f.write(json.dumps(record) + '\n'); f.flush()
    try:
        p = subprocess.run(command, cwd=cwd, env=env, stdout=f, stderr=subprocess.STDOUT, timeout=int(timeout))
        record['exit_code'] = p.returncode
    except subprocess.TimeoutExpired as e:
        record.update(exit_code=None, error='timeout', detail=str(e))
    except Exception as e:
        record.update(exit_code=None, error=repr(e))
record['elapsed_s'] = round(time.monotonic()-start, 3)
record['log'] = str(log.relative_to(ROOT))
(ROOT/'logs'/(name+'.json')).write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record, indent=2), flush=True)
print(log.read_text(encoding='utf-8', errors='replace')[-12000:])
sys.exit(record['exit_code'] if record['exit_code'] is not None else 124)
