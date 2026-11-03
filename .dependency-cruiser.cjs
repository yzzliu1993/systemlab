module.exports = {
  forbidden: [
    {
      name: 'domain-cannot-depend-on-ui',
      comment: 'Domain logic must be framework-agnostic pure TypeScript',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(components|features|stores)' }
    },
    {
      name: 'infra-cannot-depend-on-ui',
      comment: 'Infrastructure layer should not import UI or features',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/(components|features)' }
    },
    {
      name: 'app-cannot-depend-on-harness',
      comment: 'The app must not import the development harness',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^harness/' }
    },
    {
      name: 'harness-cannot-depend-on-app',
      comment: 'The harness is a standalone tool and must not import app code',
      severity: 'error',
      from: { path: '^harness/' },
      to: { path: '^src/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' }
  }
};
