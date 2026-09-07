module.exports = {
  apps: [{
    name: 'analyse-api',
    cwd: '/opt/AnalyseStrategy',
    script: 'api/server.ts',
    interpreter: '/opt/AnalyseStrategy-runtime/node-v24.20.0-linux-x64/bin/node',
    node_args: ['--import', 'tsx'],
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    kill_timeout: 180000,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      REPORT_AUTO_UPDATE: 'true',
      TRUST_PROXY_LOOPBACK: 'true',
      APP_GIT_COMMIT: process.env.APP_GIT_COMMIT,
      APP_BUILD_TIME: process.env.APP_BUILD_TIME,
    },
  }],
};
