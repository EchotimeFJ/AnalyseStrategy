"""Update only the existing AnalyseStrategy managed locations; Python 3.6+."""
import datetime
import pathlib
import re
import shutil
import subprocess
import sys

config = pathlib.Path(sys.argv[1])
original = config.read_text()
begin = '# BEGIN ANALYSE_STRATEGY MANAGED'
end = '# END ANALYSE_STRATEGY MANAGED'
if original.count(begin) != 1 or original.count(end) != 1:
    raise SystemExit('Expected exactly one AnalyseStrategy managed block')
start, stop = original.index(begin), original.index(end)
block = original[start:stop]
if 'proxy_pass http://127.0.0.1:3003/api/;' not in block:
    raise SystemExit('Unexpected AnalyseStrategy API upstream')

def api_location(match):
    body = match.group(0)
    body, count = re.subn(r'proxy_set_header X-Forwarded-For [^;]+;',
                         'proxy_set_header X-Forwarded-For $remote_addr;', body)
    if count != 1:
        raise SystemExit('Expected one forwarded address header')
    for setting in ('proxy_buffering off;', 'client_max_body_size 64k;', 'proxy_read_timeout 180s;'):
        if setting not in body:
            body = body[:-1] + '    ' + setting + '\n    }'
    return body

block, count = re.subn(r'location \^~ /analyse-strategy/api/ \{[^}]+\}', api_location, block)
if count != 1:
    raise SystemExit('Expected one AnalyseStrategy API location')
include = 'include /opt/AnalyseStrategy/deploy/nginx-security.conf;'

def static_location(match):
    body = match.group(0)
    return body if include in body else body[:-1] + '    ' + include + '\n    }'

block, count = re.subn(r'location (?:\^~ /analyse-strategy/(?:assets/)?|= /analyse-strategy/index\.html) \{[^}]+\}', static_location, block)
if count != 3:
    raise SystemExit('Expected three AnalyseStrategy static locations')
updated = original[:start] + block + original[stop:]
if updated != original:
    backup = str(config) + '.analyse-' + datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%S') + '.bak'
    shutil.copy2(str(config), backup)
    config.write_text(updated)
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['nginx', '-s', 'reload'], check=True)
    except Exception:
        config.write_text(original)
        raise
    print('AnalyseStrategy locations updated; backup:', backup)
else:
    subprocess.run(['nginx', '-t'], check=True)
    print('AnalyseStrategy locations already configured')
