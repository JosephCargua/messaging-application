export const environment = {
    production: false,
    apiUrl: 'http://localhost:3000',
    apiEndpoints: {
      auth: {
        login: '/auth/login',
        register: '/auth/register',
        refresh: '/auth/refresh',
        logout: '/auth/logout',
        google: '/auth/google',
        github: '/auth/github',
        microsoft: '/auth/microsoft',
        callback: '/auth/oauth/callback'
      },
      users: '/users'
    }
  };