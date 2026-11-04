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
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' }
  }
};
