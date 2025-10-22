export const environment = {
    production: true,
    apiUrl: 'https://your-production-api.com',
    apiEndpoints: {
      auth: {
        login: '/auth/login',
        register: '/auth/register',
        refresh: '/auth/refresh',
        logout: '/auth/logout',
        google: '/auth/google',
        github: '/auth/github',
        microsoft: '/auth/microsoft'
      },
      users: '/users'
    }
  };